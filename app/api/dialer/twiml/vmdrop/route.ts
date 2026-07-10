import { NextRequest } from "next/server";
import {
  ensureSchema,
  getSetting,
  twimlResponse,
  validTwilioRequest,
  xmlEscape,
  DEFAULT_VM_SCRIPT,
} from "@/lib/dialer/core";

// TwiML the lead leg is redirected to when the agent hits "Drop voicemail":
// reads the (editable) voicemail script in a natural voice, then hangs up.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const script = (await getSetting("vm_script")) || DEFAULT_VM_SCRIPT;
  return twimlResponse(
    `<Pause length="1"/><Say voice="Polly.Matthew">${xmlEscape(script)}</Say><Hangup/>`
  );
}
