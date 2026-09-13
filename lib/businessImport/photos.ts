// Photo handling — deliberately inert.
//
// PrimeHub re-hosts every imported photo to Vercel Blob because the source
// URLs carry signed tokens that expire. Montivaro has NO blob store, and a
// voice agent has no use for pictures, so this module is a SEAM, not an
// implementation:
//
//   - BLOB_READ_WRITE_TOKEN absent (the case today): returns the photo
//     pointers untouched. No network calls, nothing to hang, nothing to throw.
//   - BLOB_READ_WRITE_TOKEN present: still returns them untouched, and logs
//     once that re-hosting is not wired up. Wire `@vercel/blob`'s `put()` in
//     at the marked spot when Montivaro actually gets a store.
//
// The one hard rule this module exists to protect: a Places photo becomes
// bytes only via `https://places.googleapis.com/v1/<name>/media?key=<KEY>`,
// and that URL leaks the server key. So we never build it here and never put
// it in a response. Consumers get the opaque `name` and must proxy it
// server-side (or re-host) to display anything.

import type { BusinessPhoto } from './types';
import { blobToken } from './util';

let warned = false;

export interface RehostOptions {
  /** Slug used to scope blob keys once re-hosting is implemented. */
  siteSlug: string;
  /** Explicit token override; falls back to BLOB_READ_WRITE_TOKEN. */
  token?: string;
}

export async function rehostPhotos(
  photos: BusinessPhoto[],
  opts: RehostOptions,
): Promise<BusinessPhoto[]> {
  const token = (opts.token ?? blobToken()).trim();
  if (!token) return photos;

  // ---- wire a real blob store in here ----------------------------------
  // for each photo: fetch `${PLACES_BASE}/${photo.name}/media?key=${key}`
  // with a per-photo timeout + an overall deadline, `put()` the bytes, and
  // set `photo.url` to the public blob URL. Until then we stay inert so an
  // accidentally-present token can never slow down or break an import.
  if (!warned) {
    warned = true;
    console.warn(
      `[businessImport] BLOB_READ_WRITE_TOKEN is set but photo re-hosting is not implemented; returning ${photos.length} Places photo reference(s) as-is (slug=${opts.siteSlug}).`,
    );
  }
  return photos;
}
