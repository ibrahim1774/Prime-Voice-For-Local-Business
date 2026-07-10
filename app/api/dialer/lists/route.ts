import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, sql, unauthorized } from "@/lib/dialer/core";

export const maxDuration = 30;

// Lead-list management.
// PATCH { from, to } — rename a list.
// DELETE { name }    — delete a list AND its leads (call history cascades).
export async function PATCH(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const from = String(body?.from ?? "").trim();
  const to = String(body?.to ?? "").trim().slice(0, 80);
  if (!from || !to) return NextResponse.json({ error: "Need from and to" }, { status: 400 });
  const rows = (await sql()`
    UPDATE dialer_leads SET list_name = ${to}, updated_at = now()
    WHERE list_name = ${from} RETURNING id`) as any[];
  return NextResponse.json({ ok: true, renamed: rows.length });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Need a list name" }, { status: 400 });
  // DNC leads survive a list deletion — losing a do-not-call record means
  // accidentally calling someone who told us to stop.
  const rows = (await sql()`
    DELETE FROM dialer_leads WHERE list_name = ${name} AND status <> 'dnc' RETURNING id`) as any[];
  const kept = (await sql()`
    SELECT count(*)::int AS n FROM dialer_leads WHERE list_name = ${name}`) as any[];
  return NextResponse.json({ ok: true, deleted: rows.length, keptDnc: kept[0]?.n || 0 });
}
