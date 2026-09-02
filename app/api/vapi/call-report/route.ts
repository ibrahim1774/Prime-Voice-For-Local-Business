import { NextRequest, NextResponse } from "next/server";
import { sendMetaEvent } from "@/lib/metaCapi";
import { ensureSchema, sql } from "@/lib/dialer/core";
import { after } from "next/server";
import {
  OWNER_ALERT_NUMBER,
  extractBookingFromReport,
  handleBookedSetupCall,
} from "@/lib/setupCalls";

// Vapi end-of-call-report webhook for the demo assistants.
//
// Four lines report here: the catch-all Montivaro demo, the dentist and
// contractors vertical demos (all three: the caller experiences the
// receptionist, then 30 seconds after hangup THEY receive the lead-alert SMS
// an owner would get), and the Prime Barber line (a barber asks about the
// $97/month program and gets the Prime Barber pitch text).
//
// Auth: Vapi sends the assistant's server secret in x-vapi-secret; anything
// else is rejected, so nobody can trigger SMS sends to arbitrary numbers.

export const maxDuration = 90;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";
const PRIMEBARBER_ASSISTANT_ID = "52d9dbcd-a215-4794-8bd7-fe2bd982fd35";
const SMS_DELAY_MS = 20_000;

type Product = "montivaro" | "primebarber" | "dentist" | "contractors" | "website";

const VERTICAL_KEYS: Record<string, Product> = {
  dentist_assistant_id: "dentist",
  contractors_assistant_id: "contractors",
  website_assistant_id: "website",
};

// The vertical assistants (dentist, contractors, $97 website) live in the
// Vapi dashboard and their ids land in app_config via /api/vapi/
// sync-verticals. Cached briefly; an empty result is never cached, so a call
// right after provisioning can't be misattributed for the cache window. Runs
// inside after(), so this lookup never delays the webhook response.
let vertCache: { map: Record<string, Product>; at: number } = { map: {}, at: 0 };
async function verticalAssistants(): Promise<Record<string, Product>> {
  const filled = Object.keys(vertCache.map).length > 0;
  if (filled && Date.now() - vertCache.at < 60_000) return vertCache.map;
  try {
    await ensureSchema();
    const keys = Object.keys(VERTICAL_KEYS);
    const rows = (await sql()`
      SELECT key, value FROM app_config WHERE key = ANY(${keys})`) as any[];
    const map: Record<string, Product> = {};
    for (const r of rows) {
      if (r.value && VERTICAL_KEYS[r.key]) map[r.value] = VERTICAL_KEYS[r.key];
    }
    vertCache = { map, at: Date.now() };
  } catch {
    // keep whatever we had
  }
  return vertCache.map;
}

// Name of the create-event calendar tool sync-config attached to the
// catch-all assistant — lets the booking extractor match the exact tool call
// instead of guessing from argument shapes.
async function bookingToolName(): Promise<string | undefined> {
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT value FROM app_config WHERE key = 'catchall_booking_tool'`) as any[];
    const v = rows[0]?.value;
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

async function sendSms(to: string, body: string): Promise<string> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio env vars missing");

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Twilio ${resp.status}: ${json?.message || "send failed"}`);
  }
  return json?.sid || "";
}

function truncate(text: string, max: number): string {
  const t = (text || "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function buildSmsBody(lead: {
  name?: string;
  business?: string;
  summary?: string;
  callerNumber: string;
}): string {
  const who =
    lead.name && lead.business
      ? `${lead.name} from ${lead.business}`
      : lead.name || lead.business || "A caller";

  const header = [`🔔 New lead — ${who} just called.`];
  if (lead.summary) header.push(truncate(lead.summary, 240));
  header.push(`📞 ${lead.callerNumber}`);

  const pitch = [
    "Sample AI Receptionist Call Alert.",
    "",
    "We custom-build yours to your own business:",
    "• Built for your business",
    "• 24/7 or after-hours",
    "• Custom call flow",
    "• SMS/email alerts",
    "• CRM integration",
  ];

  return [
    header.join("\n"),
    pitch.join("\n"),
    "Price ranges from $199/month to $997/month depending on what your needs are - usage minutes included",
    "📅 Choose a time and we'll handle the setup.\nmontivaro.com/bookcall",
  ].join("\n\n");
}

// Dentist variant of the sample alert: same alert header, tighter pitch,
// plus the Brooklyn in-office setup line.
function buildDentistSmsBody(lead: {
  name?: string;
  business?: string;
  summary?: string;
  callerNumber: string;
}): string {
  const who =
    lead.name && lead.business
      ? `${lead.name} from ${lead.business}`
      : lead.name || lead.business || "A caller";

  const header = [`🔔 New lead — ${who} just called.`];
  if (lead.summary) header.push(truncate(lead.summary, 240));
  header.push(`📞 ${lead.callerNumber}`);

  return [
    header.join("\n"),
    [
      "Sample AI Receptionist Call Alert.",
      "",
      "Custom-built for your practice:",
      "• 24/7 or after-hours",
      "• Custom call flow",
      "• SMS/email alerts",
      "• CRM integration",
    ].join("\n"),
    "$199–$997/month — usage minutes included.",
    "We're based in Brooklyn — we'll even come to your office and set it up with you.",
    "📅 Pick the best time for us to call you:\nmontivaro.com/bookcall",
  ].join("\n\n");
}

// $97 Website line: a direct pitch recap (this line answers questions about
// the program, so the text is the offer, not a sample alert).
function buildWebsiteSmsBody(lead: { name?: string }): string {
  const hi = lead.name ? `, ${lead.name}` : "";
  return [
    `🌐 Thanks for calling about the $97/month Website System${hi}!`,
    [
      "What you get:",
      "• 20+ page custom website for your business",
      "• Live within 24–48 hours",
      "• Your own account — edit text & images anytime",
      "• On-page SEO included on every page",
      "• Hosting included — $97/month flat",
    ].join("\n"),
    "✅ Here's the best part: one of our team members will reach out with your finished website — you check it out before you ever pay.",
  ].join("\n\n");
}

function buildPrimeBarberSmsBody(lead: { name?: string }): string {
  const hi = lead.name ? `, ${lead.name}` : "";
  return [
    `💈 Thanks for calling Prime Barber${hi}!`,
    [
      "Everything your shop needs — and you own all of it:",
      "• Your own branded barbershop website",
      "• Online booking + app notifications",
      "• Sell your own products",
      "• Get paid: Stripe, PayPal, or Square",
      "• Your domain, your clients — zero commission",
    ].join("\n"),
    "🎥 Watch the inside overview:\nmontivaro.com/primebarber/video",
  ].join("\n\n");
}

export async function POST(request: NextRequest) {
  const secret = env("VAPI_WEBHOOK_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (request.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = payload?.message;
  if (message?.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true, ignored: message?.type || "unknown" });
  }

  // Keep the Make lead flow (or any other consumer) alive: forward the raw
  // report when FORWARD_WEBHOOK_URL is set. Fire-and-forget, fail-soft.
  const forwardUrl = env("FORWARD_WEBHOOK_URL");

  // Respond to Vapi immediately — it retries slow webhooks, which would
  // duplicate the SMS — so EVERYTHING that can touch the network or the
  // database (assistant attribution included) runs after the response.
  after(async () => {
    const assistantId: string | undefined =
      message?.assistant?.id || message?.call?.assistantId;
    const verticals = assistantId ? await verticalAssistants() : {};
    const product: Product | null =
      assistantId === PRIMEBARBER_ASSISTANT_ID
        ? "primebarber"
        : assistantId && verticals[assistantId]
          ? verticals[assistantId]
          : !assistantId || assistantId === CATCHALL_ASSISTANT_ID
            ? "montivaro"
            : null;
    if (!product) {
      console.log(`call-report: ignored report from assistant ${assistantId}`);
      return;
    }

    // Web click-to-call sessions have no phone number — nothing to text.
    const callerNumber: string | undefined =
      message?.customer?.number || message?.call?.customer?.number;

    const structured: any = message?.analysis?.structuredData || {};
    const lead = {
      name: typeof structured.name === "string" ? structured.name.trim() : "",
      // Prime Barber's analysis captures the barbershop; the catch-all
      // captures a generic business name. Both land in the same column.
      business:
        product === "primebarber"
          ? typeof structured.shopName === "string"
            ? structured.shopName.trim()
            : ""
          : typeof structured.businessName === "string"
            ? structured.businessName.trim()
            : "",
      summary:
        typeof message?.analysis?.summary === "string"
          ? message.analysis.summary
          : "",
      callerNumber: callerNumber || "",
    };

    // Only text real leads: a lead is a caller we got BOTH the name and the
    // business/shop name from. A hangup, wrong number, or a caller who never
    // introduced themselves gets no pitch and counts as nothing.
    const qualified = Boolean(lead.name) && Boolean(lead.business);

    // Persist EVERY demo call (qualified or not, web calls included) so the
    // dialer's "Custom Demo Calls" page can show number, summary, full
    // transcript, recording, and duration. vapi_call_id dedupes retries —
    // and a conflict means Vapi delivered this report before, so the SMS,
    // forward, and Meta event were already handled: stop here.
    try {
      await ensureSchema();
      const startedAtMs = Date.parse(message?.startedAt || "") || 0;
      const endedAtMs = Date.parse(message?.endedAt || "") || 0;
      const duration = Math.round(
        Number(message?.durationSeconds) ||
          (endedAtMs > startedAtMs ? (endedAtMs - startedAtMs) / 1000 : 0)
      );
      const transcript: string =
        (typeof message?.artifact?.transcript === "string" && message.artifact.transcript) ||
        (typeof message?.transcript === "string" && message.transcript) ||
        "";
      const recordingUrl: string =
        (typeof message?.artifact?.recordingUrl === "string" && message.artifact.recordingUrl) ||
        (typeof message?.recordingUrl === "string" && message.recordingUrl) ||
        (typeof message?.stereoRecordingUrl === "string" && message.stereoRecordingUrl) ||
        "";
      const vapiCallId: string | null = message?.call?.id || null;
      const inserted = (await sql()`
        INSERT INTO catchall_calls
          (vapi_call_id, phone, name, business, summary, transcript, recording_url, duration_seconds, qualified, product)
        VALUES
          (${vapiCallId}, ${lead.callerNumber}, ${lead.name}, ${lead.business},
           ${lead.summary}, ${transcript.slice(0, 20000)}, ${recordingUrl},
           ${duration}, ${qualified}, ${product})
        ON CONFLICT (vapi_call_id) DO NOTHING
        RETURNING id`) as any[];
      if (vapiCallId && inserted.length === 0) {
        console.log(`call-report: duplicate delivery for call ${vapiCallId} — skipping`);
        return;
      }
    } catch (err) {
      // Fail-soft: a persistence blip must not cost the lead their SMS.
      console.error("call-report: failed to persist demo call", err);
    }

    if (forwardUrl) {
      try {
        await fetch(forwardUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("call-report: forward failed", err);
      }
    }

    // Catch-all line: if the assistant booked the setup call through the
    // calendar tools, the caller gets a booking confirmation (text + email +
    // reminders from the cron) instead of the sample-alert pitch — they're
    // past the pitch, they have an appointment.
    if (product === "montivaro") {
      const booking = extractBookingFromReport(message, await bookingToolName());
      if (booking) {
        try {
          const row = await handleBookedSetupCall({
            vapiCallId: message?.call?.id || null,
            callerNumber: lead.callerNumber,
            name: lead.name,
            business: lead.business,
            // Replayed to the caller in the confirmation email as the sample
            // lead alert — the demo, in writing.
            summary: lead.summary,
            goal:
              typeof structured.reasonForCall === "string" && structured.reasonForCall.trim()
                ? structured.reasonForCall.trim()
                : typeof structured.businessType === "string"
                  ? structured.businessType.trim()
                  : "",
            booking,
          });
          console.log(
            `call-report: setup call booked (${booking.source}) for ${lead.callerNumber || "web caller"} at ${booking.startAt.toISOString()} → row #${row?.id ?? "dup"}`
          );
          if (lead.callerNumber) {
            await sendMetaEvent({
              eventName: "Schedule",
              phone: lead.callerNumber,
              email: booking.email || undefined,
              eventId: message?.call?.id ? `${message.call.id}:schedule` : undefined,
              actionSource: "phone_call",
              customData: { source: "vapi_booking" },
            });
          }
        } catch (err) {
          console.error("call-report: booking hand-off failed", err);
        }
        return;
      }
    }

    if (!lead.callerNumber) {
      console.log("call-report: no caller number (web call?) — no SMS sent");
      return;
    }
    if (!qualified) {
      console.log(
        `call-report: caller ${lead.callerNumber} didn't give both a name and a business — no SMS, no lead`
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, SMS_DELAY_MS));
    try {
      const body =
        product === "primebarber"
          ? buildPrimeBarberSmsBody(lead)
          : product === "website"
            ? buildWebsiteSmsBody(lead)
            : product === "dentist"
              ? buildDentistSmsBody(lead)
              : buildSmsBody(lead);
      const sid = await sendSms(lead.callerNumber, body);
      console.log(`call-report: lead SMS sent to ${lead.callerNumber} (${sid})`);

      // Owner ping for the Website Design line: one short segment (≤160
      // chars) to Ibrahim the moment a call qualifies — name, business,
      // number. Fail-soft: a failed ping never blocks the lead event.
      if (product === "website") {
        try {
          await sendSms(
            OWNER_ALERT_NUMBER,
            truncate(`🌐 New Website Design lead: ${lead.name} — ${lead.business} — ${lead.callerNumber}`, 160)
          );
        } catch (err) {
          console.error("call-report: owner alert failed", err);
        }
      }

      // Meta ads optimization signal — fired ONLY after the SMS actually went
      // out: a delivered text is what counts as a lead. Phone as the match
      // key; event_id = Vapi call id so webhook retries can't double-count.
      await sendMetaEvent({
        eventName: "QualifiedLead",
        phone: lead.callerNumber,
        eventId: message?.call?.id || undefined,
        actionSource: "phone_call",
        customData: {
          lead_type:
            product === "montivaro" ? "qualified_demo_call" : `${product}_demo_call`,
        },
      });
    } catch (err) {
      console.error("call-report: SMS failed — no lead event fired", err);
    }
  });

  return NextResponse.json({ ok: true });
}
