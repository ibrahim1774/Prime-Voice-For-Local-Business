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
  // Inbound MMS photo URLs (Twilio media), so the inbox can show them.
  await sql()`ALTER TABLE dialer_messages ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql()`CREATE INDEX IF NOT EXISTS website_design_leads_phone_idx ON website_design_leads (phone, created_at)`;
  ready = true;
}

const firstName = (name: string) => {
  const w = name.trim().split(/\s+/)[0] || "";
  return w ? w[0].toUpperCase() + w.slice(1) : "";
};

// The opener the lead gets ~15s after submitting (owner's wording, 2026-09-06).
export const leadOpenerSms = (name: string, business: string) => {
  const first = firstName(name);
  return (
    `Hey${first ? ` ${first}` : ""}, we just saw you fill out the form for a free custom website for ${business.trim()}. ` +
    `We're trying to build out the site and send it over pretty soon. ` +
    `Do you happen to have a Google Business Profile or any pictures we can use for the site?`
  );
};

export const ownerNewLeadSms = (
  name: string,
  business: string,
  phone: string,
  canPay: boolean,
  page: string,
  gbp?: LeadGbp | null,
) => {
  const stars = gbp?.rating ? ` ★${gbp.rating}${gbp.reviews ? ` (${gbp.reviews})` : ""}` : "";
  const gbpBlock = gbp?.mapsUrl || gbp?.address
    ? `\nGoogle Business Profile${stars}\n` +
      (gbp.name && gbp.name !== business.trim() ? `${gbp.name}\n` : "") +
      (gbp.address ? `${gbp.address}\n` : "") +
      (gbp.phone ? `${gbp.phone}\n` : "") +
      (gbp.website ? `Site: ${gbp.website}\n` : "") +
      (gbp.mapsUrl ? `${gbp.mapsUrl}\n` : "")
    : "\nGoogle Business Profile: not picked on the form\n";
  return (
    `🆕 Website Design Lead\n` +
    `Name: ${name.trim() || "—"}\n` +
    `Business: ${business.trim()}\n` +
    `Mobile: ${phone}\n` +
    `Can cover hosting: ${canPay ? "Yes" : "No"}\n` +
    (page ? `From: ${page}\n` : "") +
    gbpBlock +
    `\nTheir replies + photos will be forwarded here. Reply on this thread to text them back (goes to the most recent lead), ` +
    `or start with their number, e.g. "${phone} Hey…", to pick one.`
  );
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
  const q = sql();

  // Same number twice within 10 minutes (double tap, refresh) → don't re-text.
  const recent = (await q`
    SELECT id FROM website_design_leads
    WHERE phone = ${phone} AND created_at > now() - interval '10 minutes'
    LIMIT 1`) as any[];
  if (recent.length) return { ok: true, phone, duplicate: true, leadSms: null, ownerSms: null };

  await q`
    INSERT INTO website_design_leads (phone, name, business, can_pay, source, page, gbp)
    VALUES (${phone}, ${name}, ${business}, ${input.canPay}, ${LEAD_SOURCE}, ${page}, ${input.gbp ? JSON.stringify(input.gbp) : null}::jsonb)`;
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
      Body: ownerNewLeadSms(name, business, phone, input.canPay, page, input.gbp),
    });
    ownerSid = owner.sid || null;
  } catch (err) {
    console.error("[website-design-lead] owner ping failed:", err);
  }

  // The lead's opener is sent by sendLeadOpener() after LEAD_OPENER_DELAY_MS
  // (owner call 2026-09-06: "within 10 seconds" — a short pause reads
  // like a person typing, not an autoresponder). The route schedules it with
  // next/server after() so the form gets its response immediately.
  return { ok: true, phone, duplicate: false, leadSms: "scheduled", ownerSms: ownerSid };
}

export const LEAD_OPENER_DELAY_MS = 7_000;

export async function sendLeadOpener(phone: string, name: string, business: string, delayMs = LEAD_OPENER_DELAY_MS): Promise<string | null> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  const { from } = twilioEnv();
  const opener = leadOpenerSms(name, business);
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
  const header = `💬 ${lead.name ? `${lead.name} · ` : ""}${lead.business} (${lead.phone})`;
  const params: Record<string, string | string[]> = {
    To: OWNER_ALERT_NUMBER,
    From: from,
    Body: `${header}\n${text}`.slice(0, 1500),
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
