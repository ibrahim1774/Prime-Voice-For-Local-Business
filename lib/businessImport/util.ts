// Small, dependency-free helpers shared by the business-import endpoints.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/** The Places server key, or "" when unconfigured. Server-side only — never
 *  NEXT_PUBLIC_, never returned to the browser, never put in a response URL. */
export function placesKey(): string {
  return (process.env.GOOGLE_PLACES_SERVER_KEY || process.env.GOOGLE_PLACES_KEY || '').trim();
}

export function apifyToken(): string {
  return (process.env.APIFY_TOKEN || '').trim();
}

export function blobToken(): string {
  return (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
}

/** Follow redirects to the final URL (short links: maps.app.goo.gl, g.page,
 *  share.google…). Always GET — HEAD resolves share.google to a useless
 *  intermediate. Never throws; returns the input on failure. */
export async function resolveFinalUrl(url: string, timeoutMs = 6000): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.url || url;
  } catch {
    return url;
  }
}

export const SHORT_LINK_HOSTS =
  /(^|\.)(maps\.app\.goo\.gl|share\.google|g\.co|goo\.gl|g\.page)$/i;

export function isShortLinkHost(raw: string): boolean {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return SHORT_LINK_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Pull a place_id out of a Google URL ("...?q=place_id:ChIJ..."). */
export function placeIdFromUrl(url: string): string | null {
  const m = url.match(/place_id[:=]([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Pull a searchable business name out of any common Google URL shape. */
export function extractSearchQuery(googleUrl: string): string | null {
  try {
    const u = new URL(googleUrl);

    // /maps/place/<Name>/@lat,lng,zoom/...
    const mapsPlace = u.pathname.match(/\/maps\/place\/([^/@]+)/i);
    if (mapsPlace) {
      const raw = decodeURIComponent(mapsPlace[1]).replace(/\+/g, ' ').trim();
      const q = raw.replace(/!.*$/, '').trim();
      if (q && !/^data=/i.test(q)) return q;
    }

    // /search?q=<Name>
    const q = u.searchParams.get('q');
    if (q) return q.trim();

    // /maps/search/<query>
    const mapsSearch = u.pathname.match(/\/maps\/search\/([^/]+)/i);
    if (mapsSearch) return decodeURIComponent(mapsSearch[1]).replace(/\+/g, ' ').trim();

    return null;
  } catch {
    return null;
  }
}

/** "Barbers of Bushwick" → "barbers-of-bushwick" (blob keys, cache keys). */
export function slugify(name: string, max = 40): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || 'business'
  );
}

/** Key-free, always-valid public Maps link for a place id. */
export function mapsUrlForPlaceId(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

/** barber_shop → "Barber shop" */
export function humaniseType(t: string): string {
  const s = String(t).replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
