import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  getSession,
  getSetting,
  setSetting,
  sql,
  twilio,
  validTwilioRequest,
  waveWinner,
  webhookToken,
} from "@/lib/dialer/core";

// Async answering-machine-detection callback. Labels the call human/machine,
// and — when the machine is the leg we're bridged to — auto-handles the
// voicemail so the agent never gets stranded listening to a greeting:
// mark the lead "voicemail", end (or drop into) the call, and let the UI
// advance to the next lead. Gated by vm_mode (listen | skip | drop).
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const callSid = form.get("CallSid") || "";
  const answeredBy = form.get("AnsweredBy") || "";
  if (callSid && answeredBy) {
    await sql()`UPDATE dialer_calls SET amd = ${answeredBy} WHERE call_sid = ${callSid}`;
  }

  // Only act on a real machine on the call we're actually connected to.
  if (callSid && answeredBy.startsWith("machine")) {
    const vmMode = (await getSetting("vm_mode")) || "skip"; // listen | skip | drop
    if (vmMode !== "listen") {
      const session = await getSession();
      const winnerSid = session?.waveId ? await waveWinner(session.waveId) : "";
      if (session?.active && winnerSid && winnerSid === callSid) {
        const rows = (await sql()`
          SELECT l.id, l.name, l.business, l.status
          FROM dialer_calls c JOIN dialer_leads l ON l.id = c.lead_id
          WHERE c.call_sid = ${callSid}`) as any[];
        const r = rows[0];
        // Only ever act on a still-'new' lead. If the agent already marked it
        // (interested, callback…) mid-call, a late or false "machine" verdict
        // must NEVER cut them off or overwrite their judgment — this is the
        // guard that keeps a real human from being hung up and mislabeled.
        if (r && r.status === "new") {
          await sql()`UPDATE dialer_leads SET status = 'voicemail', updated_at = now() WHERE id = ${r.id} AND status = 'new'`;
          // Tagged with waveId so the client advances exactly once for this
          // wave and ignores stale outcomes — no skipped or repeated leads.
          await setSetting(
            "last_auto_outcome",
            JSON.stringify({
              waveId: session.waveId,
              leadId: r.id,
              name: r.name,
              business: r.business,
              outcome: "voicemail",
            })
          );
          try {
            if (vmMode === "drop") {
              // Redirect the lead leg to the voicemail script (it hangs up after).
              await twilio(`/Calls/${callSid}.json`, {
                Url: `${BASE_URL}/api/dialer/twiml/vmdrop?t=${webhookToken()}`,
                Method: "POST",
              });
            } else {
              await twilio(`/Calls/${callSid}.json`, { Status: "completed" });
              await sql()`UPDATE dialer_calls SET status = 'completed' WHERE call_sid = ${callSid}`;
            }
          } catch {
            // Call already ended — the status callback will finish teardown.
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
