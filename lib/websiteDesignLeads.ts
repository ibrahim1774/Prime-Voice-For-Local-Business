import { ensureSchema, normalizePhone, sql, twilio, twilioEnv } from "./dialer/core";
import { OWNER_ALERT_NUMBER } from "./setupCalls";

// primehub.dev/website-design-lead → Montivaro SMS bridge.
//
// PrimeHub's page posts the lead here (its Twilio creds live in this project);
// we text the lead the "send us your Google Business Profile / photos" opener
// from the local Twilio number, ping the owner, and remember the number so the
// inbound-SMS webhook (app/api/dialer/sms-inbound) can forward every reply and
// photo to the owner's phone — and relay the owner's texts back to the lead.

export const LEAD_SOURCE = "primehub-website-design-lead";

export interface WebsiteDesignLead {
  id: number;
  phone: string;
  name: string;
  business: string;
  can_pay: boolean;
  created_at: string;
  last_inbound_at: string | null;
}

let ready = false;
export async function ensureLeadSchema() {
  await ensureSchema();
  if (ready) return;
  await sql()`CREATE TABLE IF NOT EXISTS website_design_leads (
    id serial PRIMARY KEY,
    phone text NOT NULL,
    business text NOT NULL DEFAULT '',
    can_pay boolean NOT NULL DEFAULT true,
    source text NOT NULL DEFAULT '',
    page text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_inbound_at timestamptz,
    last_owner_reply_at timestamptz
  )`;
  await sql()`ALTER TABLE website_design_leads ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT ''`;
  // The Google Business Profile they picked on the form (name, address,
  // maps link, website, rating) — PrimeHub resolves it and passes it here.
  await sql()`ALTER TABLE website_design_leads ADD COLUMN IF NOT EXISTS gbp jsonb`;
  // /barber-design-lead collects a booking link instead of a business name.
  // The link is stored raw here; `business` holds a readable shop name
  // derived from its slug, because `business` is what the duplicate check,
  // the dialer row and the inbox thread label all key on.
  await sql()`ALTER TABLE website_design_leads ADD COLUMN IF NOT EXISTS booking_link text NOT NULL DEFAULT ''`;
  // Inbound MMS photo URLs (Twilio media), so the inbox can show them.
  await sql()`ALTER TABLE dialer_messages ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb`;
  // Images the OWNER attaches to a reply. Twilio fetches MMS media from a
  // public URL, so the bytes have to live somewhere it can reach without our
  // credentials — they are stored here and served by
  // /api/website-design-lead/outbound-media behind an HMAC token. Inbound
  // media stays as Twilio URLs (proxied); only outbound is stored.
  await sql()`CREATE TABLE IF NOT EXISTS inbox_media (
    id serial PRIMARY KEY,
    content_type text NOT NULL,
    bytes bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS website_design_leads_phone_idx ON website_design_leads (phone, created_at)`;
  ready = true;
}

const firstName = (name: string) => {
  const w = name.trim().split(/\s+/)[0] || "";
  return w ? w[0].toUpperCase() + w.slice(1) : "";
};

// Every text we originate is one SMS segment: Twilio bills per segment,
// 160 chars of plain GSM-7 — and a single emoji, curly quote or long dash
// flips the whole message to 70-char UCS-2 segments. So: ASCII only,
// <= 160 chars, and the business name is the first thing trimmed when a
// message would run long (owner call 2026-09-11).
export const SMS_MAX = 160;
export const asciiSms = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
// Builds a message around a business name, shortening the name (then the
// tail) until the whole thing fits in one segment.
export const fitSms = (build: (business: string) => string, business: string): string => {
  let biz = asciiSms(business);
  let out = asciiSms(build(biz));
  while (out.length > SMS_MAX && biz.length > 6) {
    biz = biz.slice(0, Math.max(6, biz.length - 4)).trim();
    out = asciiSms(build(biz));
  }
  return out.length > SMS_MAX ? out.slice(0, SMS_MAX - 3).trimEnd() + "..." : out;
};

// The opener the lead gets ~7s after submitting /website-design-lead.
export const leadOpenerSms = (name: string, business: string) => {
  const first = asciiSms(firstName(name));
  return fitSms(
    (b) =>
      `Hey${first ? ` ${first}` : ""}, saw your form for a free website for ${b}. ` +
      `Building it soon - do you have a Google Business Profile or any pictures we can use?`,
    business,
  );
};

// primehub.dev/lead opener (owner wording, 2026-09-11). That form has no
// name field, so it opens without one; goes out LEAD_PAGE_OPENER_DELAY_MS
// after submit.
export const leadPageOpenerSms = (business: string) =>
  fitSms(
    (b) =>
      `Hey, saw you wanted a site for ${b}. Before we build it, can you send some info on your business, ` +
      `like a Google Business Profile or Instagram page?`,
    business,
  );
export const LEAD_PAGE_OPENER_DELAY_MS = 10_000;

// /barber-design-lead. Deliberately a question, not an instruction — it is
// the first text a stranger gets from an unknown number, and "send me X"
// reads like an autoresponder issuing orders. Short on purpose too: 124
// characters, comfortably one GSM-7 segment.
//
// It does NOT mention whether their link came through. An earlier draft did,
// and it read as though we had lost it (owner, 2026-09-21).
export const barberOpenerSms = () =>
  asciiSms(
    "Hey, saw you wanted a site for your barbershop. Mind sending over your booking link? " +
      "We're looking to start building it soon.",
  );
export const LEAD_BARBER_OPENER_DELAY_MS = 20_000;

// Owner alert, one segment. GBP falls back from maps link -> address -> none
// so the phone number is never the thing that gets cut.
// Barber alert: exactly three things (owner, 2026-09-21) — that it is a
// barber lead, the number, and the link. No shop name, no hosting flag.
// Dropping those is what buys the headroom to send the FULL link: a
// truncated booking URL is not clickable, which defeats the message. Even a
// long Booksy link with tracking params lands near 126 chars, so this stays
// one segment in practice.
export const ownerBarberLeadSms = (phone: string, bookingLink: string) =>
  asciiSms(`Barber site lead: ${phone} - ${bookingLink}`);

export const ownerNewLeadSms = (
  name: string,
  business: string,
  phone: string,
  canPay: boolean,
  page: string,
  gbp?: LeadGbp | null,
) => {
  const who = asciiSms(name) || "no name";
  const src = /\/lead\b/.test(page) ? "/lead" : "/website-design-lead";
  const gbpOptions = [gbp?.mapsUrl, gbp?.address, ""].filter((v) => typeof v === "string") as string[];
  for (const g of gbpOptions) {
    const msg = fitSms(
      (b) => `Website lead (${src}): ${b} | ${who} | ${phone} | hosting ${canPay ? "yes" : "no"} | GBP ${g || "none"}`,
      business,
    );
    // fitSms trims the business first; only fall back on the GBP field if
    // even a 6-char business name could not fit alongside this GBP value.
    if (!(msg.endsWith("...") && g)) return msg;
  }
  return fitSms((b) => `Website lead (${src}): ${b} | ${who} | ${phone} | hosting ${canPay ? "yes" : "no"} | GBP none`, business);
};

export interface LeadGbp {
  name?: string;
  address?: string;
  mapsUrl?: string;
  website?: string;
  phone?: string;
  rating?: number;
  reviews?: number;
}

export interface CreateLeadInput {
  business: string;
  name: string;
  phone: string;
  canPay: boolean;
  page?: string;
  gbp?: LeadGbp | null;
  // /barber-design-lead only: the raw booking URL the barber pasted.
  bookingLink?: string;
}

export interface CreateLeadResult {
  ok: true;
  phone: string;
  duplicate: boolean;
  leadSms: string | null;
  ownerSms: string | null;
}

export async function createWebsiteDesignLead(input: CreateLeadInput): Promise<CreateLeadResult> {
  await ensureLeadSchema();
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Bad phone number");
  const business = (input.business || "").trim().slice(0, 120);
  if (!business) throw new Error("Missing business name");
  const name = (input.name || "").trim().slice(0, 80);
  const page = (input.page || "").slice(0, 200);
  const bookingLink = (input.bookingLink || "").trim().slice(0, 500);
  const q = sql();

  // Same number twice within 10 minutes (double tap, refresh) → don't re-text.
  const recent = (await q`
    SELECT id FROM website_design_leads
    WHERE phone = ${phone} AND created_at > now() - interval '10 minutes'
    LIMIT 1`) as any[];
  if (recent.length) return { ok: true, phone, duplicate: true, leadSms: null, ownerSms: null };

  await q`
    INSERT INTO website_design_leads (phone, name, business, can_pay, source, page, gbp, booking_link)
    VALUES (${phone}, ${name}, ${business}, ${input.canPay}, ${LEAD_SOURCE}, ${page}, ${input.gbp ? JSON.stringify(input.gbp) : null}::jsonb, ${bookingLink})`;
  // Surface the lead in the dialer (Texts tab shows the business name).
  await q`
    INSERT INTO dialer_leads (phone, name, business, status, notes)
    VALUES (${phone}, ${name}, ${business}, 'new', ${"Website design lead (primehub.dev)"})
    ON CONFLICT (phone) DO UPDATE SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE dialer_leads.name END, business = EXCLUDED.business, updated_at = now()`;

  if (!input.canPay) {
    // Disqualified on the page — recorded, but nobody gets texted.
    return { ok: true, phone, duplicate: false, leadSms: null, ownerSms: null };
  }

  const { from } = twilioEnv();

  // Owner alert goes out right away.
  let ownerSid: string | null = null;
  try {
    const owner = await twilio("/Messages.json", {
      To: OWNER_ALERT_NUMBER,
      From: from,
      Body: bookingLink
        ? ownerBarberLeadSms(phone, bookingLink)
        : ownerNewLeadSms(name, business, phone, input.canPay, page, input.gbp),
    });
    ownerSid = owner.sid || null;
  } catch (err) {
    console.error("[website-design-lead] owner ping failed:", err);
  }

  // The lead's opener is sent by sendLeadOpener() after LEAD_OPENER_DELAY_MS
  // — a pause so it reads like a person getting to it, not an autoresponder.
  // The route schedules it with next/server after() so the form gets its
  // response immediately.
  return { ok: true, phone, duplicate: false, leadSms: "scheduled", ownerSms: ownerSid };
}

// 30s (owner, 2026-09-18; was 7s). The route's maxDuration is 60s and the
// wait is a plain setTimeout inside after(), so this has to stay comfortably
// under that — the send happens AFTER the sleep, and a function killed at the
// ceiling would drop the text with no error anywhere.
export const LEAD_OPENER_DELAY_MS = 30_000;

export async function sendLeadOpener(phone: string, name: string, business: string, delayMs = LEAD_OPENER_DELAY_MS, openerText?: string): Promise<string | null> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  const { from } = twilioEnv();
  const opener = openerText || leadOpenerSms(name, business);
  const lead = await twilio("/Messages.json", { To: phone, From: from, Body: opener });
  const q = sql();
  await q`
    INSERT INTO dialer_messages (phone, direction, body, sid, read)
    VALUES (${phone}, 'out', ${opener}, ${lead.sid || null}, true)`;
  await q`
    UPDATE dialer_leads SET status = 'sms_sent', updated_at = now()
    WHERE phone = ${phone} AND status = 'new'`;
  return lead.sid || null;
}

// ── inbound handling (called from the Twilio inbound-SMS webhook) ───────────

export async function findLeadByPhone(phone: string): Promise<WebsiteDesignLead | null> {
  await ensureLeadSchema();
  const rows = (await sql()`
    SELECT id, phone, name, business, can_pay, created_at, last_inbound_at
    FROM website_design_leads WHERE phone = ${phone}
    ORDER BY created_at DESC LIMIT 1`) as any[];
  return rows[0] || null;
}

// Lead → owner: forward the text (and any photos) with the business name and
// number up front so the owner can text or call them straight from the phone.
export async function forwardLeadMessageToOwner(
  lead: WebsiteDesignLead,
  body: string,
  mediaUrls: string[]
): Promise<void> {
  const { from } = twilioEnv();
  const text = body.trim() || (mediaUrls.length ? "(photo)" : "");
  // ASCII header so a forwarded reply never drops to 70-char UCS-2 segments.
  const header = asciiSms(`${lead.name ? `${lead.name} - ` : ""}${lead.business} (${lead.phone}):`);
  const params: Record<string, string | string[]> = {
    To: OWNER_ALERT_NUMBER,
    From: from,
    Body: `${header}\n${asciiSms(text)}`.slice(0, 1500),
  };
  // Twilio-hosted inbound media is fetchable by URL, so it re-sends as MMS.
  if (mediaUrls.length) params.MediaUrl = mediaUrls.slice(0, 10);
  await twilio("/Messages.json", params);
  await sql()`UPDATE website_design_leads SET last_inbound_at = now() WHERE id = ${lead.id}`;
}

// Owner → lead relay. The owner texts the same Twilio number; we pick the
// target lead: an explicit leading number ("+15551234567 hey…" / "5551234567 hey…")
// wins, else "@1234 hey…" (last 4 digits), else the lead who wrote most recently.
export async function relayOwnerReply(
  rawBody: string,
  mediaUrls: string[]
): Promise<{ sentTo: WebsiteDesignLead | null; note: string }> {
  await ensureLeadSchema();
  const q = sql();
  let body = rawBody.trim();
  let target: WebsiteDesignLead | null = null;

  const explicit = body.match(/^\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b[:\s-]*/);
  if (explicit) {
    const phone = normalizePhone(explicit[1] + explicit[2] + explicit[3]);
    if (phone) {
      target = await findLeadByPhone(phone);
      if (!target) {
        // Not one of our leads — still let the owner text any number from the line.
        target = { id: 0, phone, name: "", business: phone, can_pay: true, created_at: "", last_inbound_at: null };
      }
      body = body.slice(explicit[0].length).trim();
    }
  }
  if (!target) {
    const tag = body.match(/^@(\d{4})\b[:\s-]*/);
    if (tag) {
      const rows = (await q`
        SELECT id, phone, name, business, can_pay, created_at, last_inbound_at
        FROM website_design_leads WHERE phone LIKE ${"%" + tag[1]}
        ORDER BY created_at DESC LIMIT 1`) as any[];
      if (rows[0]) {
        target = rows[0];
        body = body.slice(tag[0].length).trim();
      }
    }
  }
  if (!target) {
    const rows = (await q`
      SELECT id, phone, name, business, can_pay, created_at, last_inbound_at
      FROM website_design_leads
      ORDER BY COALESCE(last_inbound_at, created_at) DESC LIMIT 1`) as any[];
    target = rows[0] || null;
  }
  if (!target) return { sentTo: null, note: "No website-design lead to reply to yet." };
  if (!body && !mediaUrls.length) return { sentTo: target, note: "Empty message — nothing sent." };

  const { from } = twilioEnv();
  const params: Record<string, string | string[]> = { To: target.phone, From: from, Body: body };
  if (mediaUrls.length) params.MediaUrl = mediaUrls.slice(0, 10);
  const msg = await twilio("/Messages.json", params);
  await q`
    INSERT INTO dialer_messages (phone, direction, body, sid, read)
    VALUES (${target.phone}, 'out', ${body || "(photo)"}, ${msg.sid || null}, true)`;
  if (target.id) {
    await q`UPDATE website_design_leads SET last_owner_reply_at = now() WHERE id = ${target.id}`;
  }
  return { sentTo: target, note: `Sent to ${target.business} (${target.phone})` };
}

export const isOwnerNumber = (phone: string | null) =>
  !!phone && normalizePhone(phone) === OWNER_ALERT_NUMBER;

export function mediaUrlsFromForm(form: URLSearchParams): string[] {
  const n = Math.min(Number(form.get("NumMedia") || 0) || 0, 10);
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = form.get(`MediaUrl${i}`);
    if (u) urls.push(u);
  }
  return urls;
}
