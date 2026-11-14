/** dadJoke corpus block (v1 parity port of `blocks/dad-joke.ts`).
 */
import { dadJokesCorpus, hashSeed } from "../corpora";
import type { CorpusBlockType } from "../corpora";
import { resolveCorpusLanguage, type CorpusGenerationContext } from "./context";

const TYPE: CorpusBlockType = "dadJoke";

export interface DadJokeData {
  text: string;
}

/** v1 seed: `${date}|joke` (v1 study, table) — date-only, no memberId, so every
 * household member sees the SAME joke on a given date (v1 `scope: "shared"` parity).
 * FR-009/INV-06: `params.language` selects the `en`/`es` variant (index-aligned corpora).
 */
export function generateDadJoke(ctx: CorpusGenerationContext): DadJokeData {
  const language = resolveCorpusLanguage(TYPE, ctx.params);
  const pool = dadJokesCorpus[language];
  const idx = hashSeed(`${ctx.date}|joke`) % pool.length;
  return { text: pool[idx].text };
}
