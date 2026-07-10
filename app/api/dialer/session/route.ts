import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  getSession,
  getSetting,
  setSetting,
  isAuthed,
  saveSession,
  sql,
  twilio,
  twilioEnv,
  unauthorized,
  waveWinner,
  webhookToken,
  TERMINAL_CALL_STATUSES,
} from "@/lib/dialer/core";

export const maxDuration = 60;

const WAVE_STALE_MS = 90_000;

// GET — session + live wave state, polled by the UI. Session JSON is written
// only by control routes; this derives everything else from dialer_calls and
// the wave-winner claim so webhook races can't corrupt state.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active) return NextResponse.json({ active: false });

  const agentAnswered = (await getSetting("agent_answered")) === "1";

  let waveActive = false;
  let waveLeads: any[] = [];
  let winnerCall: any = null;
  let winnerLead: any = null;

  if (session.waveId && session.wave?.length) {
    const sids = session.wave.map((w) => w.callSid);
    const calls = (await sql()`
      SELECT c.*, l.name, l.business, l.phone, l.id AS lead_id
      FROM dialer_calls c JOIN dialer_leads l ON l.id = c.lead_id
      WHERE c.call_sid = ANY(${sids})`) as any[];
    const winnerSid = await waveWinner(session.waveId);

    if (winnerSid) {
      winnerCall = calls.find((c) => c.call_sid === winnerSid) || null;
      if (winnerCall) {
        winnerLead = {
          id: winnerCall.lead_id,
          name: winnerCall.name,
          business: winnerCall.business,
          phone: winnerCall.phone,
        };
      }
      waveActive = Boolean(
        winnerCall && !TERMINAL_CALL_STATUSES.includes(winnerCall.status)
      );
    } else {
      const allTerminal =
        calls.length === session.wave.length &&
        calls.every((c) => TERMINAL_CALL_STATUSES.includes(c.status));
      const stale =
        session.waveStartedAt &&
        Date.now() - new Date(session.waveStartedAt).getTime() > WAVE_STALE_MS;
      waveActive = !allTerminal && !stale;
      if (stale && !allTerminal) {
        // Safety net: a webhook went missing — cancel stragglers off-response.
        after(async () => {
          for (const c of calls) {
            if (TERMINAL_CALL_STATUSES.includes(c.status)) continue;
            try {
              await twilio(`/Calls/${c.call_sid}.json`, { Status: "completed" });
            } catch {}
          }
        });
      }
    }
    waveLeads = calls.map((c) => ({
      leadId: c.lead_id,
      name: c.name,
      business: c.business,
      phone: c.phone,
      status: c.status,
      amd: c.amd,
      callSid: c.call_sid,
    }));
  }

  return NextResponse.json({
    active: true,
    agentAnswered,
    startedAt: session.startedAt,
    waveActive,
    waveLeads,
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
      const sids = [
        ...(session.wave || []).map((w) => w.callSid),
        session.agentCallSid,
      ];
      for (const sid of sids) {
        if (!sid) continue;
        try {
          await twilio(`/Calls/${sid}.json`, { Status: "completed" });
        } catch {
          // already ended
        }
      }
    }
    await saveSession(null);
    await setSetting("agent_answered", "");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
