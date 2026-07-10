import { NextRequest } from "next/server";
import { twimlResponse, validTwilioRequest, xmlEscape } from "@/lib/dialer/core";

// TwiML for an answered lead call: drop them straight into the session
// conference with the agent. No beep, no announcements — it just connects.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  const conference = xmlEscape(url.searchParams.get("c") || "dialer");
  return twimlResponse(
    `<Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="">${conference}</Conference></Dial>`
  );
}
