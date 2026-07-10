import { NextRequest } from "next/server";
import {
  ensureSchema,
  getSession,
  setSetting,
  twimlResponse,
  validTwilioRequest,
  xmlEscape,
} from "@/lib/dialer/core";

export const maxDuration = 30;

// TwiML App voice webhook: the browser (Voice SDK) connecting as the agent
// leg. Joins the live session's conference exactly like the phone leg would —
// hanging up the browser ends the session's audio (endConferenceOnExit).
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const session = await getSession();
  const conference = form.get("c") || session?.conference || "";
  if (!session?.active || !conference || conference !== session.conference) {
    return twimlResponse(
      `<Say voice="Polly.Matthew">No dialing session is running. Start one from the dialer first.</Say><Hangup/>`
    );
  }
  // Record the browser leg (webhooks never write session JSON — settings only)
  // and unlock dialing, same as an answered phone leg.
  await setSetting("browser_agent_sid", form.get("CallSid") || "");
  await setSetting("agent_answered", "1");
  return twimlResponse(
    `<Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="">${xmlEscape(conference)}</Conference></Dial>`
  );
}
