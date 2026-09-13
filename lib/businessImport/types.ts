// Framework-neutral business record produced by the business-import
// endpoints. Deliberately NOT website-shaped: no niche, no template, no
// brand colours, no pricing tier. Everything here is something an AI
// receptionist plausibly needs to answer a call on behalf of the business
// ("are you open?", "where are you?", "what do you do?", "what's the
// number for the shop?").

export interface BusinessHoursDay {
  /** "Monday" … "Sunday" as Google renders it. */
  day: string;
  /** "9:00 AM – 6:00 PM" or "Closed". */
  hours: string;
  closed: boolean;
}

/** Machine-readable open/close, so an agent can compare against wall clock. */
export interface BusinessHoursPeriod {
  /** 0 = Sunday … 6 = Saturday. */
  openDay: number;
  /** Minutes since local midnight. */
  openMinute: number;
  /** null when the business never closes on that period (24h). */
  closeDay: number | null;
  closeMinute: number | null;
}

/**
 * Photo POINTERS only — never a fetchable URL that embeds our Places key.
 * `name` is a Places resource name ("places/<id>/photos/<ref>"); turning it
 * into bytes requires the server key, so a consumer must proxy or re-host it.
 * `url` is populated only when a blob store is wired up (see photos.ts).
 */
export interface BusinessPhoto {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  attribution: string;
  url: string | null;
}

export interface BusinessRecord {
  /** Google Place ID — the stable key to re-import or refresh this business. */
  placeId: string;
  name: string;
  /** Local format, e.g. "(718) 555-0134" — what a receptionist would read out. */
  phone: string;
  /** E.164-ish international format, e.g. "+17185550134" — what you dial. */
  phoneE164: string;
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  website: string;
  /** Human category, e.g. "Barber shop". Drives what the agent says it does. */
  category: string;
  /** All non-generic Google types, humanised. */
  categories: string[];
  /** Google's editorial blurb when it has one. Often empty. */
  description: string;
  hours: BusinessHoursDay[];
  hoursPeriods: BusinessHoursPeriod[];
  /** Local UTC offset in minutes — without it, hours can't be compared to now. */
  utcOffsetMinutes: number | null;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "". */
  businessStatus: string;
  /** Google's own open/closed verdict at fetch time. null when unknown. */
  openNow: boolean | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Key-free public Maps link, safe to hand to the browser. */
  mapsUrl: string;
  /** Where the record came from. */
  source: 'places' | 'apify';
  /** Unix ms the record was built. */
  fetchedAt: number;
}

/** One row of the pick-list a visitor chooses from after typing a name. */
export interface BusinessCandidate {
  placeId: string;
  title: string;
  address: string;
  category: string;
  rating: number | null;
  reviews: number | null;
}

/** One autocomplete row (as-you-type). */
export interface BusinessSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

/**
 * A dead end the caller should SHOW the user verbatim (422). Anything else
 * is our fault and becomes a generic 5xx with the detail in the server log.
 */
export class BusinessImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessImportError';
  }
}

/**
 * Google itself rejected or failed the call (bad key, quota, 5xx). Distinct
 * from "no such business" so a misconfigured deployment never reads as a
 * spelling mistake.
 */
export class PlacesUpstreamError extends Error {
  code: number;
  constructor(code: number, message?: string) {
    super(message || `Places upstream error ${code}`);
    this.name = 'PlacesUpstreamError';
    this.code = code;
  }
}
