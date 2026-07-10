import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Shared plumbing for the /dialer power dialer: Neon access + schema,
// password-cookie auth, Twilio REST helpers, webhook validation.

export const BASE_URL = "https://www.montivaro.com";
export const COOKIE_NAME = "dialer_auth";
const COOKIE_DAYS = 7;

// ── database ────────────────────────────────────────────────────────────────

function dbUrl(): string | undefined {
  return (
    process.env.STORAGE_URL ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL
  );
}

export function hasDb(): boolean {
  return Boolean(dbUrl());
}

let _sql: ReturnType<typeof neon> | null = null;
export function sql() {
  if (!_sql) {
    const url = dbUrl();
    if (!url) throw new Error("Database not connected (STORAGE_URL missing)");
    _sql = neon(url);
  }
  return _sql;
}

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS dialer_leads (
    id serial PRIMARY KEY,
    phone text UNIQUE NOT NULL,
    name text NOT NULL DEFAULT '',
    business text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'new',
    notes text NOT NULL DEFAULT '',
    callback_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS dialer_calls (
    id serial PRIMARY KEY,
    lead_id int REFERENCES dialer_leads(id) ON DELETE CASCADE,
    call_sid text UNIQUE,
    status text NOT NULL DEFAULT 'queued',
    amd text NOT NULL DEFAULT '',
    recording_sid text NOT NULL DEFAULT '',
    recording_deleted boolean NOT NULL DEFAULT false,
    duration_seconds int NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS dialer_messages (
    id serial PRIMARY KEY,
    phone text NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    sid text,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS dialer_settings (
    key text PRIMARY KEY,
    value text NOT NULL DEFAULT ''
  )`;
  await q`CREATE INDEX IF NOT EXISTS dialer_messages_phone_idx ON dialer_messages (phone, created_at)`;
  schemaReady = true;
}

export async function getSetting(key: string): Promise<string> {
  const rows = (await sql()`SELECT value FROM dialer_settings WHERE key = ${key}`) as any[];
  return rows[0]?.value ?? "";
}

export async function setSetting(key: string, value: string) {
  await sql()`INSERT INTO dialer_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export interface DialSession {
  active: boolean;
  conference: string;
  agentCallSid: string;
  currentLeadId: number | null;
  currentCallSid: string | null;
  startedAt: string;
}

export async function getSession(): Promise<DialSession | null> {
  const raw = await getSetting("session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DialSession;
  } catch {
    return null;
  }
}

export async function saveSession(s: DialSession | null) {
  await setSetting("session", s ? JSON.stringify(s) : "");
}

// ── auth ────────────────────────────────────────────────────────────────────

function secret(): string {
  const pw = process.env.DIALER_PASSWORD;
  if (!pw || !pw.trim()) throw new Error("DIALER_PASSWORD not set");
  return pw.trim();
}

export function dialerConfigured(): boolean {
  return Boolean(process.env.DIALER_PASSWORD?.trim());
}

function hmac(payload: string, purpose: string): string {
  return crypto
    .createHmac("sha256", `${secret()}::${purpose}`)
    .update(payload)
    .digest("base64url");
}

export function checkPassword(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(secret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function makeCookie(): string {
  const exp = String(Date.now() + COOKIE_DAYS * 86400_000);
  return `${exp}.${hmac(exp, "cookie")}`;
}

export function cookieHeader(value: string): string {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_DAYS * 86400}`;
}

export function isAuthed(req: Request): boolean {
  if (!dialerConfigured()) return false;
  const raw = req.headers.get("cookie") || "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [exp, sig] = match[1].split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(exp, "cookie")));
  } catch {
    return false;
  }
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Token embedded in the webhook URLs we hand to Twilio, as a fallback
// alongside X-Twilio-Signature validation.
export function webhookToken(): string {
  return hmac("twilio-webhook", "webhook");
}

// Validates a Twilio webhook: accepts our URL token or a valid
// X-Twilio-Signature (HMAC-SHA1 of url + sorted form params, auth token key).
export function validTwilioRequest(
  req: Request,
  form: URLSearchParams,
  pathWithQuery: string
): boolean {
  const url = new URL(req.url);
  if (url.searchParams.get("t") === webhookToken()) return true;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const sig = req.headers.get("x-twilio-signature");
  if (!authToken || !sig) return false;
  const full = `${BASE_URL}${pathWithQuery}`;
  const keys = [...form.keys()].sort();
  const data = full + keys.map((k) => k + form.get(k)).join("");
  const expected = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── twilio ──────────────────────────────────────────────────────────────────

export function twilioEnv() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) throw new Error("Twilio env vars missing");
  return { sid, token, from };
}

export async function twilio(
  path: string,
  params?: Record<string, string | string[]>,
  method: "POST" | "GET" | "DELETE" = params ? "POST" : "GET"
): Promise<any> {
  const { sid, token } = twilioEnv();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`;
  const body = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => body.append(k, item));
      else body.append(k, v);
    }
  }
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: method === "POST" ? body : undefined,
  });
  if (resp.status === 204) return {};
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Twilio ${resp.status}: ${json?.message || path}`);
  }
  return json;
}

// Deletes Twilio recordings older than 24h. Runs lazily on every recordings
// list load and from the daily cron, so audio never outlives its window long.
export async function purgeExpiredRecordings(): Promise<number> {
  const rows = (await sql()`
    SELECT id, recording_sid FROM dialer_calls
    WHERE recording_sid <> '' AND NOT recording_deleted
      AND started_at < now() - interval '24 hours'
    LIMIT 100`) as any[];
  let purged = 0;
  for (const row of rows) {
    try {
      await twilio(`/Recordings/${row.recording_sid}.json`, undefined, "DELETE");
    } catch (err: any) {
      // 404 = already gone on Twilio's side; anything else, retry next run.
      if (!String(err?.message || "").includes("404")) continue;
    }
    await sql()`UPDATE dialer_calls SET recording_deleted = true WHERE id = ${row.id}`;
    purged++;
  }
  return purged;
}

// ── misc ────────────────────────────────────────────────────────────────────

export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15 && (input || "").trim().startsWith("+"))
    return `+${digits}`;
  return null;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlResponse(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

export const DEFAULT_VM_SCRIPT =
  "Hi, this is Ibrahim with Montivaro. We help local businesses answer every customer call with a 24/7 AI receptionist, so you never lose a job to a missed call. I'd love to show you a quick demo — call or text me back at this number. Thanks!";

export const LEAD_STATUSES = [
  "new",
  "interested",
  "callback",
  "voicemail",
  "no_answer",
  "not_interested",
  "wrong_number",
  "dnc",
] as const;
