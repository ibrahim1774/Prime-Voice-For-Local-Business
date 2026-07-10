import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  hasDb,
  isAuthed,
  purgeExpiredRecordings,
} from "@/lib/dialer/core";

export const maxDuration = 120;

// Daily cron (vercel.json) + manual trigger: delete recordings older than 24h.
export async function GET(request: NextRequest) {
  const fromCron =
    request.headers.get("x-vercel-cron") !== null ||
    (request.headers.get("user-agent") || "").includes("vercel-cron");
  if (!fromCron && !isAuthed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, purged: 0, note: "no db" });
  await ensureSchema();
  const purged = await purgeExpiredRecordings();
  return NextResponse.json({ ok: true, purged });
}
