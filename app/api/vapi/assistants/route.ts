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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
