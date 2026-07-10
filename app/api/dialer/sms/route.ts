import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  normalizePhone,
  sql,
  twilio,
  twilioEnv,
  unauthorized,
} from "@/lib/dialer/core";

export const maxDuration = 60;

// GET — conversation threads (latest message per number + unread counts).
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const rows = (await sql()`
    SELECT DISTINCT ON (m.phone)
      m.phone, m.body, m.direction, m.created_at,
      (SELECT count(*)::int FROM dialer_messages u
        WHERE u.phone = m.phone AND u.direction = 'in' AND NOT u.read) AS unread,
      l.id AS lead_id, l.name, l.business, l.status AS lead_status
    FROM dialer_messages m
    LEFT JOIN dialer_leads l ON l.phone = m.phone
    ORDER BY m.phone, m.created_at DESC`) as any[];
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ threads: rows });
}

// POST { phone, body } — send an SMS from the local Twilio number.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const payload = await request.json().catch(() => ({}));
  const phone = normalizePhone(String(payload?.phone ?? ""));
  const body = String(payload?.body ?? "").trim();
  if (!phone) return NextResponse.json({ error: "Bad phone number" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  if (body.length > 1200) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const leads = (await sql()`SELECT status FROM dialer_leads WHERE phone = ${phone}`) as any[];
  if (leads[0]?.status === "dnc") {
    return NextResponse.json({ error: "Number is on the do-not-call list" }, { status: 400 });
  }

  const { from } = twilioEnv();
  try {
    const msg = await twilio("/Messages.json", { To: phone, From: from, Body: body });
    await sql()`
      INSERT INTO dialer_messages (phone, direction, body, sid, read)
      VALUES (${phone}, 'out', ${body}, ${msg.sid || null}, true)`;
    return NextResponse.json({ ok: true, sid: msg.sid });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Send failed" }, { status: 502 });
  }
}
