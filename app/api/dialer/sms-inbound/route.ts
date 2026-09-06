import { NextRequest } from "next/server";
import {
  ensureSchema,
  hasDb,
  normalizePhone,
  sql,
  validTwilioRequest,
} from "@/lib/dialer/core";
import {
  ensureLeadSchema,
  findLeadByPhone,
  forwardLeadMessageToOwner,
  isOwnerNumber,
  mediaUrlsFromForm,
  relayOwnerReply,
} from "@/lib/websiteDesignLeads";

export const maxDuration = 30;

// Twilio inbound-SMS webhook for the local number: replies land in the
// dialer's Texts tab. Responds with empty TwiML (no auto-reply).
//
// Website-design leads (primehub.dev/website-design-lead): a text or photo
// from one of those numbers is forwarded to the owner's phone, and a text
// from the owner's phone is relayed back to the lead (see relayOwnerReply
// for how the target lead is picked).
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  // Signature only: this URL is stored on every number in the Twilio console,
  // so a leaked URL must not be enough to forge inbound messages.
  if (!validTwilioRequest(request, form, url.pathname + url.search, false)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (hasDb()) {
    await ensureSchema();
    await ensureLeadSchema();
    const phone = normalizePhone(form.get("From") || "");
    const body = (form.get("Body") || "").slice(0, 2000);
    const media = mediaUrlsFromForm(form);

    if (phone && isOwnerNumber(phone)) {
      // Owner → lead relay. Never stored as an inbound thread message.
      try {
        await relayOwnerReply(body, media);
      } catch (err) {
        console.error("[sms-inbound] owner relay failed:", err);
      }
    } else {
      if (phone && (body || media.length)) {
        await sql()`
          INSERT INTO dialer_messages (phone, direction, body, sid, read, media)
          VALUES (${phone}, 'in', ${body}, ${form.get("MessageSid") || null}, false, ${JSON.stringify(media)}::jsonb)`;
      }
      if (phone) {
        try {
          const lead = await findLeadByPhone(phone);
          if (lead) await forwardLeadMessageToOwner(lead, body, media);
        } catch (err) {
          console.error("[sms-inbound] forward to owner failed:", err);
        }
      }
    }
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { "Content-Type": "text/xml" },
  });
}
