import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  getSession,
  saveSession,
  setSetting,
  sql,
  validTwilioRequest,
} from "@/lib/dialer/core";

// Twilio status callback for both legs. Lead legs update the call log only
// (wave/winner state is derived from dialer_calls + the claim key, so this
// webhook never touches the session JSON for lead calls). An answered agent
// leg unlocks dialing; a completed one ends the session.
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
    const session = await getSession();
    if (session?.agentCallSid === callSid) {
      if (status === "in-progress") {
        await setSetting("agent_answered", "1");
      } else if (["completed", "failed", "no-answer", "busy", "canceled"].includes(status)) {
        await saveSession(null);
        await setSetting("agent_answered", "");
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (callSid) {
    await sql()`
      UPDATE dialer_calls
      SET status = ${status}, duration_seconds = GREATEST(duration_seconds, ${duration})
      WHERE call_sid = ${callSid}`;
  }
  return NextResponse.json({ ok: true });
}
