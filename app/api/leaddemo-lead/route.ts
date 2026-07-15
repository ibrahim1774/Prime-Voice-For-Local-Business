import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { ensureSchema, hasDb, normalizePhone, sql } from "@/lib/dialer/core";

// /leaddemo intake-form submissions. Unauthenticated by design (it's the
// public landing page) — it only ever writes the visitor's own submission:
// a dialer_leads row (list "Lead Demo Form", so it's filterable and callable
// from the dialer) plus the server half of the dual Meta Lead event, carrying
// hashed contact info the tap-to-call Lead never has.

const PIXEL_ID = "1287427660086229";

// Same Make scenario the primevoiceai.org intake form posts to (the
// Google-Sheet lead log). Fired server-side here so the row lands even if
// the visitor closes the tab right after submitting.
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/1ijk41d5vdixvoedkr13qliymoyv2x2w";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // name is optional — the /leaddemo form only asks for business + mobile.
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const business = typeof body?.business === "string" ? body.business.trim().slice(0, 160) : "";
  const eventId = typeof body?.eventId === "string" ? body.eventId.slice(0, 80) : "";
  const phone = normalizePhone(typeof body?.phone === "string" ? body.phone : "");
  if (!business || !phone) {
    return NextResponse.json({ error: "business and a valid phone are required" }, { status: 400 });
  }

  // 1. Persist the lead so it shows up in the dialer even if they never call.
  //    Existing rows keep their status/history; we only fill blanks.
  if (hasDb()) {
    try {
      await ensureSchema();
      const q = sql();
      await q`
        INSERT INTO dialer_leads (phone, name, business, list_name, notes)
        VALUES (${phone}, ${name}, ${business}, 'Lead Demo Form', 'From /leaddemo intake form')
        ON CONFLICT (phone) DO UPDATE SET
          name = CASE WHEN dialer_leads.name = '' THEN EXCLUDED.name ELSE dialer_leads.name END,
          business = CASE WHEN dialer_leads.business = '' THEN EXCLUDED.business ELSE dialer_leads.business END,
          updated_at = now()
      `;
    } catch (err) {
      console.error("[leaddemo-lead] db insert failed:", err);
    }
  }

  // 2. Log the lead to the Make scenario / Google Sheet. Keys mirror the
  //    sheet's columns — Name / Business Name / Number / Industry — using
  //    the same field names the primevoiceai.org intake form sends
  //    (businessName/phoneNumber/industry); industry carries the funnel
  //    source so the sheet shows where each lead came from. Fail-soft.
  try {
    await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        businessName: business,
        phoneNumber: phone,
        industry: "Montivaro Lead Demo",
      }),
    });
  } catch (err) {
    console.error("[leaddemo-lead] Make webhook failed:", err);
  }

  // 3. Server half of the dual Lead event (same eventId as the browser fbq
  //    fire → Meta dedupes). Hashed phone + name = strong match quality.
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (accessToken && eventId) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = request.headers.get("user-agent") || "";
    const nameParts = name.split(/\s+/);
    const fn = nameParts[0]?.toLowerCase() || "";
    const ln = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : "";
    const eventData = {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: request.headers.get("referer") || "https://www.montivaro.com/leaddemo",
          user_data: {
            client_ip_address: ip,
            client_user_agent: userAgent,
            ph: [sha256(phone.replace(/\D/g, ""))],
            ...(fn && { fn: [sha256(fn)] }),
            ...(ln && { ln: [sha256(ln)] }),
          },
          custom_data: {
            content_name: "/leaddemo intake form",
            content_category: "intake-form",
            lead_type: "leaddemo_form",
          },
        },
      ],
    };
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventData),
        }
      );
      if (!resp.ok) {
        console.error("[leaddemo-lead] Meta CAPI error:", await resp.text());
      }
    } catch (err) {
      console.error("[leaddemo-lead] Meta CAPI failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
