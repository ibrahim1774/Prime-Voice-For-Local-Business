import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  purgeExpiredRecordings,
  sql,
  unauthorized,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// GET — calls from the last 24h with playable recordings + lead context.
// Purges expired audio first so the list never shows something unplayable.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  await purgeExpiredRecordings();
  const rows = (await sql()`
    SELECT c.id, c.call_sid, c.status, c.amd, c.recording_sid, c.recording_deleted,
           c.duration_seconds, c.started_at,
           l.id AS lead_id, l.name, l.business, l.phone, l.status AS lead_status
    FROM dialer_calls c
    LEFT JOIN dialer_leads l ON l.id = c.lead_id
    WHERE c.started_at > now() - interval '24 hours'
    ORDER BY c.started_at DESC
    LIMIT 200`) as any[];
  return NextResponse.json({ calls: rows });
}
