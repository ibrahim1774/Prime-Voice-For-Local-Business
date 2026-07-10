import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isAuthed,
  normalizePhone,
  sql,
  unauthorized,
} from "@/lib/dialer/core";

// GET ?phone=+1... — full conversation, marks inbound as read.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const phone = normalizePhone(request.nextUrl.searchParams.get("phone") || "");
  if (!phone) return NextResponse.json({ error: "Bad phone" }, { status: 400 });
  const messages = (await sql()`
    SELECT * FROM dialer_messages WHERE phone = ${phone}
    ORDER BY created_at ASC LIMIT 500`) as any[];
  await sql()`
    UPDATE dialer_messages SET read = true
    WHERE phone = ${phone} AND direction = 'in' AND NOT read`;
  return NextResponse.json({ messages });
}
