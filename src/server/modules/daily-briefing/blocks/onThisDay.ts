/** On-this-day block (FR-013/FR-019) — ships DEFAULT-DISABLED
 * (`../corpora/block-types.ts` `DEFAULT_DISABLED_BLOCK_TYPES`, FR-013, already seeded by the * settings-layer read-resolution); the generator itself is a normal shared-scope, cached,
 * allowFailure external block, same shape as `quoteOfDay` — the default-off behavior lives
 * entirely in `../settings.ts`, not here.
 * `languagePrefix` is the Wikipedia edition, `"en"` when omitted; generation derives it from the
 * household language (`onThisDayEdition`, `../external/ports.ts`, FR-032). No admin surface
 * exposes a per-instance language for `onThisDay` (FR-009 restricts the `language` param to
 * corpus-backed types; `onThisDay` is external, not corpus-backed). `daily_briefing_block_cache`
 * has no language column, so the edition goes into the row's `block_type` (`onThisDayCacheKey`):
 * each language caches apart, and after a household language change the next generation of that
 * date reads the new edition instead of the row the previous language left. Rows under the bare
 * `onThisDay` key were written before FR-032 (births and deaths included) and are never read.
 */
import { getOrFetchOnceDaily, type DailyBlockCache } from "../external/shared-cache";
import type { OnThisDayData, OnThisDaySource } from "../external/ports";

export type { OnThisDayData };

const BLOCK_TYPE = "onThisDay";

/** The shared-cache key for a Wikipedia edition: `onThisDay:en`, `onThisDay:es`. English is
 * qualified too, so a row cached before FR-032 under the bare key is not served again.
 */
export function onThisDayCacheKey(languagePrefix: string): string {
  return `${BLOCK_TYPE}:${languagePrefix}`;
}

export async function generateOnThisDayBlock(
  cache: DailyBlockCache,
  source: OnThisDaySource,
  date: string,
  languagePrefix = "en"
): Promise<OnThisDayData | null> {
  return getOrFetchOnceDaily(cache, onThisDayCacheKey(languagePrefix), () =>
    source(date, languagePrefix)
  );
}
