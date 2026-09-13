// Google Places API (New) client for the business-import endpoints.
//
// Server-side ONLY. GOOGLE_PLACES_SERVER_KEY (or GOOGLE_PLACES_KEY) is an
// API-restricted server key with no HTTP-referrer lock — it must never be
// prefixed NEXT_PUBLIC_, never reach the browser, and never appear inside a
// URL we hand back in a response body.
//
// Every function here is fail-soft: it returns null / [] rather than throwing,
// except for BusinessImportError, which carries a message meant for the user.

import {
  BusinessImportError,
  PlacesUpstreamError,
  type BusinessCandidate,
  type BusinessHoursDay,
  type BusinessHoursPeriod,
  type BusinessPhoto,
  type BusinessRecord,
  type BusinessSuggestion,
} from './types';
import {
  extractSearchQuery,
  humaniseType,
  isShortLinkHost,
  mapsUrlForPlaceId,
  placeIdFromUrl,
  resolveFinalUrl,
} from './util';

export const PLACES_BASE = 'https://places.googleapis.com/v1';

const REQUEST_TIMEOUT_MS = 9000;

// Fields PrimeHub has proven in production. If the richer mask below is ever
// rejected, we retry with this one so an import still succeeds.
export const CORE_DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours.weekdayDescriptions',
  'rating',
  'userRatingCount',
  'photos',
  'types',
  'primaryTypeDisplayName',
  'editorialSummary',
].join(',');

// The full mask. Everything after the CORE entries is an ADDITION beyond
// PrimeHub's proven set, added because a voice agent needs it:
//   addressComponents  → real city/state/postalCode (not string-split guesses)
//   location           → latitude/longitude
//   googleMapsUri      → mapsUrl straight from Google
//   ...periods/openNow → machine-readable "are you open right now?"
//   utcOffsetMinutes   → without it, hours can't be compared to wall clock
//   businessStatus     → temporarily/permanently closed
// NOTE: an invalid field mask is a hard 400 INVALID_ARGUMENT from Google with
// no partial result. This mask has NOT been exercised against a live key (no
// key is configured on this project). If details start 400ing, the retry below
// keeps imports working, and the fix is this one constant.
export const DETAIL_FIELD_MASK = [
  CORE_DETAIL_FIELD_MASK,
  'addressComponents',
  'location',
  'googleMapsUri',
  'regularOpeningHours.periods',
  'regularOpeningHours.openNow',
  'utcOffsetMinutes',
  'businessStatus',
].join(',');

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.primaryTypeDisplayName',
  'places.rating',
  'places.userRatingCount',
].join(',');

const GENERIC_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'service',
  'health',
  'store',
  'food',
]);

async function placesFetch(
  path: string,
  opts: { key: string; fieldMask: string; method?: string; body?: string },
): Promise<Response> {
  return fetch(`${PLACES_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': opts.key,
      'X-Goog-FieldMask': opts.fieldMask,
    },
    body: opts.body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/* ------------------------------------------------------------------ *
 * Autocomplete
 * ------------------------------------------------------------------ */

export async function suggestBusinesses(
  input: string,
  bias?: { lat?: number; lng?: number },
  key?: string,
): Promise<BusinessSuggestion[]> {
  const apiKey = (key || '').trim();
  if (!apiKey || input.length < 3) return [];

  const payload: Record<string, unknown> = { input, includedRegionCodes: ['us', 'ca'] };
  const lat = Number(bias?.lat);
  const lng = Number(bias?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    payload.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } };
  }

  try {
    const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) {
      console.warn('[businessImport/autocomplete] upstream', r.status, (await r.text()).slice(0, 200));
      return [];
    }
    const d: any = await r.json();
    return ((d?.suggestions || []) as any[])
      .map((sg) => sg?.placePrediction)
      .filter(Boolean)
      .map((pp: any) => ({
        placeId: String(pp.placeId || ''),
        main: String(pp.structuredFormat?.mainText?.text || pp.text?.text || ''),
        secondary: String(pp.structuredFormat?.secondaryText?.text || ''),
      }))
      .filter((sg: BusinessSuggestion) => sg.main && sg.placeId)
      .slice(0, 6);
  } catch (err: any) {
    console.warn('[businessImport/autocomplete] failed:', err?.message || err);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Candidate search
 * ------------------------------------------------------------------ */

/**
 * Up to 6 pickable businesses for a typed name.
 *
 * The three outcomes are kept DISTINCT on purpose: "Google answered, nothing
 * matched" and "Google rejected us" need different messages (check the
 * spelling vs. fix the key), and collapsing them into an empty list is how a
 * misconfigured deployment ends up looking like a business that doesn't exist.
 */
export type PlacesSearchResult =
  | { status: 'ok'; candidates: BusinessCandidate[] }
  | { status: 'empty' }
  | { status: 'upstream-error'; code: number };

export async function findCandidatesViaPlaces(
  query: string,
  near: string | undefined,
  key: string,
): Promise<PlacesSearchResult> {
  if (!key) return { status: 'upstream-error', code: 0 };
  const textQuery = query.includes(',') || !near ? query : `${query} in ${near}`;
  try {
    const r = await placesFetch('/places:searchText', {
      method: 'POST',
      key,
      fieldMask: SEARCH_FIELD_MASK,
      body: JSON.stringify({ textQuery, maxResultCount: 6 }),
    });
    if (!r.ok) {
      console.warn('[businessImport/find] searchText failed', r.status, (await r.text()).slice(0, 300));
      return { status: 'upstream-error', code: r.status };
    }
    const d: any = await r.json();
    const candidates = ((d?.places || []) as any[])
      .filter((p) => p?.displayName?.text && p?.id)
      .slice(0, 6)
      .map((p) => ({
        placeId: String(p.id),
        title: String(p.displayName.text),
        address: String(p.formattedAddress || ''),
        category: String(p.primaryTypeDisplayName?.text || ''),
        rating: typeof p.rating === 'number' ? p.rating : null,
        reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      }));
    return candidates.length ? { status: 'ok', candidates } : { status: 'empty' };
  } catch (e: any) {
    console.warn('[businessImport/find] searchText threw:', e?.message || e);
    return { status: 'upstream-error', code: 0 };
  }
}

/* ------------------------------------------------------------------ *
 * Details → BusinessRecord
 * ------------------------------------------------------------------ */

/** Google answers a bad field mask AND a bad key with 400, and the wording of a
 *  rejected nested field ("regularOpeningHours.periods") isn't guaranteed to
 *  contain the words "field mask". So: retry any 400 EXCEPT the ones that are
 *  plainly about credentials — retrying those would just burn a round trip. */
function isFieldMaskError(status: number, body: string): boolean {
  if (status !== 400) return false;
  return !/api[ _]?key|permission|not authoriz|billing|PERMISSION_DENIED|UNAUTHENTICATED/i.test(body);
}

async function detailsByPlaceId(placeId: string, key: string): Promise<any | null> {
  for (const mask of [DETAIL_FIELD_MASK, CORE_DETAIL_FIELD_MASK]) {
    const r = await placesFetch(`/places/${encodeURIComponent(placeId)}`, { key, fieldMask: mask });
    if (r.ok) return r.json();
    const body = (await r.text().catch(() => '')).slice(0, 300);
    console.warn('[businessImport/details] lookup failed', r.status, body);
    // Only a REJECTED FIELD MASK is worth retrying. A bad/absent key is also a
    // 400, and retrying that just burns a second round trip.
    if (!isFieldMaskError(r.status, body) || mask === CORE_DETAIL_FIELD_MASK) {
      throw new PlacesUpstreamError(r.status);
    }
    console.warn('[businessImport/details] retrying with the core field mask');
  }
  return null;
}

async function detailsByTextQuery(query: string, key: string): Promise<any | null> {
  for (const mask of [DETAIL_FIELD_MASK, CORE_DETAIL_FIELD_MASK]) {
    const fieldMask = mask.split(',').map((f) => `places.${f}`).join(',');
    const r = await placesFetch('/places:searchText', {
      method: 'POST',
      key,
      fieldMask,
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (r.ok) {
      const d: any = await r.json();
      return d?.places?.[0] || null;
    }
    const body = (await r.text().catch(() => '')).slice(0, 300);
    console.warn('[businessImport/details] searchText failed', r.status, body);
    if (!isFieldMaskError(r.status, body) || mask === CORE_DETAIL_FIELD_MASK) {
      throw new PlacesUpstreamError(r.status);
    }
  }
  return null;
}

function componentText(place: any, type: string, short = false): string {
  const comp = ((place?.addressComponents || []) as any[]).find((c) =>
    ((c?.types || []) as string[]).includes(type),
  );
  if (!comp) return '';
  return String((short ? comp.shortText : comp.longText) || comp.longText || '');
}

/** "728 Franklin Ave, Brooklyn, NY 11238, USA" → { city: "Brooklyn", state: "NY" }
 *  Fallback for when addressComponents is absent (core-mask retry). */
function cityStateFromFormatted(formatted: string): { city: string; state: string; postalCode: string } {
  const parts = formatted.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return { city: '', state: '', postalCode: '' };
  const tail = parts[parts.length - 1];
  const hasCountry = !/\d/.test(tail);
  const stateZip = hasCountry ? parts[parts.length - 2] : parts[parts.length - 1];
  const city = hasCountry ? parts[parts.length - 3] : parts[parts.length - 2];
  const bits = stateZip.split(/\s+/);
  return { city: city || '', state: bits[0] || '', postalCode: bits.slice(1).join(' ') };
}

function hoursFromWeekdayDescriptions(desc: unknown): BusinessHoursDay[] {
  if (!Array.isArray(desc)) return [];
  return desc
    .map((line) => {
      const m = String(line).match(/^([^:]+):\s*(.+)$/);
      if (!m) return null;
      return { day: m[1].trim(), hours: m[2].trim(), closed: /closed/i.test(m[2]) };
    })
    .filter((h): h is BusinessHoursDay => !!h);
}

function periodsFromPlace(raw: unknown): BusinessHoursPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => {
      const openDay = Number(p?.open?.day);
      if (!Number.isFinite(openDay)) return null;
      const openMinute = (Number(p?.open?.hour) || 0) * 60 + (Number(p?.open?.minute) || 0);
      const hasClose = p?.close && Number.isFinite(Number(p.close.day));
      return {
        openDay,
        openMinute,
        closeDay: hasClose ? Number(p.close.day) : null,
        closeMinute: hasClose
          ? (Number(p.close.hour) || 0) * 60 + (Number(p.close.minute) || 0)
          : null,
      };
    })
    .filter((p): p is BusinessHoursPeriod => !!p);
}

function photosFromPlace(raw: unknown): BusinessPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 10)
    .filter((p: any) => p?.name)
    .map((p: any) => ({
      name: String(p.name),
      widthPx: typeof p.widthPx === 'number' ? p.widthPx : null,
      heightPx: typeof p.heightPx === 'number' ? p.heightPx : null,
      attribution: String(p?.authorAttributions?.[0]?.displayName || ''),
      url: null,
    }));
}

/** Map a raw Places (New) place object onto our framework-neutral record. */
export function toBusinessRecord(place: any): BusinessRecord {
  const placeId = String(place?.id || '');
  const formattedAddress = String(place?.formattedAddress || '');
  const fallback = cityStateFromFormatted(formattedAddress);
  const streetNumber = componentText(place, 'street_number');
  const route = componentText(place, 'route');
  const categories = ((place?.types || []) as string[])
    .filter((t) => !GENERIC_TYPES.has(t))
    .map(humaniseType);

  return {
    placeId,
    name: String(place?.displayName?.text || ''),
    phone: String(place?.nationalPhoneNumber || place?.internationalPhoneNumber || ''),
    phoneE164: String(place?.internationalPhoneNumber || '').replace(/[^\d+]/g, ''),
    formattedAddress,
    street: [streetNumber, route].filter(Boolean).join(' ') || formattedAddress.split(',')[0] || '',
    city:
      componentText(place, 'locality') ||
      componentText(place, 'postal_town') ||
      componentText(place, 'sublocality_level_1') ||
      fallback.city,
    state: componentText(place, 'administrative_area_level_1', true) || fallback.state,
    postalCode: componentText(place, 'postal_code') || fallback.postalCode,
    country: componentText(place, 'country', true),
    website: String(place?.websiteUri || ''),
    category: String(place?.primaryTypeDisplayName?.text || categories[0] || ''),
    categories,
    description: String(place?.editorialSummary?.text || ''),
    hours: hoursFromWeekdayDescriptions(place?.regularOpeningHours?.weekdayDescriptions),
    hoursPeriods: periodsFromPlace(place?.regularOpeningHours?.periods),
    utcOffsetMinutes:
      typeof place?.utcOffsetMinutes === 'number' ? place.utcOffsetMinutes : null,
    businessStatus: String(place?.businessStatus || ''),
    openNow:
      typeof place?.regularOpeningHours?.openNow === 'boolean'
        ? place.regularOpeningHours.openNow
        : null,
    rating: typeof place?.rating === 'number' ? place.rating : null,
    reviewCount: typeof place?.userRatingCount === 'number' ? place.userRatingCount : null,
    latitude: typeof place?.location?.latitude === 'number' ? place.location.latitude : null,
    longitude: typeof place?.location?.longitude === 'number' ? place.location.longitude : null,
    mapsUrl: String(place?.googleMapsUri || (placeId ? mapsUrlForPlaceId(placeId) : '')),
    source: 'places',
    fetchedAt: Date.now(),
  };
}

export interface PlacesImportInput {
  placeId?: string;
  query?: string;
  url?: string;
}

/**
 * Resolve a placeId / typed query / pasted Google URL to a raw place object.
 * Returns null when nothing matched (caller may try Apify).
 * Throws BusinessImportError for dead ends no scraper can fix, and
 * PlacesUpstreamError when Google rejected/failed the call.
 */
export async function lookupPlace(input: PlacesImportInput, key: string): Promise<any | null> {
  if (!key) return null;

  if (input.placeId) return detailsByPlaceId(input.placeId.trim(), key);

  const url = (input.url || '').trim();
  if (url) {
    const cleaned = url.replace(/\/review\/?(\?.*)?$/i, '');
    const resolved = isShortLinkHost(cleaned) ? await resolveFinalUrl(cleaned) : cleaned;

    if (/share\.google\/error/i.test(resolved) || /google\.[a-z.]+\/share\.google/i.test(resolved)) {
      throw new BusinessImportError(
        "That Google share link only opens inside the Google app, so we can't read it. Type the business name and city instead — e.g. \"Nail Festival Salon, Houston\" — or paste the address-bar URL of the listing (google.com/maps/place/…).",
      );
    }

    const pid = placeIdFromUrl(resolved);
    if (pid) return detailsByPlaceId(pid, key);

    const fromUrl =
      extractSearchQuery(resolved) || (!/^https?:\/\//i.test(cleaned) ? cleaned : null);
    if (fromUrl && fromUrl.length >= 2) return detailsByTextQuery(fromUrl, key);
    return null;
  }

  const query = (input.query || '').trim();
  if (query.length >= 2) return detailsByTextQuery(query, key);
  return null;
}

/** Full Places import: raw place → { record, photos }. null when nothing
 *  matched; throws PlacesUpstreamError when Google itself rejected the call. */
export async function importViaPlaces(
  input: PlacesImportInput,
  key: string,
): Promise<{ record: BusinessRecord; photos: BusinessPhoto[] } | null> {
  const place = await lookupPlace(input, key);
  if (!place?.displayName?.text) return null;
  return { record: toBusinessRecord(place), photos: photosFromPlace(place?.photos) };
}
