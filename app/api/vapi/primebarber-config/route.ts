import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";

export const maxDuration = 15;

// Public: the Prime Barber demo line's phone number, provisioned at runtime
// by /api/vapi/sync-primebarber. The /primebarber page reads it here so the
// number never has to be hardcoded and redeployed. Empty until provisioned.
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT value FROM app_config WHERE key = 'primebarber_number'`) as any[];
    return NextResponse.json({ number: rows[0]?.value || "" });
  } catch {
    return NextResponse.json({ number: "" });
  }
}
