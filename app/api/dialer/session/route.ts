import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  getSession,
  getSetting,
  isAuthed,
  saveSession,
  sql,
  twilio,
  twilioEnv,
  unauthorized,
  webhookToken,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// GET — current session + live state of the current call, polled by the UI.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active) return NextResponse.json({ active: false });

  let call: any = null;
  let lead: any = null;
  if (session.currentCallSid) {
    const calls = (await sql()`
      SELECT * FROM dialer_calls WHERE call_sid = ${session.currentCallSid}`) as any[];
    call = calls[0] || null;
  }
  if (session.currentLeadId) {
    const leads = (await sql()`
      SELECT * FROM dialer_leads WHERE id = ${session.currentLeadId}`) as any[];
    lead = leads[0] || null;
  }
  return NextResponse.json({
    active: true,
    startedAt: session.startedAt,
    currentCall: call,
    currentLead: lead,
  });
}

// POST { action: "start" | "stop" }
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));

  if (body.action === "start") {
    const existing = await getSession();
    if (existing?.active) {
      return NextResponse.json({ error: "A session is already running — end it first" }, { status: 409 });
    }
    const agentPhone = await getSetting("agent_phone");
    if (!agentPhone) {
      return NextResponse.json(
        { error: "Set your phone number in Settings first — the dialer calls you there" },
        { status: 400 }
      );
    }
    const { from } = twilioEnv();
    const conference = `dialer-${Date.now().toString(36)}`;
    const t = webhookToken();
    const call = await twilio("/Calls.json", {
      To: agentPhone,
      From: from,
      Url: `${BASE_URL}/api/dialer/twiml/agent?c=${conference}&t=${t}`,
      StatusCallback: `${BASE_URL}/api/dialer/call-status?t=${t}&kind=agent`,
      StatusCallbackEvent: ["completed"],
    });
    await saveSession({
      active: true,
      conference,
      agentCallSid: call.sid,
      currentLeadId: null,
      currentCallSid: null,
      startedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, answerYourPhone: true });
  }

  if (body.action === "stop") {
    const session = await getSession();
    if (session) {
      for (const sid of [session.currentCallSid, session.agentCallSid]) {
        if (!sid) continue;
        try {
          await twilio(`/Calls/${sid}.json`, { Status: "completed" });
        } catch {
          // already ended
        }
      }
    }
    await saveSession(null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
