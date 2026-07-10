import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, validTwilioRequest } from "@/lib/dialer/core";

export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const callSid = form.get("CallSid") || "";
  const recordingSid = form.get("RecordingSid") || "";
  if (callSid && recordingSid) {
    await sql()`UPDATE dialer_calls SET recording_sid = ${recordingSid} WHERE call_sid = ${callSid}`;
  }
  return NextResponse.json({ ok: true });
}
