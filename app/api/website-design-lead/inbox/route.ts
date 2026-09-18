import { NextRequest, NextResponse } from "next/server";
import {
  deleteMessage,
  deleteThread,
  listMessages,
  listThreads,
  sendReply,
  updateThread,
} from "@/lib/leadInbox";

export const maxDuration = 30;

// primehub.dev/inbox ↔ Montivaro. Every call carries x-primehub-secret
// (PrimeHub's /api/inbox adds it after checking the owner's Supabase login).
//   GET                       → { threads }
//   GET ?phone=+1…            → { messages } (marks inbound as read)
//   POST   { phone, body, media? } → { message }  reply from the 650 line;
//           media = base64 data URLs, sent as MMS (body may be empty if there
//           is at least one image)
//   PATCH  { phone, name, business } → { ok } rename a thread
//   DELETE { messageId }      → { ok } remove ONE message
//   DELETE { phone }          → { ok, deleted } remove the whole conversation

function authed(request: NextRequest): boolean {
  const secret = process.env.PRIMEHUB_LEAD_SECRET?.trim();
  if (!secret) return false;
  const given = request.headers.get("x-primehub-secret") || "";
  return given.length === secret.length && given === secret;
}

const fail = (err: any, fallback: string) => {
  const msg = err?.message || fallback;
  const status = /Bad phone|Empty message|too long/.test(msg) ? 400 : 502;
  return NextResponse.json({ error: msg }, { status });
};

export async function GET(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const phone = request.nextUrl.searchParams.get("phone");
  try {
    if (phone) return NextResponse.json({ messages: await listMessages(phone) });
    return NextResponse.json({ threads: await listThreads() });
  } catch (err: any) {
    return fail(err, "Inbox failed");
  }
}

export async function POST(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const attachments = Array.isArray(body?.media)
      ? body.media.filter((m: unknown) => typeof m === "string").slice(0, 8)
      : [];
    const message = await sendReply(
      String(body?.phone ?? ""),
      String(body?.body ?? ""),
      attachments
    );
    return NextResponse.json({ ok: true, message });
  } catch (err: any) {
    return fail(err, "Send failed");
  }
}

export async function PATCH(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    await updateThread(String(body?.phone ?? ""), { name: body?.name, business: body?.business });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err, "Update failed");
  }
}

export async function DELETE(request: NextRequest) {
  if (!authed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    // messageId = delete one message; phone = delete the whole conversation.
    if (body?.messageId != null) {
      const ok = await deleteMessage(Number(body.messageId));
      return NextResponse.json({ ok, deleted: ok ? { messages: 1 } : { messages: 0 } });
    }
    const deleted = await deleteThread(String(body?.phone ?? ""));
    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    return fail(err, "Delete failed");
  }
}
