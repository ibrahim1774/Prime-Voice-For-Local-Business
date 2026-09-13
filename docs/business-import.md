# Business import (Google Places)

Infrastructure only — no UI is wired to this yet, so a future subpage ("type
your business name, get a live voice agent tailored to your business") is a
front-end job. Code: `lib/businessImport/` (re-exported from
`@/lib/businessImport`) + three App Router handlers.

## Endpoints

### `POST /api/places-autocomplete`
As-you-type suggestions. Server-side so the Places key never reaches a browser.
- Request: `{ input: string, lat?: number, lng?: number }`
- `200 { ok: true, configured: true, suggestions: [{ placeId, main, secondary }] }` (max 6; `[]` under 3 chars or on any upstream hiccup)
- `400 { ok: false, error }` — empty input · `503 { ok: false, configured: false, suggestions: [], error }` — no key

### `POST /api/find-business`
Pick-list for a typed name. Biased to `near`, else Vercel's `x-vercel-ip-city`
/ `x-vercel-ip-country-region`, else nothing.
- Request: `{ query: string, near?: string }`
- `200 { ok: true, configured: true, candidates: [{ placeId, title, address, category, rating, reviews }], searchedNear }`
- `400` query under 2 chars · `502` Google rejected the search or unexpected · `503 { configured: false }` — no key and no Apify. `200` with `candidates: []` means "nothing matched", nothing else.

### `POST /api/import-business`
Candidate → business record. First match wins: `placeId` (primary), `query`, `url`.
- Request: `{ placeId?: string, query?: string, url?: string }`
- `200 { ok: true, business: BusinessRecord, photos: BusinessPhoto[], elapsedMs }`
- `400` nothing usable · `404` no match · `422` dead end (message is user-facing, show verbatim) · `502` Google rejected the lookup, or unexpected (detail stays in the server log) · `503 { configured: false }`
- `GET` = warm-up + config probe: `{ ok: true, warm: true, configured: { places, apify, blob } }` (booleans only).

## The record (`BusinessRecord`, `lib/businessImport/types.ts`)

`placeId, name, phone, phoneE164, formattedAddress, street, city, state,
postalCode, country, website, category, categories[], description,
hours[{day,hours,closed}], hoursPeriods[{openDay,openMinute,closeDay,closeMinute}],
utcOffsetMinutes, businessStatus, openNow, rating, reviewCount, latitude,
longitude, mapsUrl, source ('places'|'apify'), fetchedAt`

Voice-agent-shaped, not website-shaped: no niche, template, brand colour or
pricing tier. `hoursPeriods` + `utcOffsetMinutes` are what let an agent answer
"are you open right now?"; `category`/`categories` are what let it say what the
business does. `mapsUrl` is key-free and safe to hand to a browser.

`photos` is returned **beside** the record, never inside it, as pointers:
`{ name, widthPx, heightPx, attribution, url: null }`. `name` is a Places
resource name — rendering it requires the server key, so a consumer must proxy
or re-host it. We never build the `…/media?key=` URL in a response.

## Env

| Var | Required | Effect when missing |
|---|---|---|
| `GOOGLE_PLACES_SERVER_KEY` (falls back to `GOOGLE_PLACES_KEY`) | **yes**, for real results | All three routes answer `503 { ok: false, configured: false }` — clean JSON, no exception, no hang |
| `APIFY_TOKEN` | no | Apify passes short-circuit to `null`; Places-only results stand |
| `BLOB_READ_WRITE_TOKEN` | no | Photo re-hosting is skipped; pointers returned as-is |

None are set on the Montivaro Vercel project today, so `503 configured: false`
is the current behaviour everywhere. Server-side only — never `NEXT_PUBLIC_`.

## What a future subpage calls

1. On each keystroke → `POST /api/places-autocomplete { input, lat?, lng? }`
   (optionally `GET /api/import-business` on the first keystroke to warm it).
2. Visitor picks a suggestion → you already have its `placeId`. If they hit
   Enter instead, `POST /api/find-business { query, near? }` and show the
   candidates.
3. `POST /api/import-business { placeId }` → `business`.
4. Feed `business` into the Vapi assistant config (name, category, hours,
   `utcOffsetMinutes`, address, phone) — e.g. alongside `lib/scrapeSite.ts`
   output when `business.website` is set.

## Caveats

- The rich Places field mask (`DETAIL_FIELD_MASK` in `places.ts`) has **not**
  been exercised against a live key — none is configured. A bad mask is a hard
  `400 INVALID_ARGUMENT`, so `detailsByPlaceId`/`detailsByTextQuery` retry once
  with `CORE_DETAIL_FIELD_MASK` (PrimeHub's production-proven set). If details
  start 400ing, that one constant is the fix.
- Reviews are deliberately not fetched (priciest Places SKU, little value to a
  receptionist). `rating` + `reviewCount` are.
- `photos.ts` is a seam with no blob implementation — see the marked spot.