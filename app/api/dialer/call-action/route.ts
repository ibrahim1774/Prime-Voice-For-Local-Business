import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  cancelCalls,
  ensureSchema,
  getSession,
  isAuthed,
  setSetting,
  sql,
  twilio,
  unauthorized,
  waveWinner,
  webhookToken,
} from "@/lib/dialer/core";

// POST { action: "vmdrop" | "hangup" | "skip" } — controls the live wave.
// vmdrop/hangup act on the winning call; skip ("Next lead →") ends whatever
// the wave is doing — connected or still ringing — and lets the UI advance.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  const winnerSid = session?.waveId ? await waveWinner(session.waveId) : "";
  const body = await request.json().catch(() => ({}));

  if (body.action === "skip") {
    if (!session?.active || !session.waveId) {
      return NextResponse.json({ error: "No wave in progress" }, { status: 409 });
    }
    // What the agent was looking at when they clicked. "connected" means they
    // deliberately skipped something they could hear (voicemail the verdict
    // missed, iPhone call-screening robot) — auto-mark it. "ringing" means
    // nobody had answered on their screen: if a human happened to answer in
    // the same instant, never mislabel them no_answer — leave the status
    // alone and let the retry gap defer them.
    const context = body.context === "connected" ? "connected" : "ringing";
    const AUTO_STATUSES = ["new", "voicemail", "no_answer"];
    const waveId = session.waveId;
    const resolveSkipped = async (sid: string) => {
      const rows = (await sql()`
        SELECT c.amd, l.id, l.name, l.business, l.status
        FROM dialer_calls c JOIN dialer_leads l ON l.id = c.lead_id
        WHERE c.call_sid = ${sid}`) as any[];
      const r = rows[0];
      if (!r) return;
      let outcome = "skipped";
      if (AUTO_STATUSES.includes(r.status)) {
        const machine = (r.amd || "").startsWith("machine");
        if (machine) outcome = "voicemail";
        else if (context === "connected") outcome = "no_answer";
        if (outcome !== "skipped") {
          await sql()`
            UPDATE dialer_leads SET status = ${outcome}, updated_at = now()
            WHERE id = ${r.id} AND status = ANY(${AUTO_STATUSES as unknown as string[]})`;
        }
      }
      // Stamp regardless — this is what lets the UI advance with no mark card.
      await setSetting(
        "last_auto_outcome",
        JSON.stringify({ waveId, leadId: r.id, name: r.name, business: r.business, outcome })
      );
    };

    const waveSids = (session.wave || []).map((w) => w.callSid).filter(Boolean);
    if (winnerSid) {
      await resolveSkipped(winnerSid);
      try {
        await twilio(`/Calls/${winnerSid}.json`, { Status: "completed" });
      } catch {
        // already ended
      }
      await sql()`UPDATE dialer_calls SET status = 'completed' WHERE call_sid = ${winnerSid}`;
      await cancelCalls(waveSids.filter((sid) => sid !== winnerSid));
    } else {
      // Nobody answered yet: cancel every ringing leg. Canceled legs keep
      // their status and last_dialed_at, so they re-queue after the gap.
      await cancelCalls(waveSids);
      // A lead may have claimed the wave in the instant between our winner
      // read and the cancel — resolve it too, or the UI would stall on a
      // mark card for a call the agent never heard.
      const lateWinner = await waveWinner(waveId);
      if (lateWinner) await resolveSkipped(lateWinner);
    }
    // Record the teardown ourselves too — waiting on Twilio's webhooks would
    // make the immediate "dial next" read the wave as still live and 409.
    if (waveSids.length) {
      await sql()`
        UPDATE dialer_calls SET status = 'canceled'
        WHERE call_sid = ANY(${waveSids as unknown as string[]})
          AND status IN ('dialing', 'ringing', 'queued', 'initiated')`;
    }
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!session?.active || !winnerSid) {
    return NextResponse.json({ error: "No call in progress" }, { status: 409 });
  }

  try {
    if (body.action === "vmdrop") {
      // Redirect the lead leg to the voicemail script, then it hangs up.
      await twilio(`/Calls/${winnerSid}.json`, {
        Url: `${BASE_URL}/api/dialer/twiml/vmdrop?t=${webhookToken()}`,
        Method: "POST",
      });
      return NextResponse.json({ ok: true, dropped: true });
    }
    if (body.action === "hangup") {
      await twilio(`/Calls/${winnerSid}.json`, { Status: "completed" });
      // Record it ourselves too: if Twilio's status callback goes missing the
      // wave would otherwise read as live forever and block the next dial.
      await sql()`
        UPDATE dialer_calls SET status = 'completed' WHERE call_sid = ${winnerSid}`;
      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Call action failed (call may have already ended)" },
      { status: 502 }
    );
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
