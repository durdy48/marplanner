/** englishWord block (FR-040): one English word a day for a Spanish-speaking child, with its
 * Spanish translation and an example in both languages. Keyed by month and day like the
 * saints, so a seasonal word keeps its date and none repeats within a year; shared by the
 * household. Not a corpus block:
 * its content is always an English word explained in Spanish, so there is no language to
 * choose, and a household whose language is not Spanish gets no block.
 */
import { englishWordsCorpus } from "../corpora";
import { calendarDayIndex } from "./saint-of-day";

export interface EnglishWordData {
  word: string;
  type: string;
  translation: string;
  example: string;
  exampleEs: string;
}

export const englishWordBlock = {
  type: "englishWord" as const,
  scope: "shared" as const,
  generate(ctx: { date: string; language: string }): EnglishWordData | null {
    if (ctx.language !== "es") return null;
    const entry = englishWordsCorpus[calendarDayIndex(ctx.date)];
    return {
      word: entry.word,
      type: entry.type,
      translation: entry.translation,
      example: entry.example,
      exampleEs: entry.exampleEs,
    };
  },
};
