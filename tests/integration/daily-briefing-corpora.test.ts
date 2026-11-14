import { describe, expect, it } from "vitest";
import {
  animalFactsCorpus,
  CORPUS_BLOCK_TYPES,
  corpusLanguagesFor,
  dadJokesCorpus,
  drawingPromptsCorpus,
  fisherYates,
  getWordSearchPool,
  hashSeed,
  isCorpusBackedBlockType,
  isCorpusLanguageAvailable,
  isKnownBlockType,
  numberFactsCorpus,
  quotesEsCorpus,
  riddlesCorpus,
  triviaCorpus,
  vocabularyCorpus,
  withSeededMathRandom,
  wouldYouRathersCorpus,
} from "../../src/server/modules/daily-briefing/corpora/index";

/** docs/features/daily-briefing.md (trap-sweep row): loader
 * shapes/counts, deterministic seeded selection, ES-variant resolution for the translated
 * corpora, the Spanish riddles' content rules (FR-034), and corpus-availability-map
 * correctness — the exact surface `../settings.ts` and the future block generators depend on.
 */
describe("daily-briefing corpora", () => {
  describe("loader shapes and counts (v1 study parity)", () => {
    it("jokes: 588 entries (en), 588 entries (es), each a TextEntry", () => {
      expect(dadJokesCorpus.en).toHaveLength(588);
      expect(dadJokesCorpus.es).toHaveLength(588);
      expect(dadJokesCorpus.en[0]).toHaveProperty("text");
      expect(typeof dadJokesCorpus.en[0].text).toBe("string");
    });

    it("trivia: 832 entries", () => {
      expect(triviaCorpus).toHaveLength(832);
      expect(triviaCorpus[0]).toMatchObject({
        question: expect.any(String),
        correctAnswer: expect.any(String),
        options: expect.any(Array),
        difficulty: expect.stringMatching(/^(easy|medium|hard)$/),
        category: expect.any(String),
      });
    });

    it("vocabulary: 398 entries", () => {
      expect(vocabularyCorpus).toHaveLength(398);
      expect(vocabularyCorpus[0]).toMatchObject({
        word: expect.any(String),
        level: expect.stringMatching(/^L[1-4]$/),
      });
    });

    it("animal facts: 484 entries (en), 484 entries (es)", () => {
      expect(animalFactsCorpus.en).toHaveLength(484);
      expect(animalFactsCorpus.es).toHaveLength(484);
    });

    it("number facts: 366 entries (en), 366 entries (es)", () => {
      expect(numberFactsCorpus.en).toHaveLength(366);
      expect(numberFactsCorpus.es).toHaveLength(366);
    });

    it("drawing prompts: 365 entries (en), 365 entries (es)", () => {
      expect(drawingPromptsCorpus.en).toHaveLength(365);
      expect(drawingPromptsCorpus.es).toHaveLength(365);
    });

    it("would-you-rathers: 201 entries (en), 201 entries (es)", () => {
      expect(wouldYouRathersCorpus.en).toHaveLength(201);
      expect(wouldYouRathersCorpus.es).toHaveLength(201);
    });

    it("riddles: 122 entries (en), 122 entries (es)", () => {
      expect(riddlesCorpus.en).toHaveLength(122);
      expect(riddlesCorpus.es).toHaveLength(122);
      expect(riddlesCorpus.en[0]).toMatchObject({
        question: expect.any(String),
        answer: expect.any(String),
        difficulty: expect.stringMatching(/^(easy|medium|hard)$/),
      });
    });

    it("word-search pools: non-empty for every difficulty", () => {
      expect(getWordSearchPool("easy").length).toBeGreaterThan(0);
      expect(getWordSearchPool("medium").length).toBeGreaterThan(0);
      expect(getWordSearchPool("hard").length).toBeGreaterThan(0);
    });
  });

  describe("deterministic seeded selection (research D7)", () => {
    it("hashSeed is a pure function: same input -> same output, always", () => {
      const a = hashSeed("2026-09-08|joke");
      const b = hashSeed("2026-09-08|joke");
      expect(a).toBe(b);
    });

    /** v1-verified golden vectors (batch-B): self-consistency checks alone can't
     * detect algorithm drift from v1 (e.g. a mulberry32 constant or the SHA-1 offset changing
     * while staying internally consistent) — these pin the EXACT v1 output for fixed inputs, so
     * such drift fails loudly instead of surviving.
     */
    it("hashSeed matches v1's exact SHA-1-derived output for known inputs", () => {
      expect(hashSeed("2026-09-08|joke")).toBe(68940901);
      expect(hashSeed("2026-09-08")).toBe(2022378160);
    });

    it("fisherYates matches v1's exact mulberry32-driven permutation for a known seed", () => {
      expect(fisherYates(["a", "b", "c", "d", "e"], hashSeed("2026-09-08"))).toEqual([
        "d",
        "e",
        "b",
        "c",
        "a",
      ]);
    });

    it("the SAME seed selects the SAME corpus entry twice", () => {
      const seed = hashSeed("2026-09-08|joke");
      const idxA = seed % dadJokesCorpus.en.length;
      const idxB = hashSeed("2026-09-08|joke") % dadJokesCorpus.en.length;
      expect(idxA).toBe(idxB);
      expect(dadJokesCorpus.en[idxA]).toBe(dadJokesCorpus.en[idxB]);
    });

    it("a DIFFERENT date generally selects a different entry", () => {
      const idxDay1 = hashSeed("2026-09-08|joke") % dadJokesCorpus.en.length;
      const idxDay2 = hashSeed("2026-09-09|joke") % dadJokesCorpus.en.length;
      // Not a mathematical guarantee (a hash collision on the modulus is possible), but a
      // 588-entry pool makes an accidental collision on ANY two adjacent-day probes vanishingly
      // unlikely — if this ever flakes, the recipe (not the test) is the first suspect.
      expect(idxDay1).not.toBe(idxDay2);
    });

    it("fisherYates is deterministic for a fixed seed and is an actual permutation", () => {
      const items = ["a", "b", "c", "d", "e"];
      const seed = hashSeed("2026-09-08");
      const shuffledA = fisherYates(items, seed);
      const shuffledB = fisherYates(items, seed);
      expect(shuffledA).toEqual(shuffledB);
      expect([...shuffledA].sort()).toEqual([...items].sort());
    });

    it("withSeededMathRandom confines the patch: Math.random is restored after, even on throw", () => {
      const original = Math.random;
      const seenInside: number[] = [];
      withSeededMathRandom(hashSeed("seed-a"), () => {
        seenInside.push(Math.random());
      });
      expect(Math.random).toBe(original);

      expect(() =>
        withSeededMathRandom(hashSeed("seed-b"), () => {
          throw new Error("boom");
        })
      ).toThrow("boom");
      expect(Math.random).toBe(original);
    });

    it("withSeededMathRandom is itself deterministic for a fixed seed", () => {
      const draw = (seed: number) => withSeededMathRandom(seed, () => Math.random());
      const seed = hashSeed("2026-09-08|member-1|wordSearch|easy|placement");
      expect(draw(seed)).toBe(draw(seed));
    });
  });

  describe("ES-variant resolution (INV-06, the translated corpora)", () => {
    it.each([
      ["animalFact", animalFactsCorpus] as const,
      ["numberFact", numberFactsCorpus] as const,
      ["drawingPrompt", drawingPromptsCorpus] as const,
      ["wouldYouRather", wouldYouRathersCorpus] as const,
      ["riddle", riddlesCorpus] as const,
      ["dadJoke", dadJokesCorpus] as const,
    ])("%s: en and es siblings both resolve and are structurally aligned", (_type, corpus) => {
      expect(corpus.en.length).toBeGreaterThan(0);
      expect(corpus.es.length).toBe(corpus.en.length);
      // Same index in each language variant addresses the "same slot" (a fixed seed picks the
      // same index regardless of which language variant is loaded at generation time).
      expect(typeof corpus.en[0]).toBe(typeof corpus.es[0]);
    });
  });

  /** The Spanish riddles are written in one pass and corrected as they show up on paper, so
   * the rules a reader cannot be asked to check by eye on 122 entries are checked here. */
  describe("Spanish riddles (FR-034)", () => {
    const es = riddlesCorpus.es;
    const texts = es.flatMap((entry) => [entry.question, entry.answer]);
    const normalized = (text: string) => text.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
    // Two answers are the same answer when they differ only in accents, punctuation or the
    // leading article ("Un reloj." and "El reloj."); the tilde of ñ is kept.
    const answerKey = (text: string) =>
      normalized(text)
        .normalize("NFD")
        .replace(/[\u0301\u0308]/g, "")
        .normalize("NFC")
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .replace(/^(el|la|los|las|un|una|unos|unas|tu|su) /, "");
    // Words of ASCII plus the Spanish letters and marks, one space apart: a reviewed subset of
    // what JetBrains Mono draws.
    const WORD = "[\\x21-\\x7EáéíóúüñÁÉÍÓÚÜÑ¿¡«»]+";
    const PRINTABLE = new RegExp(`^${WORD}( ${WORD})*$`);

    it("every entry has exactly a question, an answer and its English slot's difficulty", () => {
      es.forEach((entry, index) => {
        expect(Object.keys(entry).sort(), `entry ${index}`).toEqual([
          "answer",
          "difficulty",
          "question",
        ]);
        expect(entry.difficulty, `entry ${index}`).toBe(riddlesCorpus.en[index].difficulty);
      });
    });

    it("uses only the reviewed character set, a subset of what the receipt font draws, with no stray spacing", () => {
      for (const text of texts) {
        expect(text).toMatch(PRINTABLE);
      }
    });

    it("pairs every question mark, exclamation mark and quote, with no space inside", () => {
      for (const text of texts) {
        const unpaired = text.replace(/¿[^¿?]*\?/g, "").replace(/¡[^¡!]*!/g, "");
        expect(unpaired, text).not.toMatch(/[¿?¡!]/);
        expect(text.split("«").length, text).toBe(text.split("»").length);
        expect(text).not.toMatch(/ [?!.,;:»]|[¿¡«] /);
      }
    });

    it("ends each riddle as a sentence and keeps it short enough for the slip", () => {
      for (const entry of es) {
        expect(entry.question).toMatch(/[?.]$/);
        expect(entry.answer).toMatch(/\.$/);
        expect(entry.question.length, entry.question).toBeLessThanOrEqual(160);
        expect(entry.answer.length, entry.answer).toBeLessThanOrEqual(60);
      }
    });

    it("repeats no question and no answer", () => {
      const questions = es.map((entry) => normalized(entry.question));
      const answers = es.map((entry) => answerKey(entry.answer));
      expect(new Set(questions).size).toBe(questions.length);
      expect(new Set(answers).size).toBe(answers.length);
    });

    it("leaves no English riddle untranslated", () => {
      const english = new Set(
        riddlesCorpus.en.flatMap((entry) => [normalized(entry.question), normalized(entry.answer)])
      );
      for (const text of texts) {
        expect(english.has(normalized(text)), text).toBe(false);
        expect(text).not.toMatch(/\b(what|who|the|you|am i|is it)\b/i);
      }
      for (const entry of es) {
        expect(entry.answer).not.toMatch(/^(an?|the|your) [a-z]/i);
      }
    });
  });

  /** The Spanish jokes are written for the household, not translated, so these checks stand in
   * for a reader's eye on 588 entries: the slip's font, paired marks, length and repeats. */
  describe("Spanish jokes (FR-035)", () => {
    const es = dadJokesCorpus.es.map((entry) => entry.text);
    const normalized = (text: string) =>
      text
        .toLocaleLowerCase("es")
        .normalize("NFD")
        .replace(/[\u0301\u0308]/g, "")
        .normalize("NFC")
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
    // Words of ASCII plus the Spanish letters and marks, one space apart: a reviewed subset of
    // what JetBrains Mono draws.
    const WORD = "[\\x21-\\x7EáéíóúüñÁÉÍÓÚÜÑ¿¡«»]+";
    const PRINTABLE = new RegExp(`^${WORD}( ${WORD})*$`);

    it("every entry has exactly a text", () => {
      dadJokesCorpus.es.forEach((entry, index) => {
        expect(Object.keys(entry), `entry ${index}`).toEqual(["text"]);
      });
    });

    it("uses only the reviewed character set, a subset of what the receipt font draws, with no stray spacing", () => {
      for (const text of es) {
        expect(text).toMatch(PRINTABLE);
      }
    });

    it("pairs every question mark, exclamation mark and quote, with no space inside", () => {
      for (const text of es) {
        const unpaired = text.replace(/¿[^¿?]*\?/g, "").replace(/¡[^¡!]*!/g, "");
        expect(unpaired, text).not.toMatch(/[¿?¡!]/);
        expect(text.split("«").length, text).toBe(text.split("»").length);
        expect(text.split('"').length % 2, text).toBe(1);
        expect(text).not.toMatch(/ [?!.,;:»]|[¿¡«] /);
      }
    });

    it("ends each joke as a sentence and keeps it short enough for the slip", () => {
      for (const text of es) {
        expect(text).toMatch(/[.?!»]$/);
        expect(text.length, text).toBeLessThanOrEqual(200);
      }
    });

    it("repeats no joke and leaves no English one", () => {
      const keys = es.map(normalized);
      expect(new Set(keys).size).toBe(keys.length);
      const english = new Set(dadJokesCorpus.en.map((entry) => normalized(entry.text)));
      for (const text of es) {
        expect(english.has(normalized(text)), text).toBe(false);
        expect(text).not.toMatch(/\b(what|why|who|the|you)\b/i);
      }
    });
  });

  /** The quote of the day reads this corpus only in a Spanish household (FR-036): one entry per
   * day of the year, a proverb or a quote whose author is on record. */
  describe("Spanish quotes (FR-036)", () => {
    const WORD = "[\\x21-\\x7EáéíóúüñÁÉÍÓÚÜÑ¿¡«»]+";
    const PRINTABLE = new RegExp(`^${WORD}( ${WORD})*$`);
    const key = (text: string) =>
      text
        .toLocaleLowerCase("es")
        .normalize("NFD")
        .replace(/[\u0301\u0308]/g, "")
        .normalize("NFC")
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    it("holds one entry per day of a leap year, each exactly a text and an author", () => {
      expect(quotesEsCorpus).toHaveLength(366);
      quotesEsCorpus.forEach((entry, index) => {
        expect(Object.keys(entry).sort(), `entry ${index}`).toEqual(["author", "text"]);
      });
    });

    it("uses only the reviewed character set, pairs its marks and ends each text as a sentence", () => {
      for (const { text, author } of quotesEsCorpus) {
        expect(text).toMatch(PRINTABLE);
        expect(author).toMatch(PRINTABLE);
        const unpaired = text.replace(/¿[^¿?]*\?/g, "").replace(/¡[^¡!]*!/g, "");
        expect(unpaired, text).not.toMatch(/[¿?¡!]/);
        expect(text).not.toMatch(/ [?!.,;:»]|[¿¡«] /);
        expect(text).toMatch(/[.?!]$/);
        expect(text.length, text).toBeLessThanOrEqual(200);
        expect(author.length, author).toBeLessThanOrEqual(60);
      }
    });

    it("repeats no text and mixes proverbs with attributed quotes", () => {
      const keys = quotesEsCorpus.map((entry) => key(entry.text));
      expect(new Set(keys).size).toBe(keys.length);
      const proverbs = quotesEsCorpus.filter((entry) => entry.author === "Refrán").length;
      expect(proverbs).toBeGreaterThan(0);
      expect(proverbs).toBeLessThan(quotesEsCorpus.length);
    });
  });

  describe("corpus-availability map (FR-008/FR-009)", () => {
    it("jokes ship in English and Spanish (FR-035)", () => {
      expect(corpusLanguagesFor("dadJoke")).toEqual(["en", "es"]);
    });

    it("riddles ship in English and Spanish (FR-034)", () => {
      expect(corpusLanguagesFor("riddle")).toEqual(["en", "es"]);
    });

    it("trivia and wordOfDay (vocabulary) are EN-only", () => {
      expect(isCorpusLanguageAvailable("trivia", "es")).toBe(false);
      expect(isCorpusLanguageAvailable("wordOfDay", "es")).toBe(false);
    });

    it("the translated corpora accept both en and es", () => {
      for (const type of [
        "animalFact",
        "numberFact",
        "drawingPrompt",
        "wouldYouRather",
        "riddle",
        "dadJoke",
      ] as const) {
        expect(isCorpusLanguageAvailable(type, "en")).toBe(true);
        expect(isCorpusLanguageAvailable(type, "es")).toBe(true);
      }
    });

    /** (batch-B): table-drive the FULL corpus-backed-type x language matrix against a
     * hardcoded expected table (not derived from `corpusLanguagesFor`, which would make this
     * tautological) — a per-cell mutation of `CORPUS_LANGUAGE_AVAILABILITY` (e.g. trivia
     * silently gaining `es`) fails exactly the one affected cell instead of surviving the
     * looser spot-checks below.
     */
    const EXPECTED_CORPUS_AVAILABILITY: Record<
      (typeof CORPUS_BLOCK_TYPES)[number],
      { en: boolean; es: boolean }
    > = {
      dadJoke: { en: true, es: true },
      wordOfDay: { en: true, es: false },
      animalFact: { en: true, es: true },
      numberFact: { en: true, es: true },
      trivia: { en: true, es: false },
      riddle: { en: true, es: true },
      phonics: { en: true, es: false },
      wouldYouRather: { en: true, es: true },
      wordSearch: { en: true, es: false },
      drawingPrompt: { en: true, es: true },
    };

    it.each(
      Object.entries(EXPECTED_CORPUS_AVAILABILITY).flatMap(([type, { en, es }]) => [
        [type, "en", en] as const,
        [type, "es", es] as const,
      ])
    )("%s + %s -> available:%s", (type, language, expected) => {
      expect(isCorpusLanguageAvailable(type, language)).toBe(expected);
    });

    it("a non-corpus block type (e.g. message) never accepts a language override (FR-008)", () => {
      expect(isCorpusBackedBlockType("message")).toBe(false);
      expect(isCorpusLanguageAvailable("message", "en")).toBe(false);
      expect(isCorpusLanguageAvailable("message", "es")).toBe(false);
    });

    it("an unknown block type never accepts a language override", () => {
      expect(isCorpusLanguageAvailable("not-a-real-type", "en")).toBe(false);
    });

    it("every CORPUS_BLOCK_TYPE is a known block type", () => {
      for (const type of CORPUS_BLOCK_TYPES) {
        expect(isKnownBlockType(type)).toBe(true);
      }
    });

    it("isKnownBlockType recognizes all 21 registry types and rejects garbage", () => {
      expect(isKnownBlockType("shotgun")).toBe(true);
      expect(isKnownBlockType("streakText")).toBe(true);
      expect(isKnownBlockType("weatherText")).toBe(true);
      expect(isKnownBlockType("onThisDay")).toBe(true);
      expect(isKnownBlockType("not-a-real-type")).toBe(false);
      expect(isKnownBlockType(42)).toBe(false);
    });
  });
});
