import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/dialer/core";
import { sendDueReminders } from "@/lib/setupCalls";

export const maxDuration = 60;

// Every 15 minutes (vercel.json): text the 24-hour and 1-hour reminders for
// setup calls the catch-all assistant booked. Manual trigger accepted with
// the Vapi shared secret so it can be run by hand after a deploy.
export async function GET(request: NextRequest) {
  const fromCron =
    request.headers.get("x-vercel-cron") !== null ||
    (request.headers.get("user-agent") || "").includes("vercel-cron");
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  const manual = Boolean(secret) && request.headers.get("x-vapi-secret") === secret;
  if (!fromCron && !manual) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, note: "no db" });
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, ...sent });
}
