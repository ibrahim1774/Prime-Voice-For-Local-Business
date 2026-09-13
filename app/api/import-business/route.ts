import { NextRequest, NextResponse } from "next/server";
import {
  apifyConfigured,
  blobToken,
  BusinessImportError,
  type BusinessPhoto,
  type BusinessRecord,
  importViaApify,
  importViaPlaces,
  placesKey,
  PlacesUpstreamError,
  rehostPhotos,
  slugify,
} from "@/lib/businessImport";

// Turn a picked business into a BusinessRecord — the plain, framework-neutral
// payload a voice agent is configured from (name, phone, address, category,
// hours, timezone offset, coordinates).
//
// POST body, first match wins:
//   { placeId }  ← primary path; comes straight off a find-business candidate
//                  or a places-autocomplete suggestion
//   { query }    ← "Name, City" typed by hand
//   { url }      ← a pasted Google Maps / share link
//
//   200 { ok: true,  business, photos, elapsedMs }
//   400 { ok: false, error }                       — nothing usable in the body
//   404 { ok: false, error }                       — resolved to no business
//   502 { ok: false, configured: true, error }     — Google rejected the lookup
//   422 { ok: false, error }                       — dead end; show verbatim
//   503 { ok: false, configured: false, error }    — no Places key, no Apify
//   502 { ok: false, error }                       — unexpected; detail is server-side only
//
// GET = config probe / warm-up. Booleans only, never key material.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    ok: true,
    warm: true,
    configured: {
      places: placesKey().length > 0,
      apify: apifyConfigured(),
      blob: blobToken().length > 0,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as any);
  const placeId = String(body?.placeId ?? "").trim().slice(0, 300);
  const query = String(body?.query ?? "").trim().slice(0, 200);
  const url = String(body?.url ?? "").trim().slice(0, 2000);

  if (!placeId && !query && !url) {
    return NextResponse.json(
      { ok: false, error: "Send a placeId, a business name, or a Google listing URL." },
      { status: 400 },
    );
  }

  const key = placesKey();
  if (!key && !apifyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Business import is not configured (GOOGLE_PLACES_SERVER_KEY is unset).",
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    let record: BusinessRecord | null = null;
    let photos: BusinessPhoto[] = [];
    let placesRejected = 0;

    if (key) {
      try {
        const viaPlaces = await importViaPlaces({ placeId, query, url }, key);
        record = viaPlaces?.record ?? null;
        photos = viaPlaces?.photos ?? [];
      } catch (e: any) {
        // BusinessImportError (a user-facing dead end) must keep propagating.
        if (!(e instanceof PlacesUpstreamError)) throw e;
        console.error(`[import-business] Places rejected the lookup (code ${e.code})`);
        placesRejected = e.code || 1;
      }
    }

    if (!record) {
      // Optional fallback; a no-op without APIFY_TOKEN. Apify searches by
      // text, so a placeId-only request has nothing for it to work with.
      record = await importViaApify(query || url || "");
      photos = [];
    }

    // Google rejecting us must not read as "that business doesn't exist".
    if (!record && placesRejected) {
      return NextResponse.json(
        { ok: false, configured: true, error: "Business import failed. Try again in a moment." },
        { status: 502 },
      );
    }

    if (!record) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "We couldn't find that business on Google. Try the full name plus the city, e.g. \"Prime Cuts, Houston\".",
        },
        { status: 404 },
      );
    }

    // Inert unless a blob store is wired up: returns the pointers untouched.
    const hosted = await rehostPhotos(photos, { siteSlug: slugify(record.name) });

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[import-business] ${record.name} (${record.category || "no category"}) via ${record.source} in ${elapsedMs}ms`,
    );
    return NextResponse.json({ ok: true, business: record, photos: hosted, elapsedMs });
  } catch (err: any) {
    if (err instanceof BusinessImportError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    // Never leak a stack or upstream body to the client.
    console.error("[import-business] unexpected:", err?.stack || err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Business import failed. Try again in a moment." },
      { status: 502 },
    );
  }
}
