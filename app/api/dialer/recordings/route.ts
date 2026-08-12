import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  purgeExpiredRecordings,
  purgeNonConversationRecordings,
  sql,
  unauthorized,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// GET — real conversations from the last 24h with playable recordings + lead
// context. Only calls where a prospect actually picked up and talked:
// - AMD said human (or never reported — manual/edge calls), 8s+ connect.
//   'unknown' AMD is a voicemail greeting more often than a person, so it
//   only shows when the agent's own marking proves a conversation happened.
// - Never when the lead was marked no-answer or voicemail: whatever was
//   recorded, it wasn't the prospect talking.
// Purges expired + non-conversation audio first so the list never shows
// something unplayable and voicemail greetings don't sit on Twilio.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  await purgeExpiredRecordings();
  await purgeNonConversationRecordings();
  const rows = (await sql()`
    SELECT c.id, c.call_sid, c.status, c.amd, c.recording_sid, c.recording_deleted,
           c.duration_seconds, c.started_at,
           l.id AS lead_id, l.name, l.business, l.phone, l.status AS lead_status
    FROM dialer_calls c
    LEFT JOIN dialer_leads l ON l.id = c.lead_id
    WHERE c.started_at > now() - interval '24 hours'
      AND NOT c.wave_lost
      AND c.status = 'completed'
      AND c.duration_seconds >= 8
      AND COALESCE(l.status, '') NOT IN ('no_answer', 'voicemail')
      AND (
        COALESCE(c.amd, '') IN ('human', '')
        OR (
          c.amd NOT LIKE 'machine%' AND c.amd <> 'fax'
          AND COALESCE(l.status, '') NOT IN ('', 'new', 'sms_sent')
        )
      )
    ORDER BY c.started_at DESC
    LIMIT 200`) as any[];
  return NextResponse.json({ calls: rows });
}
