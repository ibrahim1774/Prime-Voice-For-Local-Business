import { NextRequest, NextResponse } from "next/server";
import { sendMetaEvent } from "@/lib/metaCapi";
import { ensureSchema, sql } from "@/lib/dialer/core";
import { after } from "next/server";

// Vapi end-of-call-report webhook for the catch-all demo assistant.
//
// Demo loop: a prospect calls the demo line, the assistant asks about their
// business, and 30 seconds after hangup THEY receive the exact lead-alert SMS
// a Montivaro owner would get — summary, their own number, and the recording.
//
// Auth: Vapi sends the assistant's server secret in x-vapi-secret; anything
// else is rejected, so nobody can trigger SMS sends to arbitrary numbers.

export const maxDuration = 90;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";
const SMS_DELAY_MS = 30_000;

// The Prime Barber assistant is provisioned at runtime by /api/vapi/
// sync-primebarber and its id lives in app_config; cache it briefly so every
// webhook doesn't hit the database for a value that never changes.
let pbCache: { id: string; at: number } = { id: "", at: 0 };
async function primebarberAssistantId(): Promise<string> {
  if (Date.now() - pbCache.at < 60_000) return pbCache.id;
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT value FROM app_config WHERE key = 'primebarber_assistant_id'`) as any[];
    pbCache = { id: rows[0]?.value || "", at: Date.now() };
  } catch {
    // keep whatever we had; an empty cache just means "treat as catch-all"
  }
  return pbCache.id;
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
    "$97/month, all-inclusive.",
    "📅 Book your free setup call and we'll build it for you.\nmontivaro.com/bookcall",
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

  const assistantId: string | undefined =
    message?.assistant?.id || message?.call?.assistantId;
  const pbAssistantId = await primebarberAssistantId();
  const product: "montivaro" | "primebarber" | null =
    assistantId && pbAssistantId && assistantId === pbAssistantId
      ? "primebarber"
      : !assistantId || assistantId === CATCHALL_ASSISTANT_ID
        ? "montivaro"
        : null;
  if (!product) {
    return NextResponse.json({ ok: true, ignored: "other-assistant" });
  }

  // Web click-to-call sessions have no phone number — nothing to text.
  const callerNumber: string | undefined =
    message?.customer?.number || message?.call?.customer?.number;

  const structured: any = message?.analysis?.structuredData || {};
  const lead = {
    name: typeof structured.name === "string" ? structured.name.trim() : "",
    // Prime Barber's analysis captures the barbershop; the catch-all captures
    // a generic business name. Both land in the same column.
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

  // Only text real leads: the analysis marks the call qualified when the
  // caller actually described their business/shop. A hangup, wrong number, or
  // "hello?...click" gets no pitch.
  const businessType =
    typeof structured.businessType === "string"
      ? structured.businessType.trim()
      : "";
  const qualified =
    structured.qualified === true || Boolean(lead.business) || Boolean(businessType);

  // Keep the Make lead flow (or any other consumer) alive: forward the raw
  // report when FORWARD_WEBHOOK_URL is set. Fire-and-forget, fail-soft.
  const forwardUrl = env("FORWARD_WEBHOOK_URL");

  // Respond to Vapi immediately (it retries slow webhooks, which would
  // duplicate the SMS); the delayed send runs after the response.
  after(async () => {
    // Persist EVERY catch-all call (qualified or not, web calls included) so
    // the dialer's "Catch-all calls" page can show number, summary, full
    // transcript, recording, and duration. vapi_call_id dedupes retries.
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
      await sql()`
        INSERT INTO catchall_calls
          (vapi_call_id, phone, name, business, summary, transcript, recording_url, duration_seconds, qualified, product)
        VALUES
          (${vapiCallId}, ${lead.callerNumber}, ${lead.name}, ${lead.business},
           ${lead.summary}, ${transcript.slice(0, 20000)}, ${recordingUrl},
           ${duration}, ${qualified}, ${product})
        ON CONFLICT (vapi_call_id) DO NOTHING`;
    } catch (err) {
      console.error("call-report: failed to persist catch-all call", err);
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

    if (!lead.callerNumber) {
      console.log("call-report: no caller number (web call?) — no SMS sent");
      return;
    }
    if (!qualified) {
      console.log(
        `call-report: caller ${lead.callerNumber} gave no business details — no SMS sent`
      );
      return;
    }

    // Meta ads optimization signal: a QualifiedLead is a caller who actually
    // described their business — far stronger than the click-to-call Lead the
    // site fires. Server-side with the caller's phone as the match key;
    // event_id = Vapi call id so webhook retries can't double-count.
    await sendMetaEvent({
      eventName: "QualifiedLead",
      phone: lead.callerNumber,
      eventId: message?.call?.id || undefined,
      actionSource: "phone_call",
      customData: {
        lead_type:
          product === "primebarber"
            ? "primebarber_demo_call"
            : "qualified_demo_call",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, SMS_DELAY_MS));
    try {
      const body =
        product === "primebarber"
          ? buildPrimeBarberSmsBody(lead)
          : buildSmsBody(lead);
      const sid = await sendSms(lead.callerNumber, body);
      console.log(`call-report: lead SMS sent to ${lead.callerNumber} (${sid})`);
    } catch (err) {
      console.error("call-report: SMS failed", err);
    }
  });

  return NextResponse.json({
    ok: true,
    sms: !lead.callerNumber
      ? "skipped-no-number"
      : !qualified
        ? "skipped-not-qualified"
        : "scheduled",
  });
}
