/** Quote-of-the-day block (FR-013/FR-019) — shared scope, cached per date
 * (`getOrFetchOnceDaily`, `daily_briefing_block_cache` blockType `"quoteOfDay"`): at most one
 * `source` call per date per household, reused across every member's briefing. A
 * failed/timed-out `source` call skips the block (resolves `null`) WITHOUT caching the
 * failure, so the next generation pass retries (FR-019 allowFailure + "no negative caching").
 * A Spanish household reads the local corpus instead (`spanishQuoteOfDay`, FR-036): no call, no
 * cache row.
 */
import { getOrFetchOnceDaily, type DailyBlockCache } from "../external/shared-cache";
import type { QuoteOfDayData, QuoteSource } from "../external/ports";
import { quotesEsCorpus } from "../corpora";
import { dayOfYear } from "./number-fact";

export type { QuoteOfDayData };

const BLOCK_TYPE = "quoteOfDay";

export async function generateQuoteOfDayBlock(
  cache: DailyBlockCache,
  source: QuoteSource
): Promise<QuoteOfDayData | null> {
  return getOrFetchOnceDaily(cache, BLOCK_TYPE, source);
}

/** FR-036: keyed by day of year like `numberFact`, so no entry repeats within a year. */
export function spanishQuoteOfDay(date: string): QuoteOfDayData {
  const entry = quotesEsCorpus[dayOfYear(date) - 1];
  return { text: entry.text, author: entry.author };
}
