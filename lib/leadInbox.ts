import crypto from "crypto";
import { normalizePhone, sql, twilio, twilioEnv, BASE_URL } from "./dialer/core";
import { ensureLeadSchema } from "./websiteDesignLeads";

// Inbox data for primehub.dev/inbox — the iMessage-style view of every
// conversation on the local Twilio line that came through the website-design
// lead form (plus any number that texted the line since the form launched).
// Called server-to-server by PrimeHub's /api/inbox with PRIMEHUB_LEAD_SECRET.

export const INBOX_SINCE = "2026-09-06T00:00:00Z";

export interface InboxThread {
  phone: string;
  name: string;
  business: string;
  leadId: number | null;
  lastBody: string;
  lastDirection: "in" | "out" | null;
  lastAt: string | null;
  unread: number;
  createdAt: string | null;
}

export interface InboxMessage {
  id: number;
  direction: "in" | "out";
  body: string;
  media: string[];
  sid: string | null;
  createdAt: string;
}

const secret = () => process.env.PRIMEHUB_LEAD_SECRET?.trim() || "";

// Twilio media needs the account auth to fetch reliably, so the browser
// never gets the raw Twilio URL — it gets a proxy URL signed with the shared
// secret (see app/api/website-design-lead/media).
export const signMediaUrl = (url: string): string => {
  const t = crypto.createHmac("sha256", secret()).update(url).digest("hex").slice(0, 32);
  return `${BASE_URL}/api/website-design-lead/media?u=${encodeURIComponent(url)}&t=${t}`;
};

// Outbound (owner-attached) images live in inbox_media, not at Twilio, so
// they get their own signed URL. Stored in dialer_messages.media as
// "inbox-media:<id>" so one column serves both directions.
export const OUTBOUND_PREFIX = "inbox-media:";
const outboundToken = (id: number): string =>
  crypto.createHmac("sha256", secret()).update(`outbound:${id}`).digest("hex").slice(0, 32);
export const signOutboundMediaUrl = (id: number): string =>
  `${BASE_URL}/api/website-design-lead/outbound-media?id=${id}&t=${outboundToken(id)}`;
export const validOutboundToken = (id: number, t: string): boolean => {
  const expected = outboundToken(id);
  try {
    return t.length === expected.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected));
  } catch {
    return false;
  }
};

export const validMediaToken = (url: string, t: string): boolean => {
  const expected = crypto.createHmac("sha256", secret()).update(url).digest("hex").slice(0, 32);
  try {
    return t.length === expected.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected));
  } catch {
    return false;
  }
};

export async function listThreads(): Promise<InboxThread[]> {
  await ensureLeadSchema();
  const rows = (await sql()`
    WITH phones AS (
      SELECT phone FROM website_design_leads
      UNION
      SELECT phone FROM dialer_messages WHERE direction = 'in' AND created_at >= ${INBOX_SINCE}::timestamptz
    ),
    lead AS (
      SELECT DISTINCT ON (phone) phone, id, name, business, created_at
      FROM website_design_leads ORDER BY phone, created_at DESC
    ),
    last AS (
      SELECT DISTINCT ON (phone) phone, body, direction, media, created_at
      FROM dialer_messages ORDER BY phone, created_at DESC
    )
    SELECT p.phone,
      COALESCE(l.name, dl.name, '') AS name,
      COALESCE(l.business, dl.business, '') AS business,
      l.id AS lead_id, l.created_at,
      m.body AS last_body, m.direction AS last_direction, m.media AS last_media, m.created_at AS last_at,
      (SELECT count(*)::int FROM dialer_messages u WHERE u.phone = p.phone AND u.direction = 'in' AND NOT u.read) AS unread
    FROM phones p
    LEFT JOIN lead l ON l.phone = p.phone
    LEFT JOIN dialer_leads dl ON dl.phone = p.phone
    LEFT JOIN last m ON m.phone = p.phone
    ORDER BY COALESCE(m.created_at, l.created_at) DESC NULLS LAST`) as any[];
  return rows.map((r) => ({
    phone: r.phone,
    name: r.name || "",
    business: r.business || "",
    leadId: r.lead_id ?? null,
    lastBody: r.last_body || (Array.isArray(r.last_media) && r.last_media.length ? "📷 Photo" : ""),
    lastDirection: r.last_direction || null,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    unread: r.unread || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

export async function listMessages(phone: string, markRead = true): Promise<InboxMessage[]> {
  await ensureLeadSchema();
  const q = sql();
  const rows = (await q`
    SELECT id, direction, body, media, sid, created_at
    FROM dialer_messages WHERE phone = ${phone}
    ORDER BY created_at ASC LIMIT 500`) as any[];
  if (markRead) {
    await q`UPDATE dialer_messages SET read = true WHERE phone = ${phone} AND direction = 'in' AND NOT read`;
  }
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    body: r.body || "",
    media: (Array.isArray(r.media) ? r.media : []).map((u: string) =>
      u.startsWith(OUTBOUND_PREFIX)
        ? signOutboundMediaUrl(Number(u.slice(OUTBOUND_PREFIX.length)))
        : signMediaUrl(u)
    ),
    sid: r.sid || null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Max bytes per attached image. Twilio's hard MMS ceiling is 5MB across all
 *  parts and it recommends staying well under; the client downscales first. */
export const MAX_MEDIA_BYTES = 1_500_000;
export const MAX_MEDIA_PER_MESSAGE = 4;

/** Store one owner-attached image and return its inbox_media id. */
export async function saveOutboundMedia(dataUrl: string): Promise<number> {
  await ensureLeadSchema();
  const m = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("Attachment must be a base64 data URL");
  const contentType = m[1].toLowerCase();
  if (!/^image\/(jpeg|png|gif|webp)$/.test(contentType)) {
    throw new Error("Attachment must be a JPEG, PNG, GIF or WebP image");
  }
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) throw new Error("Attachment is empty");
  if (buf.length > MAX_MEDIA_BYTES) throw new Error("Image is too large — keep it under 1.5MB");
  const rows = (await sql()`
    INSERT INTO inbox_media (content_type, bytes) VALUES (${contentType}, ${buf})
    RETURNING id`) as any[];
  return rows[0].id as number;
}

export async function readOutboundMedia(id: number): Promise<{ contentType: string; bytes: Buffer } | null> {
  await ensureLeadSchema();
  const rows = (await sql()`SELECT content_type, bytes FROM inbox_media WHERE id = ${id}`) as any[];
  if (!rows.length) return null;
  return { contentType: rows[0].content_type, bytes: Buffer.from(rows[0].bytes) };
}

/**
 * Reply to a lead. `attachments` are base64 data URLs from the composer; each
 * is stored and handed to Twilio as a MediaUrl. Twilio fetches those itself,
 * which is why they need a public signed URL rather than the admin-only proxy.
 * A message may be media-only — an image with no caption is still a message.
 */
export async function sendReply(
  phoneRaw: string,
  body: string,
  attachments: string[] = []
): Promise<InboxMessage> {
  await ensureLeadSchema();
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new Error("Bad phone number");
  const text = body.trim();
  if (attachments.length > MAX_MEDIA_PER_MESSAGE) {
    throw new Error(`Up to ${MAX_MEDIA_PER_MESSAGE} images per message`);
  }
  if (!text && !attachments.length) throw new Error("Empty message");
  if (text.length > 1200) throw new Error("Message too long");

  const ids: number[] = [];
  for (const a of attachments) ids.push(await saveOutboundMedia(a));
  const mediaUrls = ids.map((id) => signOutboundMediaUrl(id));

  const { from } = twilioEnv();
  const msg = await twilio("/Messages.json", {
    To: phone,
    From: from,
    Body: text,
    ...(mediaUrls.length ? { MediaUrl: mediaUrls } : {}),
  });

  const refs = ids.map((id) => `${OUTBOUND_PREFIX}${id}`);
  const rows = (await sql()`
    INSERT INTO dialer_messages (phone, direction, body, sid, read, media)
    VALUES (${phone}, 'out', ${text}, ${msg.sid || null}, true, ${JSON.stringify(refs)}::jsonb)
    RETURNING id, created_at`) as any[];
  await sql()`UPDATE website_design_leads SET last_owner_reply_at = now() WHERE phone = ${phone}`;
  return {
    id: rows[0].id,
    direction: "out",
    body: text,
    media: ids.map((id) => signOutboundMediaUrl(id)),
    sid: msg.sid || null,
    createdAt: new Date(rows[0].created_at).toISOString(),
  };
}

/** Delete ONE message from a thread (the thread itself stays). */
export async function deleteMessage(id: number): Promise<boolean> {
  await ensureLeadSchema();
  if (!Number.isInteger(id) || id <= 0) throw new Error("Bad message id");
  const rows = (await sql()`
    DELETE FROM dialer_messages WHERE id = ${id} RETURNING media`) as any[];
  if (!rows.length) return false;
  // Drop any owner-attached images this message owned, so the bytes don't linger.
  const refs: string[] = Array.isArray(rows[0].media) ? rows[0].media : [];
  for (const r of refs) {
    if (typeof r === "string" && r.startsWith(OUTBOUND_PREFIX)) {
      const mid = Number(r.slice(OUTBOUND_PREFIX.length));
      if (Number.isInteger(mid)) await sql()`DELETE FROM inbox_media WHERE id = ${mid}`;
    }
  }
  return true;
}

export async function updateThread(phoneRaw: string, patch: { name?: string; business?: string }): Promise<void> {
  await ensureLeadSchema();
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new Error("Bad phone number");
  const name = (patch.name ?? "").trim().slice(0, 80);
  const business = (patch.business ?? "").trim().slice(0, 120);
  const q = sql();
  const existing = (await q`SELECT id FROM website_design_leads WHERE phone = ${phone} LIMIT 1`) as any[];
  if (existing.length) {
    await q`UPDATE website_design_leads SET name = ${name}, business = ${business} WHERE phone = ${phone}`;
  } else {
    await q`INSERT INTO website_design_leads (phone, name, business, can_pay, source, page) VALUES (${phone}, ${name}, ${business}, true, 'inbox', '')`;
  }
  await q`
    INSERT INTO dialer_leads (phone, name, business, status, notes)
    VALUES (${phone}, ${name}, ${business}, 'new', 'Website design lead (primehub.dev)')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, business = EXCLUDED.business, updated_at = now()`;
}

export async function deleteThread(phoneRaw: string): Promise<{ messages: number; leads: number }> {
  await ensureLeadSchema();
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new Error("Bad phone number");
  const q = sql();
  const m = (await q`DELETE FROM dialer_messages WHERE phone = ${phone} RETURNING id`) as any[];
  const l = (await q`DELETE FROM website_design_leads WHERE phone = ${phone} RETURNING id`) as any[];
  return { messages: m.length, leads: l.length };
}
