import { NextRequest, NextResponse } from "next/server";
import {
  cancelCalls,
  ensureSchema,
  getSession,
  getSetting,
  saveSession,
  setSetting,
  sql,
  validTwilioRequest,
  waveWinner,
} from "@/lib/dialer/core";

// Twilio status callback for both legs. Lead legs update the call log only
// (wave/winner state is derived from dialer_calls + the claim key, so this
// webhook never touches the session JSON for lead calls). An answered agent
// leg unlocks dialing; a completed one ends the session.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const kind = url.searchParams.get("kind") || "lead";
  const callSid = form.get("CallSid") || "";
  const status = form.get("CallStatus") || "";
  const duration = Number(form.get("CallDuration") || 0);

  if (kind === "agent") {
    const session = await getSession();
    if (session?.agentCallSid === callSid) {
      if (status === "in-progress") {
        await setSetting("agent_answered", "1");
      } else if (["completed", "failed", "no-answer", "busy", "canceled"].includes(status)) {
        await saveSession(null);
        await setSetting("agent_answered", "");
      }
    }
    return NextResponse.json({ ok: true });
  }

  // The browser leg (Voice SDK via the TwiML App). A dead browser leg — tab
  // closed, network dropped — must end the session, or auto-dial keeps waving
  // leads into an empty conference.
  if (kind === "browser-agent") {
    const browserSid = await getSetting("browser_agent_sid");
    if (callSid && callSid === browserSid) {
      if (["completed", "failed", "no-answer", "busy", "canceled"].includes(status)) {
        const session = await getSession();
        if (session) await cancelCalls((session.wave || []).map((w) => w.callSid).filter(Boolean));
        await saveSession(null);
        await setSetting("agent_answered", "");
        await setSetting("browser_agent_sid", "");
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (callSid) {
    await sql()`
      UPDATE dialer_calls
      SET status = ${status}, duration_seconds = GREATEST(duration_seconds, ${duration})
      WHERE call_sid = ${callSid}`;

    // Safe auto-marking on terminal lead calls: machine → voicemail, rang out
    // → no_answer. Only ever touches auto-marked statuses (new, or a prior
    // voicemail/no-answer being retried) — human judgments (interested, not
    // interested, callback…) are never set automatically.
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
      const rows = (await sql()`
        SELECT c.amd, l.id AS lead_id, l.name, l.business, l.status AS lead_status
        FROM dialer_calls c JOIN dialer_leads l ON l.id = c.lead_id
        WHERE c.call_sid = ${callSid}`) as any[];
      const r = rows[0];
      const AUTO_STATUSES = ["new", "voicemail", "no_answer"];
      if (r && AUTO_STATUSES.includes(r.lead_status)) {
        let outcome = "";
        if ((r.amd || "").startsWith("machine")) {
          await sql()`UPDATE dialer_leads SET status = 'voicemail', updated_at = now() WHERE id = ${r.lead_id} AND status = ANY(${AUTO_STATUSES as unknown as string[]})`;
          outcome = "voicemail";
        } else if (["no-answer", "busy"].includes(status)) {
          // NOT "canceled": that's a wave loser WE hung up (or End session) —
          // those re-queue for another attempt instead of burning the lead.
          await sql()`UPDATE dialer_leads SET status = 'no_answer', updated_at = now() WHERE id = ${r.lead_id} AND status = ANY(${AUTO_STATUSES as unknown as string[]})`;
          outcome = "no_answer";
        }
        // Record what just happened (tagged with the live wave) so the UI can
        // show "Last: <business> → No answer" as it advances — nothing is
        // skipped silently. Only stamp when this call actually belongs to the
        // live wave: a delayed/out-of-order webhook for a prior wave must not
        // mis-tag the current one (which could false-resolve a live winner).
        if (outcome) {
          const session = await getSession();
          if (session?.active && (session.wave || []).some((w) => w.callSid === callSid)) {
            // Only the wave's actual winner (or a fully unanswered wave — no
            // winner claimed) may write the outcome stamp: an answered LOSER
            // finishing after the winner must never overwrite the winner's
            // result, which desynced the auto-advance.
            const winnerSid = session.waveId ? await waveWinner(session.waveId) : "";
            if (!winnerSid || winnerSid === callSid) {
              await setSetting(
                "last_auto_outcome",
                JSON.stringify({
                  waveId: session.waveId,
                  leadId: r.lead_id,
                  name: r.name,
                  business: r.business,
                  outcome,
                })
              );
            }
          }
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
