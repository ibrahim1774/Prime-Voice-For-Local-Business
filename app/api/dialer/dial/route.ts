import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  cancelCalls,
  createWaveClaim,
  DIALABLE_SEGMENTS,
  ensureSchema,
  friendlyTwilioError,
  getSession,
  getSetting,
  isAuthed,
  pickCallerId,
  saveSession,
  sql,
  twilio,
  unauthorized,
  waveState,
  webhookToken,
  WaveCall,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// POST — fire the next wave: dial 1-3 queued leads simultaneously (lines
// setting). First one answered wins the conference; the rest are cancelled
// with the polite abandon message and re-queued.
// Optional { leadId } dials one specific lead (single call, no wave).
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const session = await getSession();
  if (!session?.active) {
    return NextResponse.json({ error: "Start a session first" }, { status: 409 });
  }
  if ((await getSetting("agent_answered")) !== "1") {
    return NextResponse.json({ error: "Answer your phone first — it's ringing" }, { status: 409 });
  }
  // One wave at a time. Liveness is re-derived (same helper the UI polls) —
  // a finished wave leaves waveId set, so presence alone must never gate.
  if (session.waveId) {
    const prev = await waveState(session);
    if (prev.active) {
      return NextResponse.json({ error: "A call is still in progress" }, { status: 409 });
    }
    // Never dial over a live agent conversation, and never leave siblings up.
    if (prev.stragglers.length) await cancelCalls(prev.stragglers);
  }

  const body = await request.json().catch(() => ({}));
  const q = sql();

  let leads: any[];
  if (body.leadId) {
    leads = (await q`
      SELECT * FROM dialer_leads WHERE id = ${Number(body.leadId)} AND status <> 'dnc'`) as any[];
  } else {
    const lines = Math.min(3, Math.max(1, Number(await getSetting("lines")) || 1));
    // Honor the same segment + state the queue preview uses, so "Dial next"
    // pulls from exactly the batch shown in Up next.
    const segment = (await getSetting("dial_segment")) || "new";
    const seg = (DIALABLE_SEGMENTS as readonly string[]).includes(segment) ? segment : "new";
    const st = (await getSetting("dial_state")).toUpperCase();
    const list = await getSetting("dial_list");
    const ind = await getSetting("dial_industry");
    if (seg === "new") {
      leads = (await q`
        SELECT * FROM dialer_leads
        WHERE (status = 'new' OR (status = 'callback' AND (callback_at IS NULL OR callback_at <= now())))
          AND (${st} = '' OR state = ${st})
          AND (${list} = '' OR list_name = ${list})
          AND (${ind} = '' OR industry = ${ind})
          AND (last_dialed_at IS NULL OR last_dialed_at < now() - interval '20 hours')
        ORDER BY (status = 'callback') DESC, id ASC
        LIMIT ${lines}`) as any[];
    } else {
      leads = (await q`
        SELECT * FROM dialer_leads
        WHERE status = ${seg} AND (${st} = '' OR state = ${st})
          AND (${list} = '' OR list_name = ${list})
          AND (${ind} = '' OR industry = ${ind})
        ORDER BY last_dialed_at ASC NULLS FIRST, id ASC
        LIMIT ${lines}`) as any[];
    }
  }
  if (!leads.length) {
    return NextResponse.json({ error: "Queue is empty" }, { status: 404 });
  }

  const waveId = Date.now().toString(36);
  await createWaveClaim(waveId);

  const t = webhookToken();
  const wave: WaveCall[] = [];
  let lastError: any = null;
  for (const lead of leads) {
    const callerId = await pickCallerId(lead.phone);
    try {
      const call = await twilio("/Calls.json", {
        To: lead.phone,
        From: callerId,
        Url: `${BASE_URL}/api/dialer/twiml/lead?c=${session.conference}&w=${waveId}&t=${t}`,
        StatusCallback: `${BASE_URL}/api/dialer/call-status?t=${t}&kind=lead`,
        StatusCallbackEvent: ["ringing", "answered", "completed"],
        MachineDetection: "Enable",
        AsyncAmd: "true",
        AsyncAmdStatusCallback: `${BASE_URL}/api/dialer/amd?t=${t}`,
        Record: "true",
        RecordingStatusCallback: `${BASE_URL}/api/dialer/recording-status?t=${t}`,
        Timeout: "25",
      });
      wave.push({ leadId: lead.id, callSid: call.sid });
      await q`
        INSERT INTO dialer_calls (lead_id, call_sid, status)
        VALUES (${lead.id}, ${call.sid}, 'dialing')
        ON CONFLICT (call_sid) DO NOTHING`;
      await q`UPDATE dialer_leads SET last_dialed_at = now() WHERE id = ${lead.id}`;
    } catch (err) {
      lastError = err;
      console.error(`dial: failed to place call to ${lead.phone}`, err);
    }
  }
  if (!wave.length) {
    return NextResponse.json(
      { error: lastError ? friendlyTwilioError(lastError) : "Could not place any calls" },
      { status: 502 }
    );
  }

  await saveSession({
    ...session,
    waveId,
    wave,
    waveStartedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, waveId, calls: wave.length });
}
