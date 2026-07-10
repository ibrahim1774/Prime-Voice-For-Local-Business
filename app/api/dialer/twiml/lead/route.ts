import { NextRequest } from "next/server";
import { after } from "next/server";
import {
  claimWave,
  ensureSchema,
  sql,
  twilio,
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
    // Cancel the still-ringing siblings the moment we know we have a winner.
    after(async () => {
      if (!callSid) return;
      const siblings = (await sql()`
        SELECT c.call_sid FROM dialer_calls c
        WHERE c.call_sid <> ${callSid}
          AND c.started_at > now() - interval '3 minutes'
          AND c.status NOT IN ('completed','busy','failed','no-answer','canceled')`) as any[];
      for (const s of siblings) {
        try {
          await twilio(`/Calls/${s.call_sid}.json`, { Status: "completed" });
        } catch {}
      }
    });
    return twimlResponse(
      `<Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="">${conference}</Conference></Dial>`
    );
  }

  // Lost the race after answering: identify ourselves briefly and re-queue.
  after(async () => {
    if (!callSid) return;
    await sql()`
      UPDATE dialer_leads SET last_dialed_at = NULL
      WHERE id = (SELECT lead_id FROM dialer_calls WHERE call_sid = ${callSid})
        AND status = 'new'`;
  });
  return twimlResponse(
    `<Say voice="Polly.Matthew">Sorry, we just missed you — this is Ibrahim with Montivaro. We will try you again shortly. Thanks!</Say><Hangup/>`
  );
}
