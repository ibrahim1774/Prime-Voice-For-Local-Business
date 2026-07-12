import { createHash } from "crypto";

// Server-side Meta Conversions API sender for Montivaro's funnel events.
//
// The pixel is SHARED across ariyalab / primehub / aibarber / primevoiceai —
// every event MUST carry custom_data.product = "montivaro" so Custom
// Conversions can filter per product (the Ariyalab purchase over-count came
// from missing exactly this).
const PIXEL_ID = "26490568997297314";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePhoneForMeta(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits;
  return digits;
}

export async function sendMetaEvent(opts: {
  eventName: string;
  // At least one match key is required — events with an empty user_data are
  // rejected by Meta, so callers should skip sending when nothing is known.
  phone?: string;
  email?: string;
  eventId?: string;
  actionSource?: "website" | "phone_call" | "system_generated";
  sourceUrl?: string;
  customData?: Record<string, string>;
}): Promise<boolean> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("metaCapi: META_ACCESS_TOKEN is not configured");
    return false;
  }

  const userData: Record<string, string[]> = {};
  const phoneDigits = normalizePhoneForMeta(opts.phone || "");
  if (phoneDigits) userData.ph = [sha256(phoneDigits)];
  const email = (opts.email || "").trim().toLowerCase();
  if (email) userData.em = [sha256(email)];
  if (!Object.keys(userData).length) {
    console.log(`metaCapi: skipped ${opts.eventName} — no match keys (phone/email)`);
    return false;
  }

  const body = {
    data: [
      {
        event_name: opts.eventName,
        event_time: Math.floor(Date.now() / 1000),
        ...(opts.eventId ? { event_id: opts.eventId } : {}),
        action_source: opts.actionSource || "system_generated",
        ...(opts.sourceUrl ? { event_source_url: opts.sourceUrl } : {}),
        user_data: userData,
        custom_data: { product: "montivaro", ...(opts.customData || {}) },
      },
    ],
  };

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error(`metaCapi: ${opts.eventName} failed`, err);
      return false;
    }
    console.log(`metaCapi: ${opts.eventName} sent`);
    return true;
  } catch (err) {
    console.error(`metaCapi: ${opts.eventName} error`, err);
    return false;
  }
}
