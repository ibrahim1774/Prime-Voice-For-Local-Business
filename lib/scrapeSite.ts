// Lightweight, fail-soft homepage scraper used to tailor the AI receptionist
// to a caller's real business. Fetches a single URL server-side, strips
// markup/boilerplate, and returns a compact plain-text digest for the LLM.
// Never throws — returns null on any failure so demo generation still works
// even when the site is blocked, slow, or not provided.

const FETCH_TIMEOUT_MS = 8000;
const MAX_CHARS = 7000;

function normalizeUrl(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    // Drop non-content blocks entirely.
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Turn block-level tags into line breaks so text doesn't run together.
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Decode the handful of entities that actually matter for prose.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    // Collapse whitespace.
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function extractMeta(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const desc =
    html
      .match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?.trim() ||
    html
      .match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?.trim() ||
    "";
  const parts: string[] = [];
  if (title) parts.push(`Page title: ${title}`);
  if (desc) parts.push(`Meta description: ${desc}`);
  return parts.join("\n");
}

export interface ScrapedSite {
  url: string;
  text: string;
}

// Fetch + digest a single homepage. Returns null on any failure (bad URL,
// non-HTML, timeout, network error, or too-thin content).
export async function scrapeSite(rawUrl: string): Promise<ScrapedSite | null> {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MontivaroBot/1.0; +https://montivaro.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("html")) return null;

    const html = await res.text();
    const meta = extractMeta(html);
    const body = htmlToText(html);
    const combined = [meta, body].filter(Boolean).join("\n\n").slice(0, MAX_CHARS);
    // Guard against near-empty SPA shells — too little to tailor anything.
    if (combined.replace(/\s/g, "").length < 40) return null;
    return { url, text: combined };
  } catch {
    return null;
  }
}
