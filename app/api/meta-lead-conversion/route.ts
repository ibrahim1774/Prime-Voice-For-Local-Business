import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const PIXEL_ID = "1287427660086229";

export async function POST(request: NextRequest) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { phoneNumber, eventId } = body;
    // Tap-to-call sends "Contact" — a tap is intent, not a lead, and the
    // browser can't see whether the call ever connected. The real Lead for a
    // phone call is fired server-side by /api/vapi/call-report once the
    // caller has actually stayed on 20s+. Forms keep the default: a submitted
    // form IS a lead. Allowlisted so the body can't invent event names.
    const eventName: "Contact" | "Lead" = body.eventName === "Contact" ? "Contact" : "Lead";

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = request.headers.get("user-agent") || "";

    let normalizedPhone = (phoneNumber || "").replace(/\D/g, "");
    if (normalizedPhone.length === 10) {
      normalizedPhone = "1" + normalizedPhone;
    }
    const hashedPhone = normalizedPhone
      ? createHash("sha256").update(normalizedPhone).digest("hex")
      : undefined;

    const eventData = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: request.headers.get("referer") || "",
          user_data: {
            client_ip_address: ip,
            client_user_agent: userAgent,
            ...(hashedPhone && { ph: [hashedPhone] }),
          },
        },
      ],
    };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Meta Conversions API error:", errorData);
      return NextResponse.json(
        { error: "Failed to send conversion event" },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json({ success: true, events_received: result.events_received });
  } catch (error) {
    console.error("Meta Conversions API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
