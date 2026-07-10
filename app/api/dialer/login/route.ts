import { NextRequest, NextResponse } from "next/server";
import {
  checkPassword,
  cookieHeader,
  dialerConfigured,
  ensureSchema,
  hasDb,
  makeCookie,
} from "@/lib/dialer/core";

export async function POST(request: NextRequest) {
  if (!dialerConfigured()) {
    return NextResponse.json(
      { error: "Dialer not configured (DIALER_PASSWORD missing)" },
      { status: 503 }
    );
  }
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Database not connected (create the Neon database in Vercel → Storage)" },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  await ensureSchema();
  const resp = NextResponse.json({ ok: true });
  resp.headers.set("Set-Cookie", cookieHeader(makeCookie()));
  return resp;
}
