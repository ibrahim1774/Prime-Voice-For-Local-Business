import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  getSession,
  isAuthed,
  saveSession,
  sql,
  twilio,
  twilioEnv,
  unauthorized,
  webhookToken,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// POST { leadId } — dial one lead into the live session's conference.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active) {
    return NextResponse.json({ error: "Start a session first" }, { status: 409 });
  }
  if (session.currentCallSid) {
    return NextResponse.json({ error: "A call is already in progress" }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  const leadId = Number(body?.leadId);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Bad leadId" }, { status: 400 });
  }
  const leads = (await sql()`SELECT * FROM dialer_leads WHERE id = ${leadId}`) as any[];
  const lead = leads[0];
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.status === "dnc") {
    return NextResponse.json({ error: "Lead is on the do-not-call list" }, { status: 400 });
  }

  const { from } = twilioEnv();
  const t = webhookToken();
  const call = await twilio("/Calls.json", {
    To: lead.phone,
    From: from,
    Url: `${BASE_URL}/api/dialer/twiml/lead?c=${session.conference}&t=${t}`,
    StatusCallback: `${BASE_URL}/api/dialer/call-status?t=${t}&kind=lead`,
    StatusCallbackEvent: ["ringing", "answered", "completed"],
    MachineDetection: "Enable",
    AsyncAmd: "true",
    AsyncAmdStatusCallback: `${BASE_URL}/api/dialer/amd?t=${t}`,
    Record: "true",
    RecordingStatusCallback: `${BASE_URL}/api/dialer/recording-status?t=${t}`,
    Timeout: "25",
  });

  await sql()`
    INSERT INTO dialer_calls (lead_id, call_sid, status)
    VALUES (${leadId}, ${call.sid}, 'dialing')
    ON CONFLICT (call_sid) DO NOTHING`;
  await saveSession({ ...session, currentLeadId: leadId, currentCallSid: call.sid });
  return NextResponse.json({ ok: true, callSid: call.sid });
}
