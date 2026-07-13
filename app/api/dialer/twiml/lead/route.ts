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

  // Lost the race after answering: end the leg instantly (no message — user's
  // call, matching Kixie's parallel-dial behavior) and flag it so the Calls
  // tab never lists it as a conversation. The lead KEEPS its last_dialed_at:
  // the retry gap must apply to lost races too, or they jump straight back to
  // the front of the next wave and the dialer cycles the same numbers forever
  // (the repeat-voicemail bug). wave_lost still keeps it from burning an
  // attempt, so it re-queues fairly after the gap.
  if (callSid) {
    // Synchronous on purpose: if this flag were deferred and lost, the leg
    // would burn an attempt and show up as a "conversation" in Calls.
    await sql()`UPDATE dialer_calls SET wave_lost = TRUE WHERE call_sid = ${callSid}`;
  }
  return twimlResponse(`<Hangup/>`);
}
