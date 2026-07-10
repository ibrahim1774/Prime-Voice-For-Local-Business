import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  ensureWebrtcConfig,
  isAuthed,
  twilioEnv,
  unauthorized,
  voiceAccessToken,
} from "@/lib/dialer/core";

export const maxDuration = 30;

// Access token for browser calling. First call auto-provisions the TwiML App
// + API key on the Twilio account (stored in dialer_settings) — no env vars.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  try {
    const { sid } = twilioEnv();
    const cfg = await ensureWebrtcConfig();
    const identity = "operator";
    const token = voiceAccessToken({
      accountSid: sid,
      keySid: cfg.keySid,
      keySecret: cfg.keySecret,
      appSid: cfg.appSid,
      identity,
    });
    return NextResponse.json({ token, identity, ttl: 3600 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not set up browser calling" },
      { status: 502 }
    );
  }
}
