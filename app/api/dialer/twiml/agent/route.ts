import { NextRequest } from "next/server";
import { twimlResponse, validTwilioRequest, xmlEscape } from "@/lib/dialer/core";

// TwiML for the agent (your phone) leg: park in the session conference.
// endConferenceOnExit — hanging up your phone ends the whole session's audio.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  const conference = xmlEscape(url.searchParams.get("c") || "dialer");
  return twimlResponse(
    `<Say voice="Polly.Matthew">Dialer connected. Stay on the line, calls will start when you dial a lead.</Say>` +
      `<Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="">${conference}</Conference></Dial>`
  );
}
