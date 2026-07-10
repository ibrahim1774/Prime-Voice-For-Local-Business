import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, sql, unauthorized } from "@/lib/dialer/core";

export const maxDuration = 30;

// Dashboard analytics for the Dial tab.
//   ?range=today|7d|30d|all         — quick presets, OR
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   — a custom calendar range (inclusive).
// Returns headline totals plus a per-day series (dials, connected, voicemails,
// talk time) so the UI can chart each day. A call is "connected" when AMD
// detected a human, or it completed with real talk time and wasn't a machine.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const p = request.nextUrl.searchParams;
  const validDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const cFrom = validDate(p.get("from"));
  const cTo = validDate(p.get("to"));
  const range = p.get("range") || "7d";
  const interval =
    range === "today" ? "1 day" : range === "30d" ? "30 days" : range === "all" ? "3650 days" : "7 days";
  const custom = Boolean(cFrom && cTo);
  const q = sql();

  const series = (custom
    ? await q`
        SELECT to_char(started_at, 'YYYY-MM-DD') AS day,
               count(*)::int AS dials,
               count(*) FILTER (WHERE amd = 'human' OR (status = 'completed' AND duration_seconds >= 8 AND amd NOT LIKE 'machine%'))::int AS connected,
               count(*) FILTER (WHERE amd LIKE 'machine%')::int AS voicemails,
               coalesce(sum(duration_seconds), 0)::int AS talk_seconds
        FROM dialer_calls
        WHERE started_at >= ${cFrom}::date AND started_at < (${cTo}::date + interval '1 day')
        GROUP BY day ORDER BY day`
    : await q`
        SELECT to_char(started_at, 'YYYY-MM-DD') AS day,
               count(*)::int AS dials,
               count(*) FILTER (WHERE amd = 'human' OR (status = 'completed' AND duration_seconds >= 8 AND amd NOT LIKE 'machine%'))::int AS connected,
               count(*) FILTER (WHERE amd LIKE 'machine%')::int AS voicemails,
               coalesce(sum(duration_seconds), 0)::int AS talk_seconds
        FROM dialer_calls
        WHERE started_at > now() - ${interval}::interval
        GROUP BY day ORDER BY day`) as any[];

  const textRows = (custom
    ? await q`SELECT count(*)::int AS n FROM dialer_messages
        WHERE direction = 'out' AND created_at >= ${cFrom}::date AND created_at < (${cTo}::date + interval '1 day')`
    : await q`SELECT count(*)::int AS n FROM dialer_messages
        WHERE direction = 'out' AND created_at > now() - ${interval}::interval`) as any[];

  const statusRows = (await q`SELECT status, count(*)::int AS n FROM dialer_leads GROUP BY status`) as any[];
  const byStatus: Record<string, number> = {};
  statusRows.forEach((r) => (byStatus[r.status] = r.n));

  const dials = series.reduce((a, r) => a + r.dials, 0);
  const connected = series.reduce((a, r) => a + r.connected, 0);
  const voicemails = series.reduce((a, r) => a + r.voicemails, 0);
  const talkSeconds = series.reduce((a, r) => a + r.talk_seconds, 0);

  return NextResponse.json({
    range: custom ? "custom" : range,
    from: cFrom,
    to: cTo,
    dials,
    connected,
    voicemails,
    textsSent: textRows[0]?.n || 0,
    talkSeconds,
    avgTalkSeconds: connected ? Math.round(talkSeconds / connected) : 0,
    totalLeads: statusRows.reduce((a, r) => a + r.n, 0),
    // "Interested" is the umbrella: generic + demo/text/email-interested.
    interested:
      (byStatus.interested || 0) +
      (byStatus.demo_interested || 0) +
      (byStatus.text_interested || 0) +
      (byStatus.email_interested || 0),
    notInterested: byStatus.not_interested || 0,
    demo: byStatus.demo || 0,
    closed: byStatus.closed || 0,
    callback: byStatus.callback || 0,
    dnc: byStatus.dnc || 0,
    newLeads: byStatus.new || 0,
    series: series.map((r) => ({
      day: r.day,
      dials: r.dials,
      connected: r.connected,
      voicemails: r.voicemails,
      talkSeconds: r.talk_seconds,
    })),
  });
}
