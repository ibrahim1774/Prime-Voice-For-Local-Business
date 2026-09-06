import { NextRequest } from "next/server";
import { twilioEnv } from "@/lib/dialer/core";
import { validMediaToken } from "@/lib/leadInbox";

export const maxDuration = 30;

// Streams an inbound MMS photo from Twilio for the inbox. The URL is signed
// (HMAC of the Twilio URL with PRIMEHUB_LEAD_SECRET) so only links minted
// by the inbox API work — the browser never needs Twilio credentials.
export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get("u") || "";
  const t = request.nextUrl.searchParams.get("t") || "";
  if (!u || !t || !validMediaToken(u, t)) return new Response("Forbidden", { status: 403 });
  if (!/^https:\/\/api\.twilio\.com\//.test(u)) return new Response("Bad media host", { status: 400 });
  const { sid, token } = twilioEnv();
  const upstream = await fetch(u, {
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) return new Response("Media unavailable", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
