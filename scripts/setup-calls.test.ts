// Pure-logic checks for lib/setupCalls (no network, no DB).
// Run: npx -y tsx scripts/setup-calls.test.ts
import assert from "node:assert/strict";
import {
  parseEventStart,
  formatWhen,
  extractBookingFromReport,
  buildIcs,
  confirmationSms,
  reminderSms,
  googleCalendarUrl,
  confirmationEmail,
} from "../lib/setupCalls";

// Wall-clock time in the event's zone resolves to the right instant (DST on).
const phx = parseEventStart("2026-09-09T10:00:00", "America/Phoenix")!;
assert.equal(phx.toISOString(), "2026-09-09T17:00:00.000Z");
const ny = parseEventStart("2026-09-09T10:00:00", "America/New_York")!;
assert.equal(ny.toISOString(), "2026-09-09T14:00:00.000Z");
// Explicit offset wins over the zone.
const withOff = parseEventStart("2026-09-09T10:00:00-07:00", "America/New_York")!;
assert.equal(withOff.toISOString(), "2026-09-09T17:00:00.000Z");
// Winter (DST off) — New York is UTC-5.
const jan = parseEventStart("2027-01-12T09:30:00", "America/New_York")!;
assert.equal(jan.toISOString(), "2027-01-12T14:30:00.000Z");
assert.equal(parseEventStart("garbage", "America/New_York"), null);

assert.equal(formatWhen(phx, "America/Phoenix"), "Wednesday, Sep 9 at 10:00 AM MST");
assert.equal(formatWhen(ny, "America/New_York"), "Wednesday, Sep 9 at 10:00 AM EDT");

// A Google Calendar tool call as Vapi logs it in artifact.messages.
const report = {
  call: { id: "call-1" },
  artifact: {
    messages: [
      { role: "assistant", message: "What day works for you?" },
      {
        role: "tool_calls",
        toolCalls: [
          {
            id: "tc-avail",
            type: "function",
            function: {
              name: "check_calendar_availability",
              arguments: JSON.stringify({ startDateTime: "2026-09-09T09:00:00", endDateTime: "2026-09-09T18:00:00", timeZone: "America/Phoenix" }),
            },
          },
        ],
      },
      { role: "tool_call_result", toolCallId: "tc-avail", name: "check_calendar_availability", result: "{\"available\":true}" },
      {
        role: "tool_calls",
        toolCalls: [
          {
            id: "tc-fail",
            type: "function",
            function: {
              name: "book_setup_call",
              arguments: JSON.stringify({ summary: "x", startDateTime: "2026-09-09T09:00:00", endDateTime: "2026-09-09T09:15:00", timeZone: "America/Phoenix", attendees: ["Bad@Example.com"] }),
            },
          },
        ],
      },
      { role: "tool_call_result", toolCallId: "tc-fail", name: "book_setup_call", result: "{\"error\":\"conflict\"}" },
      {
        role: "tool_calls",
        toolCalls: [
          {
            id: "tc-book",
            type: "function",
            function: {
              name: "book_setup_call",
              arguments: JSON.stringify({
                summary: "Montivaro setup call — Desert Plumbing",
                startDateTime: "2026-09-09T10:00:00",
                endDateTime: "2026-09-09T10:15:00",
                timeZone: "America/Phoenix",
                attendees: [{ email: "Joe@DesertPlumbing.com" }],
                description: "Joe — Desert Plumbing — +19285550123. MODE: video",
              }),
            },
          },
        ],
      },
      { role: "tool_call_result", toolCallId: "tc-book", name: "book_setup_call", result: "{\"id\":\"evt_1\",\"status\":\"confirmed\"}" },
    ],
  },
  analysis: { structuredData: { name: "Joe", businessName: "Desert Plumbing" } },
};

const b = extractBookingFromReport(report, "book_setup_call")!;
assert.ok(b, "booking found");
assert.equal(b.source, "tool");
assert.equal(b.startAt.toISOString(), "2026-09-09T17:00:00.000Z");
assert.equal(b.timeZone, "America/Phoenix");
assert.equal(b.email, "joe@desertplumbing.com");
assert.equal(b.mode, "video", "MODE tag in the description wins");

// Without the configured name it still finds the booking by shape, and the
// availability check is never mistaken for it.
const b2 = extractBookingFromReport(report)!;
assert.equal(b2.startAt.toISOString(), "2026-09-09T17:00:00.000Z");

// Structured-data fallback when no tool call is logged.
const fallback = extractBookingFromReport({
  artifact: { messages: [] },
  analysis: {
    structuredData: { bookedSetupCall: true, setupCallStart: "2026-09-10T14:00:00", setupCallTimeZone: "America/Chicago", email: "a@b.co" },
  },
})!;
assert.equal(fallback.source, "structured");
assert.equal(fallback.startAt.toISOString(), "2026-09-10T19:00:00.000Z");
assert.equal(fallback.mode, "phone", "no mode anywhere → phone");

// No booking → null (the pitch SMS path stays untouched).
assert.equal(extractBookingFromReport({ artifact: { messages: [] }, analysis: { structuredData: { qualified: true } } }), null);

const row = {
  id: 7, vapi_call_id: "call-1", phone: "+19285550123", email: "joe@desertplumbing.com",
  name: "Joe Ortiz", business: "Desert Plumbing", start_at: "2026-09-09T17:00:00.000Z", timezone: "America/Phoenix",
  token: "abc123XYZ_-4", mode: "phone" as const,
  summary: "Joe runs Desert Plumbing in Phoenix and wants after-hours calls answered and emergency jobs booked so he stops losing them to voicemail.",
  goal: "After-hours answering + emergency job booking",
};
const sms = confirmationSms(row);
assert.match(sms, /You're booked, Joe!/);
assert.match(sms, /Wednesday, Sep 9 at 10:00 AM MST/);
assert.match(sms, /nothing to join/);
assert.match(sms, /https:\/\/www\.montivaro\.com\/c\/abc123XYZ_-4/);
assert.match(reminderSms(row, "24h"), /montivaro\.com\/c\/abc123XYZ_-4/);
const gcal = new URL(googleCalendarUrl(row));
assert.equal(gcal.searchParams.get("dates"), "20260909T170000Z/20260909T171500Z");
assert.equal(gcal.searchParams.get("ctz"), "America/Phoenix");
assert.match(gcal.searchParams.get("text")!, /Desert Plumbing/);
const ics = buildIcs(row);
assert.match(ics, /montivaro\.com\/c\/abc123XYZ_-4/);
assert.match(ics, /DTSTART:20260909T170000Z/);
assert.match(ics, /DTEND:20260909T171500Z/);
assert.match(ics, /METHOD:REQUEST/);
assert.match(ics, /ATTENDEE;CN=Joe Ortiz;RSVP=TRUE:mailto:joe@desertplumbing.com/);
assert.doesNotMatch(ics, /LOCATION:/);

// Video booking with no Meet link configured falls back to phone wording —
// never a dangling "join here" with nothing to join.
const videoRow = { ...row, mode: "video" as const };
delete process.env.SETUP_CALL_VIDEO_URL;
assert.match(confirmationSms(videoRow), /nothing to join/);

// With the room configured, every channel carries the link instead of the
// "we call you" line.
process.env.SETUP_CALL_VIDEO_URL = "https://meet.google.com/abc-defg-hij";
const vsms = confirmationSms(videoRow);
assert.match(vsms, /setup video call/);
assert.match(vsms, /📹 Join here at that time: https:\/\/meet\.google\.com\/abc-defg-hij/);
assert.doesNotMatch(vsms, /We'll call you/);
assert.match(reminderSms(videoRow, "1h"), /Join here: https:\/\/meet\.google\.com\/abc-defg-hij/);
assert.match(reminderSms(videoRow, "24h"), /Join link \+ details: https:\/\/www\.montivaro\.com\/c\/abc123XYZ_-4/);
const vics = buildIcs(videoRow);
assert.match(vics, /SUMMARY:Montivaro setup video call — Desert Plumbing/);
assert.match(vics, /LOCATION:https:\/\/meet\.google\.com\/abc-defg-hij/);
assert.match(vics, /URL:https:\/\/meet\.google\.com\/abc-defg-hij/);
const vgcal = new URL(googleCalendarUrl(videoRow));
assert.equal(vgcal.searchParams.get("location"), "https://meet.google.com/abc-defg-hij");
// Phone bookings are untouched by the room being configured.
assert.match(confirmationSms(row), /nothing to join/);
assert.doesNotMatch(buildIcs(row), /LOCATION:/);
console.log("--- sample video SMS ---\n" + vsms);

// Confirmation email replays the call as a sample lead alert.
const mail = confirmationEmail(row);
assert.match(mail.text, /A SAMPLE OF WHAT YOU'D GET AFTER EVERY CALL/);
assert.match(mail.text, /🔔 New lead — Joe Ortiz from Desert Plumbing/);
assert.match(mail.text, /What they wanted: After-hours answering \+ emergency job booking/);
assert.match(mail.text, /Summary: Joe runs Desert Plumbing/);
assert.match(mail.text, /📞 \+19285550123/);
// Nothing from the analysis → no sample block, email still complete.
const bare = confirmationEmail({ ...row, summary: "", goal: "" });
assert.doesNotMatch(bare.text, /SAMPLE OF WHAT/);
assert.match(bare.text, /Need a different time/);
console.log("--- sample confirmation email ---\n" + mail.text);

console.log("setupCalls: all assertions passed");
console.log("--- sample SMS ---\n" + sms);
