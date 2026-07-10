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
// POST { areaCode, phone, confirm: true } — buy that exact previewed number,
// auto-wire voice forwarding + inbound SMS, add it to the pool.
//
// Confirm-to-buy: nothing is purchased unless confirm === true (strict — a
// truthy string like "false" must not spend money), and the purchase is
// guarded by a UNIQUE(area_code) reservation row so a double-click can't buy
// two numbers for one area code.
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  const areaCode = String(body?.areaCode ?? "").replace(/\D/g, "");
  if (!/^\d{3}$/.test(areaCode)) {
    return NextResponse.json({ error: "Enter a 3-digit area code" }, { status: 400 });
  }

  const owned = (await sql()`
    SELECT phone FROM dialer_numbers WHERE area_code = ${areaCode}`) as any[];
  if (owned.length) {
    return NextResponse.json(
      { error: `You already own ${owned[0].phone} for area code ${areaCode}` },
      { status: 409 }
    );
  }

  // ── preview ──
  if (body.confirm !== true) {
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
    return NextResponse.json({
      preview: true,
      phone: candidate.phone_number,
      areaCode,
      state: stateOfAreaCode(areaCode) || candidate.region || "",
      monthly: "$1.15/mo (standard Twilio local rate)",
    });
  }

  // ── buy the exact number that was previewed ──
  const phone = String(body?.phone ?? "").trim();
  if (!/^\+1\d{10}$/.test(phone) || phone.slice(2, 5) !== areaCode) {
    return NextResponse.json(
      { error: "Pick a number again — the preview didn't match this area code" },
      { status: 400 }
    );
  }

  // Reserve the area code first. If another request already claimed it, stop
  // before spending money. Two concurrent buyers can also collide on the phone
  // unique index (both previewed Twilio's top candidate), which ON CONFLICT
  // (area_code) doesn't arbitrate — catch that too so the loser gets a clean
  // 409 instead of a 500. Either way, the loser never buys.
  let reservationId: number;
  try {
    const reserved = (await sql()`
      INSERT INTO dialer_numbers (phone, sid, area_code, state)
      VALUES (${phone}, 'pending', ${areaCode}, ${stateOfAreaCode(areaCode)})
      ON CONFLICT (area_code) DO NOTHING
      RETURNING id`) as any[];
    if (!reserved.length) {
      return NextResponse.json(
        { error: `Area code ${areaCode} is already being set up` },
        { status: 409 }
      );
    }
    reservationId = reserved[0].id;
  } catch {
    return NextResponse.json(
      { error: "That number was just taken — pick another." },
      { status: 409 }
    );
  }

  const t = webhookToken();
  let bought: any = null;
  try {
    bought = await twilio("/IncomingPhoneNumbers.json", {
      PhoneNumber: phone,
      VoiceUrl: `${BASE_URL}/api/dialer/twiml/forward?t=${t}`,
      VoiceMethod: "POST",
      SmsUrl: `${BASE_URL}/api/dialer/sms-inbound`,
      SmsMethod: "POST",
      FriendlyName: `Dialer local presence ${areaCode}`,
    });
  } catch (err: any) {
    // Purchase failed — release the reservation so the next attempt can run.
    // Only pending rows are cleared, so a real number is never dropped here.
    await sql()`DELETE FROM dialer_numbers WHERE id = ${reservationId} AND sid = 'pending'`;
    return NextResponse.json(
      { error: err?.message || "Could not buy that number — try again" },
      { status: 502 }
    );
  }

  // Purchase succeeded: promote the reservation. Never delete past this point —
  // the number is now billing on Twilio, so a failed UPDATE must not orphan it.
  await sql()`
    UPDATE dialer_numbers SET phone = ${bought.phone_number}, sid = ${bought.sid}
    WHERE id = ${reservationId}`;
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
  if (rows[0].sid !== "pending") {
    try {
      await twilio(`/IncomingPhoneNumbers/${rows[0].sid}.json`, undefined, "DELETE");
    } catch (err: any) {
      if (!String(err?.message || "").includes("404")) {
        return NextResponse.json({ error: err?.message || "Release failed" }, { status: 502 });
      }
    }
  }
  await sql()`DELETE FROM dialer_numbers WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
