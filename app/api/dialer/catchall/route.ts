import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, sql, unauthorized } from "@/lib/dialer/core";

export const maxDuration = 30;

// The dialer's "Catch-all calls" page: every call the Vapi demo assistant
// took, newest first — number, name/business, summary, transcript,
// recording, duration, timestamp.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const rows = (await sql()`
    SELECT * FROM catchall_calls ORDER BY created_at DESC LIMIT 200`) as any[];
  return NextResponse.json({ calls: rows });
}

// DELETE { id } — remove one call entry. Never touches SMS threads, dialer
// leads, or blocks the number — it only clears this log.
export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  await sql()`DELETE FROM catchall_calls WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
