import { NextRequest, NextResponse } from "next/server";
import { sendMetaEvent } from "@/lib/metaCapi";

export const maxDuration = 30;

// LeadConnector (GoHighLevel) "appointment created" webhook → Meta Schedule.
//
// Configure in LeadConnector: Automation → appointment-booked trigger →
// Webhook action pointing at
//   https://www.montivaro.com/api/leadconnector/booking?t=<LC_WEBHOOK_SECRET>
// LeadConnector can't sign requests, so the shared-secret query param is the
// auth. The payload shape varies by trigger version — we read the contact's
// phone/email from every place GHL is known to put them.
export async function POST(request: NextRequest) {
  const secret = process.env.LC_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (request.nextUrl.searchParams.get("t") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: any = await request.json().catch(() => ({}));
  const contact = body?.contact || body?.customData || {};
  const phone: string =
    body?.phone || contact?.phone || body?.contact_phone || body?.customer?.phone || "";
  const email: string =
    body?.email || contact?.email || body?.contact_email || body?.customer?.email || "";
  const appointmentId: string =
    body?.appointment?.id || body?.appointmentId || body?.calendar?.appointmentId || body?.id || "";

  // custom_data.source lets the optimization Custom Conversion target ONLY
  // these server events — the /booking-confirmation page still fires its own
  // browser-side Schedule with no event_id, so filtering is the dedup.
  const sent = await sendMetaEvent({
    eventName: "Schedule",
    phone,
    email,
    eventId: appointmentId || undefined,
    actionSource: "website",
    sourceUrl: "https://www.montivaro.com/bookcall",
    customData: { source: "lc_webhook" },
  });

  return NextResponse.json({ ok: true, sent });
}
