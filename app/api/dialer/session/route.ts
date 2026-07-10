import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  BASE_URL,
  cancelCalls,
  ensureSchema,
  getSession,
  getSetting,
  setSetting,
  isAuthed,
  saveSession,
  twilio,
  twilioEnv,
  unauthorized,
  waveState,
  webhookToken,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// GET — session + live wave state, polled by the UI. Wave liveness comes from
// waveState() (dialer_calls + claim row), never from session JSON, so
// concurrent Twilio webhooks can't corrupt it.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active) return NextResponse.json({ active: false });

  const agentAnswered = (await getSetting("agent_answered")) === "1";
  const state = await waveState(session);

  let winnerCall: any = null;
  let winnerLead: any = null;
  if (state.winnerSid) {
    winnerCall = state.calls.find((c) => c.call_sid === state.winnerSid) || null;
    if (winnerCall) {
      winnerLead = {
        id: winnerCall.lead_id,
        name: winnerCall.name,
        business: winnerCall.business,
        phone: winnerCall.phone,
      };
    }
  }

  // Wave is over but calls are still up (a dropped webhook): hang them up.
  if (!state.active && state.stragglers.length) {
    after(() => cancelCalls(state.stragglers));
  }

  return NextResponse.json({
    active: true,
    agentAnswered,
    startedAt: session.startedAt,
    waveActive: state.active,
    waveLeads: state.calls.map((c) => ({
      leadId: c.lead_id,
      name: c.name,
      business: c.business,
      phone: c.phone,
      status: c.status,
      amd: c.amd,
      callSid: c.call_sid,
    })),
    winnerCall: winnerCall
      ? { status: winnerCall.status, amd: winnerCall.amd, callSid: winnerCall.call_sid }
      : null,
    winnerLead,
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
      return NextResponse.json(
        { error: "A session is already running — end it first" },
        { status: 409 }
      );
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
    await setSetting("agent_answered", "");
    const call = await twilio("/Calls.json", {
      To: agentPhone,
      From: from,
      Url: `${BASE_URL}/api/dialer/twiml/agent?c=${conference}&t=${t}`,
      StatusCallback: `${BASE_URL}/api/dialer/call-status?t=${t}&kind=agent`,
      StatusCallbackEvent: ["answered", "completed"],
    });
    await saveSession({
      active: true,
      conference,
      agentCallSid: call.sid,
      startedAt: new Date().toISOString(),
      waveId: null,
      wave: [],
      waveStartedAt: null,
    });
    return NextResponse.json({ ok: true, answerYourPhone: true });
  }

  if (body.action === "stop") {
    const session = await getSession();
    if (session) {
      await cancelCalls([
        ...(session.wave || []).map((w) => w.callSid),
        session.agentCallSid,
      ].filter(Boolean));
    }
    await saveSession(null);
    await setSetting("agent_answered", "");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
