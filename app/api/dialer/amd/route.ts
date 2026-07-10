import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, validTwilioRequest } from "@/lib/dialer/core";

// Async answering-machine-detection callback: labels the call human/machine
// so the UI can show "🤖 Voicemail likely" while you're still listening.
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
  return NextResponse.json({ ok: true });
}
