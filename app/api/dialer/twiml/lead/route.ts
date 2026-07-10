import { NextRequest } from "next/server";
import { after } from "next/server";
import {
  cancelCalls,
  claimWave,
  ensureSchema,
  getSession,
  sql,
  twimlResponse,
  validTwilioRequest,
  xmlEscape,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// Answered lead leg. In a parallel wave, the first answer atomically claims
// the conference; losers hear a short identified apology (never dead air —
// that's what earns spam flags) and are re-queued for another attempt.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const conference = xmlEscape(url.searchParams.get("c") || "dialer");
  const waveId = url.searchParams.get("w") || "";
  const callSid = form.get("CallSid") || "";

  const won = waveId && callSid ? await claimWave(waveId, callSid) : true;

  if (won) {
    // Cancel this wave's other calls the moment we have a winner. Scoped to
    // the session's own wave list — a time-window sweep would eventually
    // hang up a live conversation from an earlier wave.
    after(async () => {
      if (!callSid) return;
      const session = await getSession();
      const siblings = (session?.wave || [])
        .map((w) => w.callSid)
        .filter((sid) => sid && sid !== callSid);
      await cancelCalls(siblings);
    });
    return twimlResponse(
      `<Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="">${conference}</Conference></Dial>`
    );
  }

  // Lost the race after answering: identify ourselves briefly and re-queue.
  after(async () => {
    if (!callSid) return;
    // Flag it so the Calls tab never lists the apology as a "conversation".
    await sql()`UPDATE dialer_calls SET wave_lost = TRUE WHERE call_sid = ${callSid}`;
    await sql()`
      UPDATE dialer_leads SET last_dialed_at = NULL
      WHERE id = (SELECT lead_id FROM dialer_calls WHERE call_sid = ${callSid})
        AND status = 'new'`;
  });
  return twimlResponse(
    `<Say voice="Polly.Matthew">Sorry, we just missed you — this is Ibrahim with Montivaro. We will try you again shortly. Thanks!</Say><Hangup/>`
  );
}
