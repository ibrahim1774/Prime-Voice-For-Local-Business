import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  getSession,
  saveSession,
  sql,
  validTwilioRequest,
} from "@/lib/dialer/core";

// Twilio status callback for both legs. Lead legs update the call log;
// a completed agent leg ends the session.
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  await ensureSchema();
  const kind = url.searchParams.get("kind") || "lead";
  const callSid = form.get("CallSid") || "";
  const status = form.get("CallStatus") || "";
  const duration = Number(form.get("CallDuration") || 0);

  if (kind === "agent") {
    if (status === "completed" || status === "failed" || status === "no-answer" || status === "busy") {
      const session = await getSession();
      if (session?.agentCallSid === callSid) await saveSession(null);
    }
    return NextResponse.json({ ok: true });
  }

  if (callSid) {
    await sql()`
      UPDATE dialer_calls
      SET status = ${status}, duration_seconds = GREATEST(duration_seconds, ${duration})
      WHERE call_sid = ${callSid}`;
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
      const session = await getSession();
      if (session?.currentCallSid === callSid) {
        await saveSession({ ...session, currentCallSid: null, currentLeadId: null });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
