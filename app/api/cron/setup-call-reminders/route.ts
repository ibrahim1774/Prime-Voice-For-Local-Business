import { NextRequest, NextResponse } from "next/server";
import { BASE_URL, ensureSchema, hasDb, sql } from "@/lib/dialer/core";
import { ensureSetupCallsSchema, sendDueReminders } from "@/lib/setupCalls";

export const maxDuration = 60;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";

// Every 15 minutes (vercel.json): text the 24-hour and 1-hour reminders for
// setup calls the catch-all assistant booked, and make sure the assistant
// still has its calendar tools — a "Publish" from a Vapi dashboard tab opened
// before sync-config ran saves that tab's (empty) tool selection and silently
// detaches them, leaving Keith talking about booking with nothing to book
// with. Manual trigger accepted with the Vapi shared secret; with it,
// ?list=1 shows recent bookings and ?delete=<id> removes one (test rows).
export async function GET(request: NextRequest) {
  const fromCron =
    request.headers.get("x-vercel-cron") !== null ||
    (request.headers.get("user-agent") || "").includes("vercel-cron");
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  const manual = Boolean(secret) && request.headers.get("x-vapi-secret") === secret;
  if (!fromCron && !manual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, note: "no db" });

  if (manual && request.nextUrl.searchParams.get("list")) {
    await ensureSetupCallsSchema();
    const rows = (await sql()`
      SELECT id, token, phone, email, name, business, start_at, timezone, source,
             confirm_sms_sid, reminded_24h_at, reminded_1h_at, created_at
      FROM setup_calls ORDER BY id DESC LIMIT 20`) as any[];
    return NextResponse.json({ ok: true, rows });
  }
  const del = manual ? Number(request.nextUrl.searchParams.get("delete")) : NaN;
  if (Number.isInteger(del)) {
    await ensureSetupCallsSchema();
    const gone = (await sql()`DELETE FROM setup_calls WHERE id = ${del} RETURNING id`) as any[];
    return NextResponse.json({ ok: true, deleted: gone.length });
  }

  const sent = await sendDueReminders();
  const tools = await healCatchallTools(secret);
  return NextResponse.json({ ok: true, ...sent, tools });
}

// Re-runs sync-config when the catch-all assistant has lost its calendar
// tools. Fail-soft: a Vapi hiccup here must never block the reminders.
async function healCatchallTools(
  secret: string | undefined
): Promise<{ attached: number; healed: boolean } | { skipped: string }> {
  const vapiKey = process.env.VAPI_API_KEY?.trim();
  if (!vapiKey || !secret) return { skipped: "no vapi key/secret" };
  try {
    await ensureSchema();
    const cfg = (await sql()`
      SELECT value FROM app_config WHERE key = 'catchall_booking_tool'`) as any[];
    // Never synced with tools yet → nothing to heal (and nothing to attach).
    if (!cfg[0]?.value) return { skipped: "booking not configured" };

    const r = await fetch(`https://api.vapi.ai/assistant/${CATCHALL_ASSISTANT_ID}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });
    if (!r.ok) return { skipped: `vapi ${r.status}` };
    const a: any = await r.json();
    const attached: string[] = Array.isArray(a?.model?.toolIds) ? a.model.toolIds : [];
    if (attached.length >= 2) return { attached: attached.length, healed: false };

    console.warn(`setup-call: catch-all assistant has ${attached.length} tools attached — re-syncing`);
    const s = await fetch(`${BASE_URL}/api/vapi/sync-config`, {
      method: "POST",
      headers: { "x-vapi-secret": secret, "Content-Type": "application/json" },
      body: "{}",
    });
    const j: any = await s.json().catch(() => ({}));
    const after: string[] = Array.isArray(j?.attachedToolIds) ? j.attachedToolIds : [];
    return { attached: after.length, healed: s.ok && after.length >= 2 };
  } catch (err) {
    console.error("setup-call: tool heal check failed", err);
    return { skipped: "error" };
  }
}
