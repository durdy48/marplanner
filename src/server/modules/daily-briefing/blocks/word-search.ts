/** wordSearch corpus block (v1 parity port of `blocks/word-search.ts` +
 * `word-search-profiles.ts`). See `./word-search-placement.ts` for the recorded deviation from
 * v1's `@blex41/word-search` dependency.
 */
import { fisherYates, getWordSearchPool, hashSeed, withSeededMathRandom } from "../corpora";
import type { CorpusBlockType, CorpusLanguage, WordSearchDifficulty } from "../corpora";
import {
  resolveCorpusLanguage,
  CorpusBlockParamError,
  type CorpusGenerationContext,
} from "./context";
import { buildWordSearchPuzzle } from "./word-search-placement";

const TYPE: CorpusBlockType = "wordSearch";
const VALID_DIFFICULTIES = new Set<WordSearchDifficulty>(["easy", "medium", "hard"]);
const DEFAULT_DIFFICULTY: WordSearchDifficulty = "easy";

interface WordSearchProfile {
  difficulty: WordSearchDifficulty;
  rows: number;
  cols: number;
  maxWords: number;
  minLength: number;
  maxLength: number;
  disabledDirections: string[];
  backwardsProbability: number;
  candidateMultiplier: number;
}

/** v1 `word-search-profiles.ts` — ported verbatim (dimensions/directions/probability per difficulty). */
const WORD_SEARCH_PROFILES: Record<WordSearchDifficulty, WordSearchProfile> = {
  easy: {
    difficulty: "easy",
    rows: 8,
    cols: 8,
    maxWords: 10,
    minLength: 3,
    maxLength: 5,
    disabledDirections: ["N", "S", "NE", "NW", "SE", "SW"],
    backwardsProbability: 0,
    candidateMultiplier: 4,
  },
  medium: {
    difficulty: "medium",
    rows: 10,
    cols: 10,
    maxWords: 12,
    minLength: 4,
    maxLength: 7,
    disabledDirections: ["N", "W", "NW", "SW"],
    backwardsProbability: 0.15,
    candidateMultiplier: 4,
  },
  hard: {
    difficulty: "hard",
    rows: 12,
    cols: 12,
    maxWords: 14,
    minLength: 5,
    maxLength: 10,
    disabledDirections: [],
    backwardsProbability: 0.3,
    candidateMultiplier: 5,
  },
};

export interface WordSearchData {
  difficulty: WordSearchDifficulty;
  cols: number;
  rows: number;
  grid: string[][];
  words: string[];
}

const SPANISH_ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** FR-037: the grid holds a Spanish word without its accents (CAMION), keeping Ñ as a letter of
 * its own; the word list prints it with them (CAMIÓN). */
export function spanishGridForm(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0301\u0308]/g, "")
    .normalize("NFC")
    .toLocaleUpperCase("es");
}

/** FR-037: with no language chosen, a Spanish household gets a Spanish or an English word search
 * by date. A hash rather than alternation, so the pattern is not predictable; the same for every
 * member that day, and the same again on regeneration. */
export function wordSearchDailyLanguage(date: string): CorpusLanguage {
  return hashSeed(`${date}|wordSearch|language`) % 2 === 0 ? "es" : "en";
}

function filterWordsForProfile(words: readonly string[], profile: WordSearchProfile): string[] {
  return words.filter(
    (word) => word.length >= profile.minLength && word.length <= profile.maxLength
  );
}

/** v1 TWO independent seeds: `selection` picks+shuffles the candidate word pool via
 * `fisherYates`; `placement` (a SEPARATE recipe, `|placement` suffix) drives the grid-building
 * randomness. The placement call is CONFINED inside `withSeededMathRandom` —
 * FR-020 (block generation within one briefing MUST be strictly serial) applies here in its most
 * literal form: `withSeededMathRandom` monkey-patches the process-global `Math.random` for the
 * duration of the callback, so if two confined calls (this generator, called twice, or any other
 * generator that also confines `Math.random`) were ever in flight CONCURRENTLY, their random
 * streams would corrupt each other. the generation loop (out of this module's scope) MUST NOT
 * `Promise.all` — or otherwise interleave — two block generations; the test file's
 * "serial-loop fence" case proves the confinement itself is correctly scoped (restored
 * immediately after each call, so an intervening non-confined generation cannot observe or leak
 * into it) — it does not, and cannot, prove the CALLER is serial, since that is the contract.
 */
export function generateWordSearch(ctx: CorpusGenerationContext): WordSearchData {
  const language = resolveCorpusLanguage(TYPE, ctx.params);

  const requested = ctx.params?.difficulty;
  let difficulty: WordSearchDifficulty;
  if (requested === undefined) {
    difficulty = DEFAULT_DIFFICULTY;
  } else if (VALID_DIFFICULTIES.has(requested as WordSearchDifficulty)) {
    difficulty = requested as WordSearchDifficulty;
  } else {
    throw new CorpusBlockParamError(
      `daily-briefing wordSearch: invalid difficulty "${requested}" (settings.ts must reject this upstream)`
    );
  }

  const profile = WORD_SEARCH_PROFILES[difficulty];
  const pool = filterWordsForProfile(getWordSearchPool(profile.difficulty, language), profile);

  const selectionSeed = hashSeed(`${ctx.date}|${ctx.memberId}|wordSearch|${profile.difficulty}`);
  const candidates = fisherYates(pool, selectionSeed).slice(
    0,
    profile.maxWords * profile.candidateMultiplier
  );

  const placementSeed = hashSeed(
    `${ctx.date}|${ctx.memberId}|wordSearch|${profile.difficulty}|placement`
  );
  const spanish = language === "es";
  const gridForm = (word: string) => (spanish ? spanishGridForm(word) : word.toUpperCase());
  const printed = new Map(
    candidates.map((word) => [gridForm(word), word.toLocaleUpperCase(language)])
  );
  const puzzle = withSeededMathRandom(placementSeed, () =>
    buildWordSearchPuzzle({
      rows: profile.rows,
      cols: profile.cols,
      disabledDirections: profile.disabledDirections,
      dictionary: candidates.map(gridForm),
      maxWords: profile.maxWords,
      backwardsProbability: profile.backwardsProbability,
      ...(spanish ? { alphabet: SPANISH_ALPHABET } : {}),
    })
  );

  return {
    difficulty: profile.difficulty,
    cols: profile.cols,
    rows: profile.rows,
    grid: puzzle.grid,
    words: puzzle.words.map((word) => printed.get(word) as string),
  };
}
