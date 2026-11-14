/** "choreList" domain block: the member's chores for the date, grouped by day period, so a
 * printed briefing can be ticked off on paper.
 * Seam: `getBoard(date)` (`src/server/modules/routines`, host-api-barrel-exported — the same read
 * `./streak.ts` uses). `getBoard` composes each active child's periods and chores for ANY date,
 * so this block works for a regenerated past date too.
 * `completed` is a snapshot of the moment of generation: at the scheduled morning pass every
 * chore is still open; a regeneration later in the day prints what is already done as ticked.
 * The period's label is structural copy and is not stored: the render resolves it from the
 * period id in the household language (DAILY-BRIEFING-INV-06).
 */
import { getBoard } from "../../../host-api";
import type { PeriodId } from "../../../../shared";

const TYPE = "choreList";

export interface ChoreListBlockContext {
  memberId: string;
  date: string;
}

export interface ChoreListBlockData {
  periods: { id: PeriodId; chores: { name: string; completed: boolean }[] }[];
}

export const choreListBlock = {
  type: TYPE,
  scope: "member" as const,
  source: "src/server/modules/routines getBoard (host-api-barrel-exported)",
  generate(ctx: ChoreListBlockContext): ChoreListBlockData | null {
    const column = getBoard(ctx.date).find((c) => c.memberId === ctx.memberId);
    if (!column) return null; // not an active child tracked by routines at all

    const periods = column.dayPeriods
      .filter((period) => period.chores.length > 0)
      .map((period) => ({
        id: period.id,
        chores: period.chores.map((chore) => ({ name: chore.name, completed: chore.completed })),
      }));
    return periods.length === 0 ? null : { periods };
  },
};
