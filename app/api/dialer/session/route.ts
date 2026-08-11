import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  BASE_URL,
  cancelCalls,
  ensureSchema,
  friendlyTwilioError,
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

  const lastAutoRaw = await getSetting("last_auto_outcome");
  let lastAuto: any = null;
  try {
    lastAuto = lastAutoRaw ? JSON.parse(lastAutoRaw) : null;
  } catch {
    lastAuto = null;
  }

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
        business_link: winnerCall.business_link || "",
      };
    }
  }

  // Wave is over but calls are still up (a dropped webhook): hang them up.
  if (!state.active && state.stragglers.length) {
    after(() => cancelCalls(state.stragglers));
  }

  // The winner was auto-resolved (a voicemail we detected + handled) when the
  // last auto-outcome is tagged for THIS winner in THIS wave. The client uses
  // it to (a) never show a manual-mark card for an auto-handled voicemail and
  // (b) advance once the wave ends. A real human conversation never sets
  // last_auto_outcome, so those always stop for the agent to mark. Note: this
  // can be true while the call is still up (drop mode plays the script) — the
  // client only advances when waveActive is also false.
  const winnerResolved = Boolean(
    winnerLead &&
      lastAuto &&
      lastAuto.waveId === session.waveId &&
      lastAuto.leadId === winnerLead.id
  );

  return NextResponse.json({
    active: true,
    agentAnswered,
    startedAt: session.startedAt,
    waveActive: state.active,
    lastAuto,
    winnerResolved,
    waveLeads: state.calls.map((c) => ({
      leadId: c.lead_id,
      name: c.name,
      business: c.business,
      phone: c.phone,
      business_link: c.business_link || "",
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
    const mode = body.mode === "browser" ? "browser" : "phone";
    const conference = `dialer-${Date.now().toString(36)}`;
    const t = webhookToken();
    await setSetting("agent_answered", "");
    await setSetting("browser_agent_sid", "");
    await setSetting("last_auto_outcome", "");

    if (mode === "browser") {
      // No agent call — the browser joins the conference via the Voice SDK
      // (twiml/client marks agent_answered when it connects).
      await saveSession({
        active: true,
        conference,
        agentCallSid: "",
        startedAt: new Date().toISOString(),
        waveId: null,
        wave: [],
        waveStartedAt: null,
      });
      return NextResponse.json({ ok: true, mode, conference });
    }

    const agentPhone = await getSetting("agent_phone");
    if (!agentPhone) {
      return NextResponse.json(
        { error: "Set your phone number first — the dialer calls you there (or switch to browser calling)" },
        { status: 400 }
      );
    }
    const { from } = twilioEnv();
    let call: any;
    try {
      call = await twilio("/Calls.json", {
        To: agentPhone,
        From: from,
        Url: `${BASE_URL}/api/dialer/twiml/agent?c=${conference}&t=${t}`,
        StatusCallback: `${BASE_URL}/api/dialer/call-status?t=${t}&kind=agent`,
        StatusCallbackEvent: ["answered", "completed"],
      });
    } catch (err) {
      return NextResponse.json({ error: friendlyTwilioError(err) }, { status: 502 });
    }
    await saveSession({
      active: true,
      conference,
      agentCallSid: call.sid,
      startedAt: new Date().toISOString(),
      waveId: null,
      wave: [],
      waveStartedAt: null,
    });
    return NextResponse.json({ ok: true, mode, conference, answerYourPhone: true });
  }

  if (body.action === "stop") {
    const session = await getSession();
    if (session) {
      const browserSid = await getSetting("browser_agent_sid");
      await cancelCalls([
        ...(session.wave || []).map((w) => w.callSid),
        session.agentCallSid,
        browserSid,
      ].filter(Boolean));
    }
    await saveSession(null);
    await setSetting("agent_answered", "");
    await setSetting("browser_agent_sid", "");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
