import { NextRequest, NextResponse } from "next/server";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface LeadData {
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  businessType?: string;
  painPoints?: string;
  wantsCallback?: boolean;
}

interface VapiWebhookPayload {
  message?: {
    type?: string;
    analysis?: { structuredData?: LeadData };
    call?: { id?: string; customer?: { number?: string } };
    endedReason?: string;
    summary?: string;
    durationSeconds?: number;
  };
}

async function createGhlContact(lead: LeadData, callerPhone: string | undefined) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.warn("[vapi-webhook] GHL not configured — lead not synced", lead);
    return;
  }

  const [firstName, ...rest] = (lead.name || "").trim().split(/\s+/);
  const lastName = rest.join(" ");

  const res = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      locationId,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: lead.email,
      phone: lead.phone || callerPhone,
      companyName: lead.businessName,
      source: "/call tap-to-dial",
      tags: ["call-intake", lead.wantsCallback ? "wants-callback" : "info-only"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[vapi-webhook] GHL contact upsert failed:", res.status, err);
  }
}

function verifySecret(request: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get("x-vapi-secret") === expected;
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: VapiWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = payload.message;
  if (msg?.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true });
  }

  const lead = msg.analysis?.structuredData || {};
  const callerPhone = msg.call?.customer?.number;

  console.log("[vapi-webhook] call ended", {
    callId: msg.call?.id,
    durationSeconds: msg.durationSeconds,
    endedReason: msg.endedReason,
    lead,
  });

  await createGhlContact(lead, callerPhone);

  return NextResponse.json({ ok: true });
}
