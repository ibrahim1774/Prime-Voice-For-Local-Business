// Pure-logic checks for lib/setupCalls (no network, no DB).
// Run: npx -y tsx scripts/setup-calls.test.ts
import assert from "node:assert/strict";
import {
  parseEventStart,
  formatWhen,
  extractBookingFromReport,
  buildIcs,
  confirmationSms,
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

// No booking → null (the pitch SMS path stays untouched).
assert.equal(extractBookingFromReport({ artifact: { messages: [] }, analysis: { structuredData: { qualified: true } } }), null);

const row = {
  id: 7, vapi_call_id: "call-1", phone: "+19285550123", email: "joe@desertplumbing.com",
  name: "Joe Ortiz", business: "Desert Plumbing", start_at: "2026-09-09T17:00:00.000Z", timezone: "America/Phoenix",
};
const sms = confirmationSms(row);
assert.match(sms, /You're booked, Joe!/);
assert.match(sms, /Wednesday, Sep 9 at 10:00 AM MST/);
assert.match(sms, /joe@desertplumbing.com/);
const ics = buildIcs(row);
assert.match(ics, /DTSTART:20260909T170000Z/);
assert.match(ics, /DTEND:20260909T171500Z/);
assert.match(ics, /METHOD:REQUEST/);
assert.match(ics, /ATTENDEE;CN=Joe Ortiz;RSVP=TRUE:mailto:joe@desertplumbing.com/);

console.log("setupCalls: all assertions passed");
console.log("--- sample SMS ---\n" + sms);
