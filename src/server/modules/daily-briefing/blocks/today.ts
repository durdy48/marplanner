/** "today" domain block ("The 21 block types", FR-013). PORTED from
 * v1 `apps/api/src/lib/daily-briefing/blocks/today.ts` (today's assigned calendar events as
 * bullet strings, all-day first then by start time, capped at 10; v1 hard-truncated each bullet
 * to 36 chars, here a title wraps on paper and is only cut at 120). Beyond v1, the household's unassigned events of the day follow in their own
 * `household` list, so a "Dentist" nobody is named on still reaches the paper.
 * v2 seam: `getEvents` (`src/server/modules/calendar`, host-api-barrel-exported — the SAME
 * function 010's own `gatherBlocks` already calls for its "calendar" block). `getEvents({source:
 * "all", assignedTo: memberId, range: {from: date, to: date}})` already resolves the
 * household-timezone day window INTERNALLY (`buildExpandRange`/`wallClockToInstant` in
 * `calendar/index.ts`) — this is exactly FR-012's single-anchor rule (household timezone, never a
 * mixed UTC anchor); v1's OWN `dayBounds` (`UTC ${date}T00:00:00.000Z` +1 day) is the mixed-anchor
 * hazard FR-012 explicitly says NOT to port, and this block never reconstructs it — the day window
 * comes entirely from `getEvents`, not from a locally-computed UTC bracket.
 * v1 additionally stripped a "member: " display-name prefix from event titles
 * (`stripMemberPrefix`) — v2's `FeedItem.decoratedTitle` is a frozen passthrough of `title`
 * pending a future highlight-rules feature (`calendar/index.ts`: "decoratedTitle == title today"),
 * so there is no v2 equivalent of that stripping to port; `decoratedTitle` (falling back to
 * `title`) is used as-is (documented divergence — see also `../../../../docs/features/daily-briefing.md `
 * for the block's shape).
 */
import { getEvents, readHouseholdTimezone } from "../../../host-api";

import type { CalendarReadContext } from "../../../host-api";

const TYPE = "today";
const MAX_EVENTS = 10;
/** Cap on bullet length. The render wraps a long title over several lines, so this only keeps a
 * runaway feed title from filling the slip; the trailing ellipsis signals the cut. */
const MAX_BULLET_CHARS = 120;

export interface TodayBlockContext {
  memberId: string;
  date: string;
  txCtx?: CalendarReadContext;
}

export interface TodayBlockData {
  /** The member's own events. */
  bullets: string[];
  /** Events assigned to nobody: the whole household's. Absent when there are none (and in
   * snapshots generated before the block carried them). */
  household?: string[];
}

function stripEmojis(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/️/g, "")
    .trim();
}

function formatTimeIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export const todayBlock = {
  type: TYPE,
  scope: "member" as const,
  source:
    "src/server/modules/calendar getEvents (host-api-barrel-exported, 010 precedent) + readHouseholdTimezone",
  generate(ctx: TodayBlockContext): TodayBlockData | null {
    // One unfiltered read, split here: `assignedTo` would leave out the events that belong to
    // nobody, and another member's events are not this member's business.
    const items = getEvents({
      source: "all",
      txCtx: ctx.txCtx,
      range: { from: ctx.date, to: ctx.date },
    });
    const own = items.filter((item) => item.assignedTo.includes(ctx.memberId));
    const household = items.filter((item) => item.assignedTo.length === 0);
    if (own.length === 0 && household.length === 0) return null;

    const tz = readHouseholdTimezone();

    // All-day events first (regardless of start time), then timed events ascending by start
    // time. Each list is capped at MAX_EVENTS.
    const toBullets = (events: typeof items): string[] =>
      [...events]
        .sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return new Date(a.occurrenceStart).getTime() - new Date(b.occurrenceStart).getTime();
        })
        .slice(0, MAX_EVENTS)
        .map((item) => {
          const cleanedTitle = stripEmojis(item.decoratedTitle ?? item.title);
          const raw = item.allDay
            ? cleanedTitle
            : `${formatTimeIn(tz, new Date(item.occurrenceStart))} ${cleanedTitle}`;
          return truncate(raw, MAX_BULLET_CHARS);
        });

    const bullets = toBullets(own);
    return household.length === 0 ? { bullets } : { bullets, household: toBullets(household) };
  },
};
