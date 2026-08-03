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
  const listFilter = (p.get("list") || "").trim();
  const industryFilter = (p.get("industry") || "").trim();
  const limit = Math.min(Number(p.get("limit")) || 500, 2000);
  const q = sql();

  let rows: any[];
  if (queue) {
    // The dialing queue honors the saved segment + state + list + industry
    // (set on the Dial tab), so Up next always previews the real batch.
    const segment = (await getSetting("dial_segment")) || "new";
    const seg = (DIALABLE_SEGMENTS as readonly string[]).includes(segment) ? segment : "new";
    const st = (await getSetting("dial_state")).toUpperCase();
    const list = await getSetting("dial_list");
    const ind = await getSetting("dial_industry");
    if (seg === "new") {
      // Default batch: due callbacks first, then fresh leads. Retry rules
      // (mirrored EXACTLY in the dial route): each number gets at most
      // `redial_attempts` tries per rolling 24h (canceled wave-losers don't
      // count), spaced `redial_gap_hours` apart. With attempts > 1, unreached
      // leads (voicemail / no-answer) cycle back into the queue after the gap
      // — human marks never do. Optional shuffle randomizes the order.
      const attempts = Math.min(4, Math.max(1, Number(await getSetting("redial_attempts")) || 1));
      const gapH = Math.min(6, Math.max(1, Number(await getSetting("redial_gap_hours")) || 2));
      const shuffle = (await getSetting("dial_shuffle")) === "1";
      const retryStatuses = attempts > 1 ? ["new", "voicemail", "no_answer"] : ["new"];
      rows = (await q`
        SELECT * FROM dialer_leads
        WHERE (
            (status = 'callback' AND (callback_at IS NULL OR callback_at <= now()))
            OR status = ANY(${retryStatuses as unknown as string[]})
          )
          -- The attempt cap + gap apply to EVERY branch (callbacks included —
          -- an unanswered due callback must not be redialed every wave).
          -- Canceled legs and answered wave-losers (apology message, no
          -- conversation) don't count as attempts.
          AND (SELECT count(*) FROM dialer_calls c
               WHERE c.lead_id = dialer_leads.id
                 AND c.started_at > now() - interval '24 hours'
                 AND c.status <> 'canceled'
                 AND NOT c.wave_lost) < ${attempts}
          AND (last_dialed_at IS NULL OR last_dialed_at < now() - ${gapH} * interval '1 hour')
          AND (${st} = '' OR state = ${st})
          AND (${list} = '' OR list_name = ${list})
          AND (${ind} = '' OR industry = ${ind})
        ORDER BY (status = 'callback') DESC,
                 CASE WHEN ${shuffle} THEN random() END,
                 (last_dialed_at IS NULL) DESC, last_dialed_at ASC, id ASC
        LIMIT ${limit}`) as any[];
    } else {
      // Deliberate retry of a segment (e.g. voicemails): no cooldown, oldest
      // attempt first so you work through the whole batch.
      rows = (await q`
        SELECT * FROM dialer_leads
        WHERE status = ${seg} AND (${st} = '' OR state = ${st})
          AND (${list} = '' OR list_name = ${list})
          AND (${ind} = '' OR industry = ${ind})
        ORDER BY last_dialed_at ASC NULLS FIRST, id ASC
        LIMIT ${limit}`) as any[];
    }
  } else {
    const like = `%${search}%`;
    const stat = status && (LEAD_STATUSES as readonly string[]).includes(status) ? status : "";
    rows = (await q`
      SELECT * FROM dialer_leads
      WHERE (${search} = '' OR name ILIKE ${like} OR business ILIKE ${like} OR phone LIKE ${like})
        AND (${stat} = '' OR status = ${stat})
        AND (${stateFilter} = '' OR state = ${stateFilter})
        AND (${listFilter} = '' OR list_name = ${listFilter})
        AND (${industryFilter} = '' OR industry = ${industryFilter})
      ORDER BY updated_at DESC LIMIT ${limit}`) as any[];
  }

  const counts = (await q`
    SELECT status, count(*)::int AS n FROM dialer_leads GROUP BY status`) as any[];
  const states = (await q`
    SELECT state, count(*)::int AS n FROM dialer_leads WHERE state <> '' GROUP BY state ORDER BY state`) as any[];
  const lists = (await q`
    SELECT list_name, count(*)::int AS n FROM dialer_leads WHERE list_name <> '' GROUP BY list_name ORDER BY list_name`) as any[];
  const industries = (await q`
    SELECT industry, count(*)::int AS n FROM dialer_leads WHERE industry <> '' GROUP BY industry ORDER BY industry`) as any[];
  const unlistedRows = (await q`
    SELECT count(*)::int AS n FROM dialer_leads WHERE list_name = ''`) as any[];
  return NextResponse.json({ leads: rows, counts, states, lists, industries, unlisted: unlistedRows[0]?.n || 0 });
}

// POST — bulk upsert { rows: [{name, business, phone, industry?}], listName? }.
// Dedupes by phone; existing leads keep their status/notes/history, only
// blank fields fill in.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  const listName = String(body?.listName ?? "").trim().slice(0, 80);
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
    const industry = String(row?.industry ?? "").trim().slice(0, 80);
    const businessLink = String(row?.businessLink ?? "").trim().slice(0, 500);
    const state = stateOfAreaCode(areaCodeOf(phone));
    const result = (await q`
      INSERT INTO dialer_leads (phone, name, business, state, industry, list_name, business_link)
      VALUES (${phone}, ${name}, ${business}, ${state}, ${industry}, ${listName}, ${businessLink})
      ON CONFLICT (phone) DO UPDATE SET
        name = CASE WHEN dialer_leads.name = '' THEN EXCLUDED.name ELSE dialer_leads.name END,
        business = CASE WHEN dialer_leads.business = '' THEN EXCLUDED.business ELSE dialer_leads.business END,
        state = CASE WHEN dialer_leads.state = '' THEN EXCLUDED.state ELSE dialer_leads.state END,
        industry = CASE WHEN dialer_leads.industry = '' THEN EXCLUDED.industry ELSE dialer_leads.industry END,
        business_link = CASE WHEN dialer_leads.business_link = '' THEN EXCLUDED.business_link ELSE dialer_leads.business_link END,
        list_name = CASE WHEN dialer_leads.list_name = '' THEN EXCLUDED.list_name ELSE dialer_leads.list_name END,
        updated_at = now()
      RETURNING (xmax = 0) AS inserted`) as any[];
    if (result[0]?.inserted) added++;
    else updated++;
  }
  return NextResponse.json({ ok: true, added, updated, skipped });
}

function parseIds(body: any): number[] {
  return (Array.isArray(body?.ids) ? body.ids : [])
    .map(Number)
    .filter(Number.isInteger)
    .slice(0, 2000);
}

// PATCH — bulk status change: { ids: number[], status }.
export async function PATCH(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const ids = parseIds(body);
  const status = String(body?.status || "");
  if (!ids.length) return NextResponse.json({ error: "No ids" }, { status: 400 });
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }
  const rows = (await sql()`
    UPDATE dialer_leads SET status = ${status}, updated_at = now()
    WHERE id = ANY(${ids}) RETURNING id`) as any[];
  return NextResponse.json({ ok: true, updated: rows.length });
}

// DELETE — bulk: { ids: number[] }. DNC leads are never deleted by a mass
// operation — the do-not-call record has to survive so the number stays
// undialable. (The single-lead delete on /leads/[id] is the deliberate path.)
export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const ids = parseIds(body);
  if (!ids.length) return NextResponse.json({ error: "No ids" }, { status: 400 });
  const q = sql();
  const deleted = (await q`
    DELETE FROM dialer_leads WHERE id = ANY(${ids}) AND status <> 'dnc'
    RETURNING id`) as any[];
  const kept = (await q`
    SELECT count(*)::int AS n FROM dialer_leads WHERE id = ANY(${ids})`) as any[];
  return NextResponse.json({ ok: true, deleted: deleted.length, keptDnc: kept[0]?.n || 0 });
}
