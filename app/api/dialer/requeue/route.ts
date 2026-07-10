import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  sql,
  unauthorized,
  LEAD_STATUSES,
} from "@/lib/dialer/core";

export const maxDuration = 30;

// Bulk reset a segment back to New so it re-enters the default queue.
// POST { status: "voicemail", state?: "GA" } → every voicemail (in GA) becomes
// a fresh lead again, cooldown cleared. Never touches DNC.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const status = String(body?.status ?? "");
  const state = String(body?.state ?? "").trim().toUpperCase();
  if (!(LEAD_STATUSES as readonly string[]).includes(status) || status === "dnc" || status === "new") {
    return NextResponse.json({ error: "Pick a segment to requeue" }, { status: 400 });
  }
  const rows = (await sql()`
    UPDATE dialer_leads
    SET status = 'new', last_dialed_at = NULL, callback_at = NULL, updated_at = now()
    WHERE status = ${status} AND (${state} = '' OR state = ${state})
    RETURNING id`) as any[];
  return NextResponse.json({ ok: true, requeued: rows.length });
}
