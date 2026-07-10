import { NextRequest } from "next/server";
import {
  ensureSchema,
  getSetting,
  twimlResponse,
  validTwilioRequest,
  xmlEscape,
} from "@/lib/dialer/core";

// Inbound voice on a local-presence number (a lead calling back): forward
// straight to the agent's cell. Caller ID shown is the original caller.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const agentPhone = await getSetting("agent_phone");
  if (!agentPhone) {
    return twimlResponse(
      `<Say voice="Polly.Matthew">Thanks for calling Montivaro. Please text this number and we will get right back to you.</Say><Hangup/>`
    );
  }
  return twimlResponse(`<Dial timeout="25">${xmlEscape(agentPhone)}</Dial>`);
}
