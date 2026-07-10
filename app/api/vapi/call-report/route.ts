import { NextRequest, NextResponse } from "next/server";
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
    "This is a sample of the alert your AI receptionist sends after a potential new customer calls. We custom-build yours to your own business:",
    "• 24/7 or after-hours only, 7 days a week",
    "• Your choice of voice, if you want",
    "• Custom call flow + intake questions",
    "• Notifications — SMS, email, or both",
    "• CRM integration with your current booking platform",
  ];

  return [
    header.join("\n"),
    pitch.join("\n"),
    "Depending on what you need and your call volume, plans range from $97–$497/mo — usage minutes included.",
    "📅 Book a phone call with us — choose a time that works best for you and we'll get this set up:\nmontivaro.com/bookcall",
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
  if (assistantId && assistantId !== CATCHALL_ASSISTANT_ID) {
    return NextResponse.json({ ok: true, ignored: "other-assistant" });
  }

  // Web click-to-call sessions have no phone number — nothing to text.
  const callerNumber: string | undefined =
    message?.customer?.number || message?.call?.customer?.number;

  const structured: any = message?.analysis?.structuredData || {};
  const lead = {
    name: typeof structured.name === "string" ? structured.name.trim() : "",
    business:
      typeof structured.businessName === "string"
        ? structured.businessName.trim()
        : "",
    summary:
      typeof message?.analysis?.summary === "string"
        ? message.analysis.summary
        : "",
    callerNumber: callerNumber || "",
  };

  // Only text real leads: the analysis marks the call qualified when the
  // caller actually described their business. A hangup, wrong number, or
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

    await new Promise((resolve) => setTimeout(resolve, SMS_DELAY_MS));
    try {
      const sid = await sendSms(lead.callerNumber, buildSmsBody(lead));
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
