import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const PIXEL_ID = "26490568997297314";

interface PurchaseBody {
  value?: number;
  currency?: string;
  eventId?: string;
  email?: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

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
    const body = (await request.json().catch(() => ({}))) as PurchaseBody;
    const value = typeof body.value === "number" && body.value > 0 ? body.value : 99;
    const currency = (body.currency || "USD").toUpperCase();
    const eventId = body.eventId;
    const email = body.email?.trim();

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = request.headers.get("user-agent") || "";

    const userData: Record<string, unknown> = {
      client_ip_address: ip,
      client_user_agent: userAgent,
    };
    if (email) {
      userData.em = [sha256(email)];
    }

    const eventData = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          ...(eventId ? { event_id: eventId } : {}),
          action_source: "website",
          event_source_url: request.headers.get("referer") || "",
          user_data: userData,
          custom_data: { value, currency },
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
