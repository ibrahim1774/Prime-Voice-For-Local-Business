import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";

// Assistant housekeeping. The Vapi private key only exists in the Vercel env,
// so list/delete runs here instead of a local script. POST with the shared
// secret in x-vapi-secret:
//   { action: "list" }                → every assistant (id, name, createdAt)
//   { action: "delete", ids: [...] }  → delete by id — the live production
//                                       lines are hardcoded as undeletable.

export const maxDuration = 60;

// Never deletable, no matter what's requested: the live demo lines.
const CATCHALL_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";

const PROTECTED_IDS = new Set([
  "52081d54-3e98-4213-88cc-b618985a1d9b", // Montivaro catch-all
  "52d9dbcd-a215-4794-8bd7-fe2bd982fd35", // Prime Barber
  "4ec4a1d0-2d64-48aa-beee-e2417ddc258f", // Dentist
  "8d33e6cf-7922-4b01-822f-39d71e38de58", // Contractors
  "1892e500-d126-49d8-85c3-a526015a2950", // Website Design ($97)
]);

export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "VAPI_WEBHOOK_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vapiKey = process.env.VAPI_API_KEY?.trim();
  if (!vapiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY not set" }, { status: 503 });
  }
  const auth = { Authorization: `Bearer ${vapiKey}` };
  const body = await request.json().catch(() => ({}));

  // Belt and braces: also protect anything app_config points at, in case the
  // hardcoded list ever drifts from what's actually wired. Everything is
  // lowercased so a case-variant id can't slip past the protected check.
  await ensureSchema();
  const cfgRows = (await sql()`
    SELECT value FROM app_config WHERE key LIKE '%_assistant_id'`) as any[];
  const protectedIds = new Set(
    [...PROTECTED_IDS, ...cfgRows.map((r) => r.value).filter(Boolean)].map((id) =>
      String(id).trim().toLowerCase()
    )
  );

  if (body.action === "list") {
    const resp = await fetch("https://api.vapi.ai/assistant?limit=1000", { headers: auth });
    if (!resp.ok) {
      return NextResponse.json({ error: `Vapi list failed (${resp.status})` }, { status: 502 });
    }
    const list: any[] = (await resp.json().catch(() => [])) || [];
    return NextResponse.json({
      ok: true,
      assistants: list.map((a) => ({
        id: a.id,
        name: a.name || "(unnamed)",
        createdAt: a.createdAt || null,
        protected: protectedIds.has(String(a.id || "").trim().toLowerCase()),
      })),
    });
  }

  if (body.action === "delete") {
    // Strict UUIDs only, lowercased: anything else (path fragments, case
    // variants trying to sidestep the protected set) is rejected outright, so
    // the interpolated Vapi URL can only ever address an assistant id.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const ids: string[] = (Array.isArray(body.ids) ? body.ids : [])
      .map((s: unknown) => String(s).trim().toLowerCase())
      .filter((id: string) => UUID_RE.test(id))
      .slice(0, 200);
    if (!ids.length) return NextResponse.json({ error: "No ids" }, { status: 400 });
    const results: Record<string, string> = {};
    for (const id of ids) {
      if (protectedIds.has(id)) {
        results[id] = "protected — skipped";
        continue;
      }
      const resp = await fetch(`https://api.vapi.ai/assistant/${id}`, {
        method: "DELETE",
        headers: auth,
      });
      results[id] = resp.ok ? "deleted" : `failed (${resp.status})`;
    }
    const deleted = Object.values(results).filter((v) => v === "deleted").length;
    return NextResponse.json({ ok: true, deleted, results });
  }

  // { action: "delete-calls", assistantId } — wipe an assistant's Vapi call
  // logs (and their recordings) in batches. The assistant itself is untouched,
  // protected or not: clearing logs on a live line is legitimate housekeeping.
  // Deletes up to ~300 per invocation and reports whether more remain — just
  // call it again for very large logs.
  if (body.action === "delete-calls") {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const assistantId = String(body.assistantId || "").trim().toLowerCase();
    if (!UUID_RE.test(assistantId)) {
      return NextResponse.json({ error: "Bad assistantId" }, { status: 400 });
    }
    let deleted = 0;
    let failed = 0;
    let more = false;
    for (let batch = 0; batch < 3; batch++) {
      const listResp = await fetch(
        `https://api.vapi.ai/call?assistantId=${assistantId}&limit=100`,
        { headers: auth }
      );
      if (!listResp.ok) {
        return NextResponse.json(
          { error: `Vapi list calls failed (${listResp.status})`, deleted },
          { status: 502 }
        );
      }
      const calls: any[] = (await listResp.json().catch(() => [])) || [];
      if (!calls.length) break;
      for (const call of calls) {
        if (!call?.id || !UUID_RE.test(String(call.id).toLowerCase())) continue;
        const del = await fetch(`https://api.vapi.ai/call/${call.id}`, {
          method: "DELETE",
          headers: auth,
        });
        if (del.ok) deleted++;
        else failed++;
      }
      // A failed delete would otherwise loop forever on the same page.
      if (failed) break;
      more = calls.length === 100;
      if (!more) break;
    }
    return NextResponse.json({ ok: true, deleted, failed, more });
  }

  // { action: "latency", assistantId?, limit? } — per-call response latency
  // for the catch-all line (default), read from Vapi's own performance
  // metrics on each call, with a fallback computed from message timestamps
  // (caller stops → assistant starts). Also returns the assistant's current
  // voice-pipeline settings so the numbers can be read next to what
  // produced them.
  if (body.action === "latency") {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const assistantId = String(body.assistantId || CATCHALL_ID).trim().toLowerCase();
    if (!UUID_RE.test(assistantId)) {
      return NextResponse.json({ error: "Bad assistantId" }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
    const [aResp, cResp] = await Promise.all([
      fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers: auth }),
      fetch(`https://api.vapi.ai/call?assistantId=${assistantId}&limit=${limit}`, { headers: auth }),
    ]);
    const a: any = aResp.ok ? await aResp.json().catch(() => ({})) : {};
    const calls: any[] = cResp.ok ? ((await cResp.json().catch(() => [])) || []) : [];
    const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
    const report = calls.map((c) => {
      const pm: any = c?.artifact?.performanceMetrics || {};
      // Fallback: gap from the end of each caller turn to the start of the
      // next assistant turn, from the message timeline (seconds from start).
      const msgs: any[] = Array.isArray(c?.artifact?.messages) ? c.artifact.messages : [];
      const gaps: number[] = [];
      for (let i = 0; i < msgs.length - 1; i++) {
        const m = msgs[i];
        const n = msgs[i + 1];
        if (m?.role === "user" && (n?.role === "bot" || n?.role === "assistant")) {
          const end = typeof m.endTime === "number" ? m.endTime : typeof m.time === "number" ? m.time : null;
          const start = typeof n.time === "number" ? n.time : null;
          if (end != null && start != null && start >= end) gaps.push(start - end);
        }
      }
      gaps.sort((x, y) => x - y);
      const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
      const p90 = gaps.length ? gaps[Math.floor(gaps.length * 0.9)] : null;
      const started = Date.parse(c?.startedAt || "") || 0;
      const ended = Date.parse(c?.endedAt || "") || 0;
      return {
        id: c?.id,
        startedAt: c?.startedAt || null,
        durationSec: started && ended ? Math.round((ended - started) / 1000) : null,
        type: c?.type || null,
        endedReason: c?.endedReason || null,
        vapiMetricsMs: {
          turnAvg: ms(pm.turnLatencyAverage),
          model: ms(pm.modelLatencyAverage),
          voice: ms(pm.voiceLatencyAverage),
          transcriber: ms(pm.transcriberLatencyAverage),
          endpointing: ms(pm.endpointingLatencyAverage),
          turns: Array.isArray(pm.turnLatencies) ? pm.turnLatencies.length : null,
        },
        timelineGapMs: { median: ms(med != null ? med * 1000 : null), p90: ms(p90 != null ? p90 * 1000 : null), samples: gaps.length },
      };
    });
    return NextResponse.json({
      ok: true,
      assistant: assistantId,
      pipeline: {
        model: { provider: a?.model?.provider, model: a?.model?.model, maxTokens: a?.model?.maxTokens, tools: (a?.model?.toolIds || []).length },
        voice: { provider: a?.voice?.provider, model: a?.voice?.model, voiceId: a?.voice?.voiceId, chunkPlan: a?.voice?.chunkPlan, experimentalControls: a?.voice?.experimentalControls },
        transcriber: a?.transcriber,
        startSpeakingPlan: a?.startSpeakingPlan,
        stopSpeakingPlan: a?.stopSpeakingPlan,
        backgroundSound: a?.backgroundSound,
        firstMessageMode: a?.firstMessageMode,
      },
      calls: report,
    });
  }

  // { action: "tune", assistantId?, patch } — apply voice-pipeline settings
  // (turn-taking, transcriber, voice, model speed knobs) without a deploy.
  // Only the listed keys are accepted; `model` and `voice` are merged onto
  // the current objects so the prompt, tools and voice id survive.
  if (body.action === "tune") {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const assistantId = String(body.assistantId || CATCHALL_ID).trim().toLowerCase();
    if (!UUID_RE.test(assistantId)) {
      return NextResponse.json({ error: "Bad assistantId" }, { status: 400 });
    }
    const patchIn: Record<string, any> = body.patch && typeof body.patch === "object" ? body.patch : {};
    const ALLOWED = new Set([
      "startSpeakingPlan", "stopSpeakingPlan", "transcriber", "voice", "model",
      "backgroundSound", "silenceTimeoutSeconds", "backgroundSpeechDenoisingPlan",
    ]);
    const rejected = Object.keys(patchIn).filter((k) => !ALLOWED.has(k));
    if (rejected.length) {
      return NextResponse.json({ error: `Keys not allowed: ${rejected.join(", ")}` }, { status: 400 });
    }
    const curResp = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers: auth });
    if (!curResp.ok) return NextResponse.json({ error: `Vapi GET failed (${curResp.status})` }, { status: 502 });
    const cur: any = await curResp.json();
    const patch: Record<string, any> = { ...patchIn };
    if (patchIn.model) patch.model = { ...(cur.model || {}), ...patchIn.model };
    if (patchIn.voice) patch.voice = { ...(cur.voice || {}), ...patchIn.voice };
    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json({ error: `Vapi PATCH failed (${r.status})`, detail: j?.message || null }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      applied: Object.keys(patch),
      pipeline: {
        model: { provider: j?.model?.provider, model: j?.model?.model, maxTokens: j?.model?.maxTokens, tools: (j?.model?.toolIds || []).length },
        voice: { provider: j?.voice?.provider, model: j?.voice?.model, voiceId: j?.voice?.voiceId, chunkPlan: j?.voice?.chunkPlan },
        transcriber: j?.transcriber,
        startSpeakingPlan: j?.startSpeakingPlan,
        stopSpeakingPlan: j?.stopSpeakingPlan,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
