/** Injectable quote and on-this-day provider functions. Production adapters use a
 * five-second timeout and propagate provider failures to the shared daily cache.
 * Endpoint overrides come through the host API. Weather uses its own existing port.
 * Tests inject synthetic functions or point these adapters at loopback fixtures.
 */

import { getOperatorConfig } from "../../../host-api";

const FETCH_TIMEOUT_MS = 5000;

export interface QuoteOfDayData {
  text: string;
  author: string;
}

/** `births`/`deaths` stay for the snapshots and injected sources that carry them; the Wikipedia
 * adapter below fills `events` only (FR-032).
 */
export interface OnThisDayData {
  events?: string[];
  births?: string[];
  deaths?: string[];
}

/** A resolved `null` is a legitimate "no data" answer; a throw is a failure (see module doc). */
export type QuoteSource = () => Promise<QuoteOfDayData | null>;

/** `languagePrefix` is the Wikipedia edition to read, `"en"` when omitted. Generation passes
 * `onThisDayEdition(householdLanguage)` — see `../blocks/onThisDay.ts`'s doc comment.
 */
export type OnThisDaySource = (
  date: string,
  languagePrefix?: string
) => Promise<OnThisDayData | null>;

/** The Wikipedia editions this block may read, one per household language. */
const WIKIPEDIA_EDITIONS: ReadonlySet<string> = new Set(["en", "es"]);

/** Maps a household language to its Wikipedia edition. Anything outside the closed set reads
 * English, so an arbitrary string never reaches the request's host name.
 */
export function onThisDayEdition(language: string): string {
  return WIKIPEDIA_EDITIONS.has(language) ? language : "en";
}

/** Strips one matched pair of outer quote characters (ASCII + Unicode curly), v1 exact port. */
function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  const openers = new Set(['"', "'", "“", "‘"]);
  const closers = new Set(['"', "'", "”", "’"]);
  if (trimmed.length >= 2 && openers.has(trimmed[0]) && closers.has(trimmed[trimmed.length - 1])) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

interface ZenQuotesEntry {
  q?: string;
  a?: string;
}

/** ZenQuotes `/api/today` adapter — v1's exact endpoint, `QUOTE_ENDPOINT`-
 * overridable (module doc). */
export const zenQuotesSource: QuoteSource = async () => {
  const overrideBase = getOperatorConfig("dailyBriefing.quoteEndpoint");
  const url = overrideBase
    ? new URL("/api/today", overrideBase).toString()
    : "https://zenquotes.io/api/today";
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`zenquotes ${res.status}`);
  const json = (await res.json()) as ZenQuotesEntry[];
  const first = json[0];
  if (!first?.q) return null;
  return { text: stripOuterQuotes(first.q), author: (first.a ?? "Unknown").trim() };
};

interface WikipediaOnThisDayItem {
  year: number;
  text: string;
}

interface WikipediaOnThisDayResponse {
  events?: WikipediaOnThisDayItem[];
}

/** Picks up to 3 items spread across the array's thirds (recent / middle / old) — v1's exact
 * `pickThirds` recipe: arrays under 6 entries are returned in full; `[]` returns `[]`.
 */
function pickThirds<T>(items: readonly T[]): T[] {
  if (items.length === 0) return [];
  if (items.length < 6) return [...items];
  return [
    items[Math.floor(items.length / 6)],
    items[Math.floor(items.length / 2)],
    items[Math.floor((items.length * 5) / 6)],
  ];
}

/** The longest event text the slip prefers, about seven lines of the receipt. Wikipedia's
 * Spanish events run long: one in five is over this and a few reach several hundred characters.
 */
const CONCISE_EVENT_CHARS = 200;

/** The events to pick from: the concise ones whenever there are at least three of them. */
function conciseEvents(
  items: readonly WikipediaOnThisDayItem[]
): readonly WikipediaOnThisDayItem[] {
  const concise = items.filter(
    (item) => typeof item.text === "string" && item.text.length <= CONCISE_EVENT_CHARS
  );
  return concise.length >= 3 ? concise : items;
}

/** Wikipedia gives a year before the common era as a negative number. */
function formatYear(year: number, edition: string): string {
  if (year >= 0) return String(year);
  return edition === "es" ? `${-year} a. C.` : `${-year} BC`;
}

function formatItem(item: WikipediaOnThisDayItem, edition: string): string {
  return `${formatYear(item.year, edition)}: ${item.text}`;
}

/** Wikipedia `onthisday/events/{mm}/{dd}` adapter, language-prefixed URL and
 * `ONTHISDAY_ENDPOINT`-overridable (module doc). It asks for events only (FR-032): the briefing
 * carries no births or deaths, and the `all` feed is several times larger — the Spanish one can
 * outlast the timeout. An override replaces the whole `https://<lang>.wikipedia.org` origin (a
 * single fixture origin has no per-language subdomains to route to), keeping only the real
 * production path shape.
 */
export const wikipediaOnThisDaySource: OnThisDaySource = async (date, languagePrefix = "en") => {
  const edition = onThisDayEdition(languagePrefix);
  const [, mm, dd] = date.split("-");
  const path = `/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
  const overrideBase = getOperatorConfig("dailyBriefing.onThisDayEndpoint");
  const url = overrideBase
    ? new URL(path, overrideBase).toString()
    : `https://${edition}.wikipedia.org${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`onthisday ${res.status}`);
  const json = (await res.json()) as WikipediaOnThisDayResponse;

  const events = pickThirds(conciseEvents(json.events ?? [])).map((item) =>
    formatItem(item, edition)
  );
  return events.length > 0 ? { events } : null;
};
