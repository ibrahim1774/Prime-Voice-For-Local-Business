import crypto from "crypto";
import { ensureSchema, sql, twilio, normalizePhone } from "@/lib/dialer/core";

// Setup-call bookings made by the catch-all demo assistant mid-call.
//
// The assistant books the slot itself through the calendar tools attached in
// Vapi (Google Calendar, or GoHighLevel). The calendar owns the appointment —
// it lands on Ibrahim's calendar and, when the tool carries the caller's email
// as an attendee, the caller gets the calendar invite from the calendar
// provider. This module handles everything AROUND that booking:
//   - pull the booked slot out of the end-of-call report (the tool call the
//     assistant made, with the structured-data extraction as fallback),
//   - persist it so the reminder cron can find it,
//   - text the caller a confirmation (Twilio) and email one when Resend is
//     configured,
//   - ping the owner,
//   - send the 24-hour and 1-hour reminders.

export const OWNER_ALERT_NUMBER = "+13476131906";
const CALL_MINUTES = 15;
const SITE = "https://www.montivaro.com";

export type CallMode = "phone" | "video";

export interface Booking {
  startAt: Date;
  timeZone: string;
  email: string;
  // Phone (we dial them) or video (they join the shared Meet room).
  mode: CallMode;
  // Where the slot came from: the calendar tool call, or the analysis fallback.
  source: "tool" | "structured";
}

export interface SetupCallRow {
  id: number;
  vapi_call_id: string | null;
  phone: string;
  email: string;
  name: string;
  business: string;
  start_at: string;
  timezone: string;
  mode: CallMode;
  // Unguessable id for the public /c/<token> page in the texts and emails.
  token: string;
}

// One permanent Google Meet room (owner's "create a meeting for later"
// link). Availability checks keep bookings from overlapping, so the room is
// reused, never shared. Unset → every booking is a phone call, and Keith is
// never told to offer video (sync-config reads the same variable).
export function videoUrl(): string {
  return process.env.SETUP_CALL_VIDEO_URL?.trim() || "";
}

// A booking is treated as video only when the link exists to send.
export function isVideo(row: Pick<SetupCallRow, "mode">): boolean {
  return row.mode === "video" && Boolean(videoUrl());
}

// ── schema ──────────────────────────────────────────────────────────────────

let ready = false;
export async function ensureSetupCallsSchema() {
  if (ready) return;
  await ensureSchema();
  await sql()`CREATE TABLE IF NOT EXISTS setup_calls (
    id serial PRIMARY KEY,
    vapi_call_id text UNIQUE,
    phone text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    name text NOT NULL DEFAULT '',
    business text NOT NULL DEFAULT '',
    start_at timestamptz NOT NULL,
    timezone text NOT NULL DEFAULT 'America/New_York',
    source text NOT NULL DEFAULT 'tool',
    confirm_sms_sid text NOT NULL DEFAULT '',
    reminded_24h_at timestamptz,
    reminded_1h_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS setup_calls_start_idx ON setup_calls (start_at)`;
  await sql()`ALTER TABLE setup_calls ADD COLUMN IF NOT EXISTS token text`;
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS setup_calls_token_idx ON setup_calls (token)`;
  await sql()`ALTER TABLE setup_calls ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'phone'`;
  ready = true;
}

function newToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function calendarPageUrl(row: Pick<SetupCallRow, "token">): string {
  return `${SITE}/c/${row.token}`;
}

// Prefilled "add to Google Calendar" link — works for anyone with a Google
// account, invited or not (the event's own link only opens for invitees).
export function googleCalendarUrl(row: SetupCallRow): string {
  const start = new Date(row.start_at);
  const end = new Date(start.getTime() + CALL_MINUTES * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Montivaro setup call${row.business ? ` — ${row.business}` : ""}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: howItWorks(row) + `\nDetails: ${calendarPageUrl(row)}`,
    ctz: isValidTimeZone(row.timezone) ? row.timezone : "America/New_York",
  });
  if (isVideo(row)) params.set("location", videoUrl());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// The one sentence every channel repeats about how the call happens.
export function howItWorks(row: Pick<SetupCallRow, "mode" | "phone">): string {
  return isVideo(row)
    ? `Video call — join here at that time: ${videoUrl()}`
    : `Montivaro will call you at ${row.phone} to set up your AI receptionist. Nothing to join — we call you.`;
}

export async function getSetupCallByToken(token: string): Promise<SetupCallRow | null> {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return null;
  await ensureSetupCallsSchema();
  const rows = (await sql()`
    SELECT id, vapi_call_id, phone, email, name, business, start_at, timezone, mode, token
    FROM setup_calls WHERE token = ${token} LIMIT 1`) as SetupCallRow[];
  return rows[0] || null;
}

// ── time helpers ────────────────────────────────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

// Calendar tools hand back either a full ISO instant ("…T10:00:00-07:00") or
// a wall-clock time meant in the event's time zone ("…T10:00:00"). Both must
// resolve to the same instant.
export function parseEventStart(raw: string, tz: string): Date | null {
  const wall = (raw || "").trim();
  if (!wall) return null;
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(wall)) {
    const d = new Date(wall);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const zone = isValidTimeZone(tz) ? tz : "America/New_York";
  let guess = asUtc - tzOffsetMs(new Date(asUtc), zone);
  const second = tzOffsetMs(new Date(guess), zone);
  guess = asUtc - second;
  return new Date(guess);
}

// "Tuesday, Sep 9 at 10:00 AM MST"
export function formatWhen(date: Date, tz: string): string {
  const zone = isValidTimeZone(tz) ? tz : "America/New_York";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${day} at ${time}`;
}

// ── extracting the booking from the end-of-call report ──────────────────────

function parseArgs(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

function firstEmail(args: Record<string, any>): string {
  const att = args.attendees;
  if (Array.isArray(att)) {
    for (const a of att) {
      const e = typeof a === "string" ? a : a?.email;
      if (typeof e === "string" && e.includes("@")) return e.trim().toLowerCase();
    }
  } else if (typeof att === "string" && att.includes("@")) {
    return att.trim().toLowerCase();
  }
  for (const k of ["email", "attendeeEmail", "contactEmail"]) {
    if (typeof args[k] === "string" && args[k].includes("@")) return args[k].trim().toLowerCase();
  }
  return "";
}

// Keith tags the event description "MODE: video" / "MODE: phone".
function modeFrom(text: unknown): CallMode | null {
  if (typeof text !== "string") return null;
  const m = text.match(/MODE:\s*(video|phone)/i);
  return m ? (m[1].toLowerCase() as CallMode) : null;
}

function looksLikeError(result: unknown): boolean {
  if (result == null) return false;
  const text = typeof result === "string" ? result : JSON.stringify(result);
  return /"error"|"success"\s*:\s*false|^\s*error|failed|unauthorized|forbidden/i.test(text.slice(0, 400));
}

// Finds the create-event tool call the assistant made during the call. Vapi
// logs tool calls in artifact.messages as {role:"tool_calls", toolCalls:[…]}
// with each result as {role:"tool_call_result", toolCallId, result}. The
// bookingToolName comes from app_config (whatever sync-config attached); when
// it's unknown we accept any call whose arguments carry an event start.
export function extractBookingFromReport(
  message: any,
  bookingToolName?: string
): Booking | null {
  const messages: any[] = Array.isArray(message?.artifact?.messages)
    ? message.artifact.messages
    : Array.isArray(message?.messages)
      ? message.messages
      : [];

  const results = new Map<string, unknown>();
  for (const m of messages) {
    if (m?.role === "tool_call_result" || m?.toolCallId) {
      if (m.toolCallId) results.set(String(m.toolCallId), m.result ?? m.content ?? "");
    }
  }

  let found: Booking | null = null;
  let foundTagged = false;
  for (const m of messages) {
    const calls: any[] = Array.isArray(m?.toolCalls)
      ? m.toolCalls
      : Array.isArray(m?.toolCallList)
        ? m.toolCallList
        : [];
    for (const tc of calls) {
      const name: string = tc?.function?.name || tc?.name || "";
      const args = parseArgs(tc?.function?.arguments ?? tc?.arguments ?? tc?.parameters);
      const start = args.startDateTime || args.startTime || args.start || args.start_time;
      if (typeof start !== "string") continue;
      const isBooking = bookingToolName
        ? name === bookingToolName
        : /create|book|schedule|event/i.test(name) || Boolean(args.summary || args.attendees);
      if (!isBooking) continue;
      if (/availability|check|free/i.test(name) && !bookingToolName) continue;
      const id = tc?.id ? String(tc.id) : "";
      if (id && results.has(id) && looksLikeError(results.get(id))) continue;
      const tz: string =
        args.timeZone || args.timezone || args.time_zone || args.tz || "America/New_York";
      const startAt = parseEventStart(start, tz);
      if (!startAt) continue;
      // Keep the LAST successful booking — a re-book after a failed attempt
      // is the one that stuck.
      const tagged = modeFrom(args.description) || modeFrom(args.summary);
      foundTagged = Boolean(tagged);
      found = {
        startAt,
        timeZone: isValidTimeZone(tz) ? tz : "America/New_York",
        email: firstEmail(args),
        mode: tagged || "phone",
        source: "tool",
      };
    }
  }
  const s: any = message?.analysis?.structuredData || {};
  if (found) {
    // The description tag is authoritative; the analysis fills in only when
    // the tool call carried no tag (the model dropped it).
    if (!foundTagged && s.setupCallMode === "video") found.mode = "video";
    return found;
  }

  if (s.bookedSetupCall === true && typeof s.setupCallStart === "string") {
    const tz = typeof s.setupCallTimeZone === "string" && isValidTimeZone(s.setupCallTimeZone)
      ? s.setupCallTimeZone
      : "America/New_York";
    const startAt = parseEventStart(s.setupCallStart, tz);
    if (startAt) {
      return {
        startAt,
        timeZone: tz,
        email: typeof s.email === "string" && s.email.includes("@") ? s.email.trim().toLowerCase() : "",
        mode: s.setupCallMode === "video" ? "video" : "phone",
        source: "structured",
      };
    }
  }
  return null;
}

// ── persistence ─────────────────────────────────────────────────────────────

export async function saveSetupCall(input: {
  vapiCallId: string | null;
  phone: string;
  email: string;
  name: string;
  business: string;
  booking: Booking;
}): Promise<SetupCallRow | null> {
  await ensureSetupCallsSchema();
  const rows = (await sql()`
    INSERT INTO setup_calls (vapi_call_id, phone, email, name, business, start_at, timezone, source, token, mode)
    VALUES (${input.vapiCallId}, ${input.phone}, ${input.email}, ${input.name}, ${input.business},
            ${input.booking.startAt.toISOString()}, ${input.booking.timeZone}, ${input.booking.source}, ${newToken()},
            ${input.booking.mode === "video" ? "video" : "phone"})
    ON CONFLICT (vapi_call_id) DO NOTHING
    RETURNING id, vapi_call_id, phone, email, name, business, start_at, timezone, mode, token`) as SetupCallRow[];
  return rows[0] || null;
}

// ── messaging ───────────────────────────────────────────────────────────────

export async function sendSms(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!from) throw new Error("TWILIO_FROM_NUMBER missing");
  const json = await twilio("/Messages.json", { To: to, From: from, Body: body });
  return json?.sid || "";
}

export function confirmationSms(row: SetupCallRow): string {
  const when = formatWhen(new Date(row.start_at), row.timezone);
  const hi = row.name ? `, ${row.name.split(/\s+/)[0]}` : "";
  const video = isVideo(row);
  return [
    `✅ You're booked${hi}!`,
    `Montivaro setup ${video ? "video call" : "call"} — ${when}.`,
    video ? `📹 Join here at that time: ${videoUrl()}` : `We'll call you at ${row.phone} — nothing to join.`,
    `📅 Add it to your calendar: ${calendarPageUrl(row)}`,
    `We'll text you a reminder before the call. Need a different time? Just reply here.`,
  ].join("\n");
}

export function reminderSms(row: SetupCallRow, kind: "24h" | "1h"): string {
  const when = formatWhen(new Date(row.start_at), row.timezone);
  const video = isVideo(row);
  if (kind === "24h") {
    return [
      `⏰ Reminder: your Montivaro setup ${video ? "video call" : "call"} is tomorrow — ${when}.`,
      video ? `Join link + details: ${calendarPageUrl(row)}` : `We'll call you at this number. Details: ${calendarPageUrl(row)}`,
      `Reply if you need to reschedule.`,
    ].join("\n");
  }
  return [
    `⏰ Your Montivaro setup ${video ? "video call" : "call"} is in about an hour — ${when}.`,
    video ? `📹 Join here: ${videoUrl()}` : `We'll call you at this number — nothing to join. Talk soon!`,
  ].join("\n");
}

export function ownerSms(row: SetupCallRow): string {
  const whenEt = formatWhen(new Date(row.start_at), "America/New_York");
  const who = [row.name, row.business].filter(Boolean).join(" — ") || "Unknown caller";
  return `📅 Setup ${isVideo(row) ? "VIDEO call" : "call"} booked: ${who} — ${whenEt} — ${row.phone}${row.email ? ` — ${row.email}` : ""}`;
}

// RFC 5545 invite so mail clients that don't get the calendar provider's own
// invitation (or when the booking came through GoHighLevel) still show the
// call as an event with a reminder.
export function buildIcs(row: SetupCallRow): string {
  const start = new Date(row.start_at);
  const end = new Date(start.getTime() + CALL_MINUTES * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const organizer = process.env.SETUP_CALL_OWNER_EMAIL?.trim();
  const description = `${howItWorks(row)}\nDetails: ${calendarPageUrl(row)}`;
  const video = isVideo(row);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Montivaro//Setup Call//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:setup-call-${row.id}@montivaro.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Montivaro setup ${video ? "video call" : "call"}${row.business ? ` — ${row.business}` : ""}`)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(video ? [`LOCATION:${esc(videoUrl())}`, `URL:${videoUrl()}`] : []),
    ...(organizer ? [`ORGANIZER;CN=Montivaro:mailto:${organizer}`] : []),
    ...(row.email ? [`ATTENDEE;CN=${esc(row.name || row.email)};RSVP=TRUE:mailto:${row.email}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Montivaro setup call in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// Email goes out only when Resend is configured (RESEND_API_KEY +, ideally,
// SETUP_CALL_FROM_EMAIL on a verified domain). Without it the calendar
// provider's own invite is the caller's email touchpoint, and SMS carries the
// confirmation + reminders — so this is fail-soft by design.
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  ics?: string;
}): Promise<"sent" | "skipped"> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !input.to) return "skipped";
  const from = process.env.SETUP_CALL_FROM_EMAIL?.trim() || "Montivaro <calls@montivaro.com>";
  const body: Record<string, any> = {
    from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  };
  if (input.ics) {
    body.attachments = [
      {
        filename: "montivaro-setup-call.ics",
        content: Buffer.from(input.ics, "utf8").toString("base64"),
        content_type: "text/calendar; method=REQUEST",
      },
    ];
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Resend ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return "sent";
}

export function confirmationEmail(row: SetupCallRow): { subject: string; text: string } {
  const when = formatWhen(new Date(row.start_at), row.timezone);
  const hi = row.name ? ` ${row.name.split(/\s+/)[0]}` : "";
  return {
    subject: `You're booked — Montivaro setup call, ${when}`,
    text: [
      `Hi${hi},`,
      ``,
      `Your Montivaro setup ${isVideo(row) ? "video call" : "call"} is booked for ${when}.`,
      `${howItWorks(row)} The attached invite adds it to your calendar with a reminder.`,
      ``,
      `Add to calendar / details: ${calendarPageUrl(row)}`,
      ``,
      `Need a different time? Reply to this email or to our text.`,
      ``,
      `— The Montivaro team`,
    ].join("\n"),
  };
}

export function reminderEmail(row: SetupCallRow): { subject: string; text: string } {
  const when = formatWhen(new Date(row.start_at), row.timezone);
  return {
    subject: `Reminder: Montivaro setup call tomorrow, ${when}`,
    text: [
      `Quick reminder — your Montivaro setup ${isVideo(row) ? "video call" : "call"} is tomorrow, ${when}.`,
      howItWorks(row),
      `Details: ${calendarPageUrl(row)}`,
      ``,
      `Need to reschedule? Just reply to this email.`,
      ``,
      `— The Montivaro team`,
    ].join("\n"),
  };
}

// ── the booking hand-off used by the call-report webhook ────────────────────

export async function handleBookedSetupCall(input: {
  vapiCallId: string | null;
  callerNumber: string;
  name: string;
  business: string;
  booking: Booking;
}): Promise<SetupCallRow | null> {
  const phone = normalizePhone(input.callerNumber) || input.callerNumber;
  const row = await saveSetupCall({
    vapiCallId: input.vapiCallId,
    phone,
    email: input.booking.email,
    name: input.name,
    business: input.business,
    booking: input.booking,
  });
  if (!row) return null; // duplicate delivery — already handled

  try {
    const sid = await sendSms(row.phone, confirmationSms(row));
    await sql()`UPDATE setup_calls SET confirm_sms_sid = ${sid} WHERE id = ${row.id}`;
    console.log(`setup-call: confirmation SMS sent to ${row.phone} (${sid})`);
  } catch (err) {
    console.error("setup-call: confirmation SMS failed", err);
  }

  try {
    await sendSms(OWNER_ALERT_NUMBER, ownerSms(row));
  } catch (err) {
    console.error("setup-call: owner ping failed", err);
  }

  if (row.email) {
    try {
      const mail = confirmationEmail(row);
      const status = await sendEmail({ to: row.email, ...mail, ics: buildIcs(row) });
      console.log(`setup-call: confirmation email ${status} for ${row.email}`);
    } catch (err) {
      console.error("setup-call: confirmation email failed", err);
    }
  }
  return row;
}

// ── reminders (cron) ────────────────────────────────────────────────────────

// Windows are wider than the cron interval so a slow tick can't skip one; the
// reminded_* columns stop a second tick from sending it twice.
export async function sendDueReminders(now = new Date()): Promise<{ h24: number; h1: number }> {
  await ensureSetupCallsSchema();
  const q = sql();
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const H = 3_600_000;

  const due24 = (await q`
    SELECT id, vapi_call_id, phone, email, name, business, start_at, timezone, mode, token
    FROM setup_calls
    WHERE reminded_24h_at IS NULL
      AND start_at BETWEEN ${iso(23 * H)} AND ${iso(25 * H)}
    ORDER BY start_at`) as SetupCallRow[];
  let h24 = 0;
  for (const row of due24) {
    const claimed = (await q`
      UPDATE setup_calls SET reminded_24h_at = now()
      WHERE id = ${row.id} AND reminded_24h_at IS NULL RETURNING id`) as any[];
    if (claimed.length === 0) continue;
    try {
      await sendSms(row.phone, reminderSms(row, "24h"));
      h24++;
    } catch (err) {
      console.error(`setup-call: 24h SMS failed for #${row.id}`, err);
    }
    if (row.email) {
      try {
        await sendEmail({ to: row.email, ...reminderEmail(row) });
      } catch (err) {
        console.error(`setup-call: 24h email failed for #${row.id}`, err);
      }
    }
  }

  const due1 = (await q`
    SELECT id, vapi_call_id, phone, email, name, business, start_at, timezone, mode, token
    FROM setup_calls
    WHERE reminded_1h_at IS NULL
      AND start_at BETWEEN ${iso(0.5 * H)} AND ${iso(1.5 * H)}
    ORDER BY start_at`) as SetupCallRow[];
  let h1 = 0;
  for (const row of due1) {
    const claimed = (await q`
      UPDATE setup_calls SET reminded_1h_at = now()
      WHERE id = ${row.id} AND reminded_1h_at IS NULL RETURNING id`) as any[];
    if (claimed.length === 0) continue;
    try {
      await sendSms(row.phone, reminderSms(row, "1h"));
      h1++;
    } catch (err) {
      console.error(`setup-call: 1h SMS failed for #${row.id}`, err);
    }
  }
  return { h24, h1 };
}
