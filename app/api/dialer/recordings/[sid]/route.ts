import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, sql, twilioEnv, unauthorized } from "@/lib/dialer/core";

export const maxDuration = 60;

// Streams a recording's MP3 through the server so Twilio credentials and
// recording URLs are never exposed to the browser.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const { sid } = await params;
  if (!/^RE[a-zA-Z0-9]{32}$/.test(sid)) {
    return NextResponse.json({ error: "Bad recording id" }, { status: 400 });
  }
  const rows = (await sql()`
    SELECT id FROM dialer_calls WHERE recording_sid = ${sid} AND NOT recording_deleted`) as any[];
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { sid: acct, token } = twilioEnv();
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${acct}/Recordings/${sid}.mp3`,
    { headers: { Authorization: "Basic " + Buffer.from(`${acct}:${token}`).toString("base64") } }
  );
  if (!resp.ok || !resp.body) {
    return NextResponse.json({ error: "Recording unavailable" }, { status: 404 });
  }
  return new Response(resp.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=300" },
  });
}
