import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  sql,
  unauthorized,
  LEAD_STATUSES,
} from "@/lib/dialer/core";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const q = sql();

  if (typeof body.status === "string") {
    if (!(LEAD_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "Bad status" }, { status: 400 });
    }
    await q`UPDATE dialer_leads SET status = ${body.status}, updated_at = now() WHERE id = ${leadId}`;
  }
  if (typeof body.notes === "string") {
    await q`UPDATE dialer_leads SET notes = ${body.notes.slice(0, 4000)}, updated_at = now() WHERE id = ${leadId}`;
  }
  if (typeof body.name === "string") {
    await q`UPDATE dialer_leads SET name = ${body.name.slice(0, 120)}, updated_at = now() WHERE id = ${leadId}`;
  }
  if (typeof body.business === "string") {
    await q`UPDATE dialer_leads SET business = ${body.business.slice(0, 160)}, updated_at = now() WHERE id = ${leadId}`;
  }
  if (typeof body.industry === "string") {
    await q`UPDATE dialer_leads SET industry = ${body.industry.trim().slice(0, 80)}, updated_at = now() WHERE id = ${leadId}`;
  }
  if (typeof body.list_name === "string") {
    await q`UPDATE dialer_leads SET list_name = ${body.list_name.trim().slice(0, 80)}, updated_at = now() WHERE id = ${leadId}`;
  }
  // append_note: date-stamped call note pushed on top of the existing notes.
  if (typeof body.append_note === "string" && body.append_note.trim()) {
    const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const line = `${stamp}: ${body.append_note.trim().slice(0, 500)}`;
    await q`UPDATE dialer_leads
      SET notes = CASE WHEN notes = '' THEN ${line} ELSE ${line} || E'\n' || notes END,
          updated_at = now()
      WHERE id = ${leadId}`;
  }
  if (typeof body.callback_at === "string") {
    const ts = body.callback_at ? new Date(body.callback_at) : null;
    await q`UPDATE dialer_leads SET callback_at = ${ts && !isNaN(ts.getTime()) ? ts.toISOString() : null}, updated_at = now() WHERE id = ${leadId}`;
  }
  const rows = (await q`SELECT * FROM dialer_leads WHERE id = ${leadId}`) as any[];
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, lead: rows[0] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  // dialer_calls FK is ON DELETE CASCADE, so a lead's call rows go with it.
  await sql()`DELETE FROM dialer_leads WHERE id = ${leadId}`;
  return NextResponse.json({ ok: true });
}
