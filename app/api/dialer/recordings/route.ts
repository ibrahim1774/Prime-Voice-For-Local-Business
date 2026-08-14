import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  purgeExpiredRecordings,
  purgeNonConversationRecordings,
  sql,
  twilio,
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

// DELETE ?id=<callId> — remove one call from the log for good: the Twilio
// recording first (when one still exists), then the dialer_calls row. The
// lead and its status are untouched — this only erases the call line.
export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Pass a call id" }, { status: 400 });
  }
  const rows = (await sql()`
    SELECT id, recording_sid, recording_deleted FROM dialer_calls WHERE id = ${id}`) as any[];
  if (!rows.length) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  const call = rows[0];
  if (call.recording_sid && !call.recording_deleted) {
    try {
      await twilio(`/Recordings/${call.recording_sid}.json`, undefined, "DELETE");
    } catch (err: any) {
      // 404 = already gone on Twilio's side; anything else must NOT leave an
      // orphaned recording behind a deleted row — surface it instead.
      if (!String(err?.message || "").includes("404")) {
        return NextResponse.json({ error: "Could not delete the recording — try again" }, { status: 502 });
      }
    }
  }
  await sql()`DELETE FROM dialer_calls WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
