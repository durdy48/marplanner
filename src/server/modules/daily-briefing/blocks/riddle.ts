/** riddle corpus block (v1 parity port of `blocks/riddle.ts`).
 */
import { hashSeed, riddlesCorpus } from "../corpora";
import type { CorpusBlockType } from "../corpora";
import { resolveCorpusLanguage, type CorpusGenerationContext } from "./context";

const TYPE: CorpusBlockType = "riddle";

/** v1 parity, DELIBERATE contrast with trivia: the answer IS included here (— "riddle
 * (answer in payload, de-emphasized in view, rotated in print)"). the family view renders it
 * inline, de-emphasized; the print render rotates it (out of this module's scope).
 */
export interface RiddleData {
  question: string;
  answer: string;
}

/** v1 seed: `${date}|riddle` (table) — date-only, no memberId (v1 `scope: "shared"`).
 * FR-009/INV-06: `params.language` selects the `en`/`es` variant (index-aligned corpora).
 */
export function generateRiddle(ctx: CorpusGenerationContext): RiddleData {
  const language = resolveCorpusLanguage(TYPE, ctx.params);
  const pool = riddlesCorpus[language];
  const idx = hashSeed(`${ctx.date}|riddle`) % pool.length;
  const entry = pool[idx];
  return { question: entry.question, answer: entry.answer };
}
