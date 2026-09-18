import { NextRequest } from "next/server";
import { readOutboundMedia, validOutboundToken } from "@/lib/leadInbox";

// Serves an image the owner attached to a reply.
//
// Deliberately PUBLIC — no shared secret, no cookie. Twilio fetches MMS media
// from this URL with its own servers, so anything requiring our credentials
// would simply fail to send. The HMAC token in `t` is what protects it: the id
// alone is useless without a signature, so the ids are not enumerable.
//
// The same URL is what the inbox renders, so an owner sees exactly the image
// the recipient will get.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const idRaw = request.nextUrl.searchParams.get("id") || "";
  const t = request.nextUrl.searchParams.get("t") || "";
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0 || !t || !validOutboundToken(id, t)) {
    return new Response("Forbidden", { status: 403 });
  }
  const found = await readOutboundMedia(id).catch(() => null);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.contentType,
      "Content-Length": String(found.bytes.length),
      // Immutable: an id's bytes never change, and Twilio may refetch.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
