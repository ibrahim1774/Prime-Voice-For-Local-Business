import { NextRequest, NextResponse } from "next/server";
import { createWebsiteDesignLead, ensureLeadSchema } from "@/lib/websiteDesignLeads";
import { sql, twilio, twilioEnv } from "@/lib/dialer/core";

export const maxDuration = 30;

// Called server-to-server by primehub.dev/api/website-design-lead with the
// shared PRIMEHUB_LEAD_SECRET. Creates the lead, texts the lead + the owner
// from the local Twilio number, and registers the number for reply forwarding.
//
// GET (same secret) = diagnostics: which number sends, where its inbound SMS
// webhook points (must be /api/dialer/sms-inbound for forwarding to work), and
// the latest leads.

function authed(request: NextRequest): boolean {
  const secret = process.env.PRIMEHUB_LEAD_SECRET?.trim();
  if (!secret) return false;
  const given = request.headers.get("x-primehub-secret") || "";
  return given.length === secret.length && given === secret;
}

export async function POST(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await createWebsiteDesignLead({
      business: String(body?.business ?? ""),
      phone: String(body?.phone ?? ""),
      canPay: body?.canPay !== false,
      page: String(body?.page ?? ""),
    });
    return NextResponse.json(result);
  } catch (err: any) {
    const msg = err?.message || "Lead failed";
    const status = /Bad phone|Missing business/.test(msg) ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureLeadSchema();
  const { from } = twilioEnv();
  let smsUrl: string | null = null;
  try {
    const res = await twilio(
      `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
      undefined,
      "GET"
    );
    smsUrl = res?.incoming_phone_numbers?.[0]?.sms_url ?? null;
  } catch (err: any) {
    smsUrl = `lookup failed: ${err?.message || err}`;
  }
  const leads = (await sql()`
    SELECT id, phone, business, can_pay, page, created_at, last_inbound_at, last_owner_reply_at
    FROM website_design_leads ORDER BY created_at DESC LIMIT 20`) as any[];
  return NextResponse.json({
    from,
    inboundSmsWebhook: smsUrl,
    forwardingReady: typeof smsUrl === "string" && smsUrl.includes("/api/dialer/sms-inbound"),
    leads,
  });
}
