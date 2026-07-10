import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, sql, unauthorized } from "@/lib/dialer/core";

export const maxDuration = 30;

// Dashboard analytics for the Dial tab. `range` = today | 7d | all.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const range = request.nextUrl.searchParams.get("range") || "all";
  const since =
    range === "today" ? "1 day" : range === "7d" ? "7 days" : null;

  const q = sql();
  // Call-based metrics from the call log.
  const callRows = (since
    ? await q`SELECT status, amd FROM dialer_calls WHERE started_at > now() - ${since}::interval`
    : await q`SELECT status, amd FROM dialer_calls`) as any[];
  const dials = callRows.length;
  const connected = callRows.filter(
    (c) => c.amd === "human" || (c.status === "completed" && c.amd !== "machine_start" && c.amd !== "machine_end_beep")
  ).length;
  const voicemails = callRows.filter((c) => (c.amd || "").startsWith("machine")).length;

  // Texts sent.
  const textRows = (since
    ? await q`SELECT count(*)::int AS n FROM dialer_messages WHERE direction = 'out' AND created_at > now() - ${since}::interval`
    : await q`SELECT count(*)::int AS n FROM dialer_messages WHERE direction = 'out'`) as any[];
  const textsSent = textRows[0]?.n || 0;

  // Outcome breakdown from lead statuses (cumulative — leads carry their
  // latest disposition; range doesn't apply to a lead's current status).
  const statusRows = (await q`SELECT status, count(*)::int AS n FROM dialer_leads GROUP BY status`) as any[];
  const byStatus: Record<string, number> = {};
  statusRows.forEach((r) => (byStatus[r.status] = r.n));
  const totalLeads = statusRows.reduce((a, r) => a + r.n, 0);

  return NextResponse.json({
    range,
    dials,
    connected,
    voicemails,
    textsSent,
    totalLeads,
    interested: byStatus.interested || 0,
    notInterested: byStatus.not_interested || 0,
    callback: byStatus.callback || 0,
    dnc: byStatus.dnc || 0,
    newLeads: byStatus.new || 0,
  });
}
