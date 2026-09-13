import { NextRequest, NextResponse } from "next/server";
import { placesKey, suggestBusinesses } from "@/lib/businessImport";

// As-you-type business-name suggestions, server-side on purpose: the BROWSER
// Places key is referrer-locked, and the server key must never reach the
// client. Suggestions are a convenience — any upstream hiccup returns an empty
// list (200) so a form can still submit whatever the visitor typed.
//
// POST { input, lat?, lng? }
//   200 { ok: true,  configured: true,  suggestions: [{ placeId, main, secondary }] }
//   400 { ok: false, error }                       — input missing
//   503 { ok: false, configured: false, suggestions: [], error } — no Places key
//
// `configured: false` is deliberately distinguishable from an empty result:
// "nobody added the key" and "nothing matched" need different fixes.

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as any);
  const input = String(body?.input ?? "").trim().slice(0, 120);
  if (!input) {
    return NextResponse.json({ ok: false, error: "Missing input" }, { status: 400 });
  }

  const key = placesKey();
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        suggestions: [],
        error: "Business lookup is not configured (GOOGLE_PLACES_SERVER_KEY is unset).",
      },
      { status: 503 },
    );
  }

  // Under 3 chars Google's autocomplete is noise; skip the call, keep it a 200.
  if (input.length < 3) {
    return NextResponse.json({ ok: true, configured: true, suggestions: [] });
  }

  try {
    const suggestions = await suggestBusinesses(
      input,
      { lat: Number(body?.lat), lng: Number(body?.lng) },
      key,
    );
    return NextResponse.json({ ok: true, configured: true, suggestions });
  } catch (err: any) {
    console.error("[places-autocomplete] unexpected:", err?.message || err);
    return NextResponse.json({ ok: true, configured: true, suggestions: [] });
  }
}
