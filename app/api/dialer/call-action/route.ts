import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  getSession,
  isAuthed,
  twilio,
  unauthorized,
  webhookToken,
} from "@/lib/dialer/core";

// POST { action: "vmdrop" | "hangup" } — controls the current lead call.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active || !session.currentCallSid) {
    return NextResponse.json({ error: "No call in progress" }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "vmdrop") {
      // Redirect the lead leg to the voicemail script, then it hangs up.
      await twilio(`/Calls/${session.currentCallSid}.json`, {
        Url: `${BASE_URL}/api/dialer/twiml/vmdrop?t=${webhookToken()}`,
        Method: "POST",
      });
      return NextResponse.json({ ok: true, dropped: true });
    }
    if (body.action === "hangup") {
      await twilio(`/Calls/${session.currentCallSid}.json`, { Status: "completed" });
      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Call action failed (call may have already ended)" },
      { status: 502 }
    );
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
