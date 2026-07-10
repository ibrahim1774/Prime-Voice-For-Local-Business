import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, isAuthed, twilio, unauthorized } from "@/lib/dialer/core";
import { areaCodeOf, stateOfAreaCode } from "@/lib/dialer/areaCodes";

export const maxDuration = 30;

// Lists every number on the Twilio account (not just ones bought through the
// dialer) so the operator can pick which one to call from. Each carries a
// derived state label from its area code.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  try {
    const res = await twilio("/IncomingPhoneNumbers.json?PageSize=100", undefined, "GET");
    const numbers = (res?.incoming_phone_numbers || [])
      .filter((n: any) => n?.capabilities?.voice)
      .map((n: any) => {
        const area = areaCodeOf(n.phone_number);
        const tollFree = ["800", "833", "844", "855", "866", "877", "888"].includes(area);
        return {
          phone: n.phone_number,
          friendly: n.friendly_name || "",
          areaCode: area,
          tollFree,
          // Label: "Toll-free" for 8xx numbers, else the US state.
          state: tollFree ? "Toll-free" : stateOfAreaCode(area),
        };
      });
    return NextResponse.json({ numbers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load numbers" }, { status: 502 });
  }
}
