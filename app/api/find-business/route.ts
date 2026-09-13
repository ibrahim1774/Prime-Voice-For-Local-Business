import { NextRequest, NextResponse } from "next/server";
import {
  apifyConfigured,
  findCandidatesViaApify,
  findCandidatesViaPlaces,
  placesKey,
} from "@/lib/businessImport";

// "Find my business" — phase one of the typed-name flow. Returns up to 6
// candidates to pick from; the pick's placeId then goes to /api/import-business.
//
// POST { query, near? }
//   200 { ok: true,  configured: true, candidates: [{ placeId, title, address, category, rating, reviews }], searchedNear }
//   400 { ok: false, error }                         — query too short
//   502 { ok: false, configured: true,  candidates: [], error } — Google rejected the search
//   503 { ok: false, configured: false, candidates: [], error } — no Places key and no Apify token
//
// 200-with-[] means "Google answered, nothing matched" and NOTHING else — a
// rejected key surfaces as 502, a missing one as 503.
//
// Location bias, best first: (1) `near` from the client (browser geolocation,
// reverse-geocoded), (2) Vercel's IP-city headers, (3) nothing — the query's
// own city if the visitor typed one. Apify is a strictly optional second pass:
// when APIFY_TOKEN is unset it is skipped and Places-only results stand.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as any);
  const query = String(body?.query ?? "").trim().slice(0, 200);
  if (query.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Type your business name first." },
      { status: 400 },
    );
  }

  const key = placesKey();
  if (!key && !apifyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        candidates: [],
        error: "Business lookup is not configured (GOOGLE_PLACES_SERVER_KEY is unset).",
      },
      { status: 503 },
    );
  }

  const clientNear = String(body?.near ?? "").trim().slice(0, 80);
  const ipCity = decodeURIComponent(request.headers.get("x-vercel-ip-city") || "");
  const ipRegion = decodeURIComponent(request.headers.get("x-vercel-ip-country-region") || "");
  const near = query.includes(",")
    ? undefined
    : clientNear || [ipCity, ipRegion].filter(Boolean).join(", ") || undefined;

  const startedAt = Date.now();
  try {
    const viaPlaces = key
      ? await findCandidatesViaPlaces(query, near, key)
      : ({ status: "upstream-error", code: 0 } as const);

    let candidates = viaPlaces.status === "ok" ? viaPlaces.candidates : null;
    // Optional second pass; a no-op without APIFY_TOKEN.
    if (!candidates) candidates = await findCandidatesViaApify(query, near);

    // "Google rejected us" must NOT look like "no such business" — otherwise a
    // bad/missing key reads as a spelling mistake to whoever is typing.
    if (!candidates && viaPlaces.status === "upstream-error") {
      console.error(`[find-business] Places rejected the search (code ${viaPlaces.code})`);
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          candidates: [],
          error: `Couldn't search for "${query}" right now. Try again in a moment.`,
        },
        { status: 502 },
      );
    }

    console.log(
      `[find-business] "${query}" near ${near || "(none)"} → ${candidates?.length ?? 0} in ${Date.now() - startedAt}ms`,
    );
    return NextResponse.json({
      ok: true,
      configured: true,
      candidates: candidates ?? [],
      searchedNear: near ?? null,
    });
  } catch (err: any) {
    console.error("[find-business] unexpected:", err?.message || err);
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't search for "${query}" right now. Try again in a moment — adding your city helps, e.g. "${query}, Houston".`,
      },
      { status: 502 },
    );
  }
}
