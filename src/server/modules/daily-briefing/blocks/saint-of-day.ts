/** saintOfDay block (FR-041): the day's saints as a Spanish wall calendar prints them, plus
 * the day's solemnity when there is one. Keyed by month and day (29 February included), shared
 * by the household, and omitted when the household language is not Spanish.
 */
import { saintsEsCorpus } from "../corpora";
import { dayOfYear } from "./number-fact";

/** The entry for a date's month and day in a leap-year calendar (0 = 1 January, 59 = 29
 * February, 365 = 31 December), so a date maps to the same entry in every year. */
export function calendarDayIndex(date: string): number {
  return dayOfYear(`2024${date.slice(4)}`) - 1;
}

export interface SaintOfDayData {
  feast?: string;
  saints: string[];
}

export const saintOfDayBlock = {
  type: "saintOfDay" as const,
  scope: "shared" as const,
  generate(ctx: { date: string; language: string }): SaintOfDayData | null {
    if (ctx.language !== "es") return null;
    const entry = saintsEsCorpus[calendarDayIndex(ctx.date)];
    const data: SaintOfDayData = { saints: [...entry.saints] };
    if (entry.feast) data.feast = entry.feast;
    return data;
  },
};
