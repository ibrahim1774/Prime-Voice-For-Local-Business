import { NextRequest } from "next/server";
import {
  ensureSchema,
  hasDb,
  normalizePhone,
  sql,
  validTwilioRequest,
} from "@/lib/dialer/core";

// Twilio inbound-SMS webhook for the local number: replies land in the
// dialer's Texts tab. Responds with empty TwiML (no auto-reply).
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  if (!validTwilioRequest(request, form, url.pathname + url.search)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (hasDb()) {
    await ensureSchema();
    const phone = normalizePhone(form.get("From") || "");
    const body = (form.get("Body") || "").slice(0, 2000);
    if (phone && body) {
      await sql()`
        INSERT INTO dialer_messages (phone, direction, body, sid, read)
        VALUES (${phone}, 'in', ${body}, ${form.get("MessageSid") || null}, false)`;
    }
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { "Content-Type": "text/xml" },
  });
}
