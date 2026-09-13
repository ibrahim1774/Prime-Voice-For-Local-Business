// OPTIONAL Apify fallback. APIFY_TOKEN is NOT set on this project, so every
// entry point here short-circuits to null/[] and the Places path is the whole
// story. Nothing in this module may ever fail a request because Apify is
// unconfigured — callers treat null as "no fallback available".
//
// Ported from PrimeHub's lib/scrapers/util.ts + gbp.ts (compass crawler).

import type { BusinessCandidate, BusinessHoursDay, BusinessRecord } from './types';
import { apifyToken, humaniseType, mapsUrlForPlaceId } from './util';

const ACTOR = 'compass~crawler-google-places';

export function apifyConfigured(): boolean {
  return apifyToken().length > 0;
}

/** Strip control chars the actor occasionally emits so JSON.parse survives. */
function sanitiseJsonText(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c >= 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) out += raw[i];
  }
  return out;
}

/** run-sync-get-dataset-items with a hard wall-clock cap. Returns [] on any
 *  failure — never throws, so an unconfigured/flaky Apify can't break a route. */
export async function runApifyActor(opts: {
  actorId: string;
  input: Record<string, any>;
  token: string;
  timeoutSec?: number;
}): Promise<any[]> {
  if (!opts.token) return [];
  const timeoutSec = opts.timeoutSec ?? 40;
  const url =
    `https://api.apify.com/v2/acts/${opts.actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(opts.token)}&clean=1&timeout=${timeoutSec}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), (timeoutSec + 8) * 1000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.input),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`[businessImport/apify] ${opts.actorId} → ${resp.status}: ${text.slice(0, 200)}`);
      return [];
    }
    const items = JSON.parse(sanitiseJsonText(await resp.text()));
    return Array.isArray(items) ? items : [];
  } catch (e: any) {
    console.warn(`[businessImport/apify] ${opts.actorId} failed:`, e?.message || e);
    return [];
  } finally {
    clearTimeout(deadline);
  }
}

/** Search-only pass (no detail page, no photos, no reviews → fast + cheap). */
export async function findCandidatesViaApify(
  query: string,
  near?: string,
): Promise<BusinessCandidate[] | null> {
  const token = apifyToken();
  if (!token) return null;
  const items = await runApifyActor({
    actorId: ACTOR,
    token,
    timeoutSec: 40,
    input: {
      searchStringsArray: [query],
      ...(near ? { locationQuery: near } : {}),
      maxCrawledPlacesPerSearch: 6,
      scrapePlaceDetailPage: false,
      maxImages: 0,
      maxReviews: 0,
      language: 'en',
    },
  });
  const candidates = items
    .filter((i: any) => i?.title && i?.placeId)
    .slice(0, 6)
    .map((i: any) => ({
      placeId: String(i.placeId),
      title: String(i.title),
      address: String(i.address || [i.street, i.city, i.state].filter(Boolean).join(', ') || ''),
      category: String(i.categoryName || ''),
      rating: typeof i.totalScore === 'number' ? i.totalScore : null,
      reviews: typeof i.reviewsCount === 'number' ? i.reviewsCount : null,
    }));
  return candidates.length ? candidates : null;
}

function hoursFromApify(raw: any): BusinessHoursDay[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h: any) => h?.day)
    .map((h: any) => ({
      day: String(h.day),
      hours: String(h.hours || 'Closed'),
      closed: /closed/i.test(String(h.hours || '')),
    }));
}

/** Detail pass for one business. null when Apify is off or found nothing. */
export async function importViaApify(query: string): Promise<BusinessRecord | null> {
  const token = apifyToken();
  if (!token || query.trim().length < 2) return null;
  const items = await runApifyActor({
    actorId: ACTOR,
    token,
    timeoutSec: 55,
    input: {
      searchStringsArray: [query.trim()],
      maxCrawledPlacesPerSearch: 1,
      language: 'en',
      scrapePlaceDetailPage: true,
      maxImages: 0,
      maxReviews: 0,
    },
  });
  const i: any = items.find((x: any) => x?.title);
  if (!i) return null;

  const placeId = String(i.placeId || '');
  const categories = [i.categoryName, ...(Array.isArray(i.categories) ? i.categories : [])]
    .filter((c: any) => typeof c === 'string' && c)
    .map((c: string) => humaniseType(c));

  return {
    placeId,
    name: String(i.title),
    phone: String(i.phone || ''),
    phoneE164: String(i.phoneUnformatted || i.phone || '').replace(/[^\d+]/g, ''),
    formattedAddress: String(i.address || ''),
    street: String(i.street || ''),
    city: String(i.city || ''),
    state: String(i.state || ''),
    postalCode: String(i.postalCode || ''),
    country: String(i.countryCode || ''),
    website: String(i.website || ''),
    category: String(i.categoryName || categories[0] || ''),
    categories,
    description: String(i.description || ''),
    hours: hoursFromApify(i.openingHours),
    hoursPeriods: [],
    utcOffsetMinutes: null,
    businessStatus: i.permanentlyClosed
      ? 'CLOSED_PERMANENTLY'
      : i.temporarilyClosed
        ? 'CLOSED_TEMPORARILY'
        : 'OPERATIONAL',
    openNow: null,
    rating: typeof i.totalScore === 'number' ? i.totalScore : null,
    reviewCount: typeof i.reviewsCount === 'number' ? i.reviewsCount : null,
    latitude: typeof i.location?.lat === 'number' ? i.location.lat : null,
    longitude: typeof i.location?.lng === 'number' ? i.location.lng : null,
    mapsUrl: String(i.url || (placeId ? mapsUrlForPlaceId(placeId) : '')),
    source: 'apify',
    fetchedAt: Date.now(),
  };
}
