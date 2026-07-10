import { NextRequest, NextResponse } from "next/server";
import {
  BASE_URL,
  ensureSchema,
  isAuthed,
  sql,
  twilio,
  unauthorized,
  webhookToken,
} from "@/lib/dialer/core";
import { stateOfAreaCode } from "@/lib/dialer/areaCodes";

export const maxDuration = 60;

// GET — the owned local-presence number pool.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const numbers = (await sql()`SELECT * FROM dialer_numbers ORDER BY created_at DESC`) as any[];
  return NextResponse.json({ numbers });
}

// POST { areaCode } — preview an available number in that area code.
// POST { areaCode, confirm: true } — buy it, auto-wire voice forwarding +
// inbound SMS, and add it to the pool. Confirm-to-buy: nothing is purchased
// without the explicit confirm flag.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const areaCode = String(body?.areaCode ?? "").replace(/\D/g, "");
  if (!/^\d{3}$/.test(areaCode)) {
    return NextResponse.json({ error: "Enter a 3-digit area code" }, { status: 400 });
  }

  const existing = (await sql()`
    SELECT phone FROM dialer_numbers WHERE area_code = ${areaCode}`) as any[];
  if (existing.length) {
    return NextResponse.json(
      { error: `You already own ${existing[0].phone} for area code ${areaCode}` },
      { status: 409 }
    );
  }

  const available = await twilio(
    `/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&SmsEnabled=true&PageSize=1`,
    undefined,
    "GET"
  );
  const candidate = available?.available_phone_numbers?.[0];
  if (!candidate) {
    return NextResponse.json(
      { error: `No local numbers available in area code ${areaCode} right now` },
      { status: 404 }
    );
  }

  if (!body.confirm) {
    return NextResponse.json({
      preview: true,
      phone: candidate.phone_number,
      friendly: candidate.friendly_name,
      areaCode,
      state: stateOfAreaCode(areaCode) || candidate.region || "",
      monthly: "$1.15/mo (standard Twilio local rate)",
    });
  }

  const t = webhookToken();
  const bought = await twilio("/IncomingPhoneNumbers.json", {
    PhoneNumber: candidate.phone_number,
    VoiceUrl: `${BASE_URL}/api/dialer/twiml/forward?t=${t}`,
    VoiceMethod: "POST",
    SmsUrl: `${BASE_URL}/api/dialer/sms-inbound`,
    SmsMethod: "POST",
    FriendlyName: `Dialer local presence ${areaCode}`,
  });
  await sql()`
    INSERT INTO dialer_numbers (phone, sid, area_code, state)
    VALUES (${bought.phone_number}, ${bought.sid}, ${areaCode}, ${stateOfAreaCode(areaCode)})
    ON CONFLICT (phone) DO NOTHING`;
  return NextResponse.json({
    ok: true,
    phone: bought.phone_number,
    areaCode,
    state: stateOfAreaCode(areaCode),
  });
}

// DELETE { id } — release a number back to Twilio (stops its monthly charge).
export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const rows = (await sql()`SELECT * FROM dialer_numbers WHERE id = ${id}`) as any[];
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await twilio(`/IncomingPhoneNumbers/${rows[0].sid}.json`, undefined, "DELETE");
  } catch (err: any) {
    if (!String(err?.message || "").includes("404")) {
      return NextResponse.json({ error: err?.message || "Release failed" }, { status: 502 });
    }
  }
  await sql()`DELETE FROM dialer_numbers WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
