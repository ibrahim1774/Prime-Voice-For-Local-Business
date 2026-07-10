import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  getSetting,
  isAuthed,
  normalizePhone,
  sql,
  unauthorized,
  DIALABLE_SEGMENTS,
  LEAD_STATUSES,
} from "@/lib/dialer/core";
import { areaCodeOf, stateOfAreaCode } from "@/lib/dialer/areaCodes";

export const maxDuration = 60;

// GET /api/dialer/leads?status=new&search=&queue=1&limit=200
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const p = request.nextUrl.searchParams;
  const status = p.get("status") || "";
  const search = (p.get("search") || "").trim();
  const queue = p.get("queue") === "1";
  const stateFilter = (p.get("state") || "").trim().toUpperCase();
  const limit = Math.min(Number(p.get("limit")) || 500, 2000);
  const q = sql();

  let rows: any[];
  if (queue) {
    // The dialing queue honors the saved segment + state (set on the Dial tab).
    const segment = (await getSetting("dial_segment")) || "new";
    const seg = (DIALABLE_SEGMENTS as readonly string[]).includes(segment) ? segment : "new";
    const st = (await getSetting("dial_state")).toUpperCase();
    if (seg === "new") {
      // Default: due callbacks first, then fresh leads; 20h re-dial cooldown.
      rows = (await q`
        SELECT * FROM dialer_leads
        WHERE (status = 'new' OR (status = 'callback' AND (callback_at IS NULL OR callback_at <= now())))
          AND (${st} = '' OR state = ${st})
          AND (last_dialed_at IS NULL OR last_dialed_at < now() - interval '20 hours')
        ORDER BY (status = 'callback') DESC, id ASC
        LIMIT ${limit}`) as any[];
    } else {
      // Deliberate retry of a segment (e.g. voicemails): no cooldown, oldest
      // attempt first so you work through the whole batch.
      rows = (await q`
        SELECT * FROM dialer_leads
        WHERE status = ${seg} AND (${st} = '' OR state = ${st})
        ORDER BY last_dialed_at ASC NULLS FIRST, id ASC
        LIMIT ${limit}`) as any[];
    }
  } else if (search) {
    const like = `%${search}%`;
    rows = (await q`
      SELECT * FROM dialer_leads
      WHERE (name ILIKE ${like} OR business ILIKE ${like} OR phone LIKE ${like})
        AND (${stateFilter} = '' OR state = ${stateFilter})
      ORDER BY updated_at DESC LIMIT ${limit}`) as any[];
  } else if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    rows = (await q`
      SELECT * FROM dialer_leads
      WHERE status = ${status} AND (${stateFilter} = '' OR state = ${stateFilter})
      ORDER BY updated_at DESC LIMIT ${limit}`) as any[];
  } else {
    rows = (await q`
      SELECT * FROM dialer_leads
      WHERE (${stateFilter} = '' OR state = ${stateFilter})
      ORDER BY updated_at DESC LIMIT ${limit}`) as any[];
  }

  const counts = (await q`
    SELECT status, count(*)::int AS n FROM dialer_leads GROUP BY status`) as any[];
  const states = (await q`
    SELECT state, count(*)::int AS n FROM dialer_leads WHERE state <> '' GROUP BY state ORDER BY state`) as any[];
  return NextResponse.json({ leads: rows, counts, states });
}

// POST — bulk upsert { rows: [{name, business, phone}] }. Dedupes by phone;
// existing leads keep their status/notes/history, only blank fields fill in.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) {
    return NextResponse.json({ error: "No rows" }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: "Max 5,000 leads per upload" }, { status: 400 });
  }

  const q = sql();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const phone = normalizePhone(String(row?.phone ?? ""));
    if (!phone || seen.has(phone)) {
      skipped++;
      continue;
    }
    seen.add(phone);
    const name = String(row?.name ?? "").trim().slice(0, 120);
    const business = String(row?.business ?? "").trim().slice(0, 160);
    const state = stateOfAreaCode(areaCodeOf(phone));
    const result = (await q`
      INSERT INTO dialer_leads (phone, name, business, state)
      VALUES (${phone}, ${name}, ${business}, ${state})
      ON CONFLICT (phone) DO UPDATE SET
        name = CASE WHEN dialer_leads.name = '' THEN EXCLUDED.name ELSE dialer_leads.name END,
        business = CASE WHEN dialer_leads.business = '' THEN EXCLUDED.business ELSE dialer_leads.business END,
        state = CASE WHEN dialer_leads.state = '' THEN EXCLUDED.state ELSE dialer_leads.state END,
        updated_at = now()
      RETURNING (xmax = 0) AS inserted`) as any[];
    if (result[0]?.inserted) added++;
    else updated++;
  }
  return NextResponse.json({ ok: true, added, updated, skipped });
}
