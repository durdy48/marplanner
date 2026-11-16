import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Slot } from "../../shared";
import { lookupApiKey, readDeviceCookie } from "../auth/boundary";
import { authenticationBackoff, sendAuthenticationBackoff } from "../auth/throttle";
import { readHouseholdTimezone, todayInHouseholdTz } from "../lib/household-date";
import { getEvents } from "../modules/calendar";
import { listOptIns, readBriefingPng } from "../modules/daily-briefing";
import { getMenu } from "../modules/meals";
import { listMembers } from "../modules/members";
import { getBoard } from "../modules/routines";
import { readEffectiveSettings } from "../modules/settings";
import type { PluginLifecycle } from "../plugins/lifecycle";
import {
  renderLiteSetup,
  renderLiteToday,
  type LiteBriefing,
  type LiteLanguage,
  type LiteToday,
} from "../lite/page";

export const LITE_PATH = "/lite";

const SLOTS: Slot[] = ["breakfast", "lunch", "snack", "dinner"];

function householdLanguage(): LiteLanguage {
  return readEffectiveSettings().locale.language === "es" ? "es" : "en";
}

/** Gathers today's household view. Read-only: it never generates a briefing or writes a row. */
export function gatherLiteToday(lifecycle: PluginLifecycle, now: number): LiteToday {
  const language = householdLanguage();
  const locale = language === "es" ? "es-ES" : "en-GB";
  const timeZone = readHouseholdTimezone();
  const date = todayInHouseholdTz(now);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateLabel = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const members = listMembers();
  const names = new Map(members.map((member) => [member.id, member.displayName]));

  const events = getEvents({ source: "all", range: { from: date, to: date } })
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return Date.parse(a.occurrenceStart) - Date.parse(b.occurrenceStart);
    })
    .map((item) => ({
      time: item.allDay ? null : time.format(Date.parse(item.occurrenceStart)),
      title: item.decoratedTitle ?? item.title,
      who: item.assignedTo.flatMap((id) => names.get(id) ?? []),
    }));

  let meals: LiteToday["meals"] = null;
  if (lifecycle.isActive("meals-recipes")) {
    const menu = getMenu(date, undefined);
    meals = SLOTS.map((slot) => ({
      slot,
      labels: menu.filter((item) => item.slot === slot).map((item) => item.label),
    })).filter((meal) => meal.labels.length > 0);
  }

  const chores = getBoard(date).map((column) => ({
    name: column.displayName,
    progress: column.todayProgress,
    periods: column.dayPeriods.map((period) => ({
      id: period.id,
      chores: period.chores.map((chore) => ({
        name: chore.name,
        icon: chore.icon,
        completed: chore.completed,
      })),
    })),
  }));

  let briefings: LiteBriefing[] | null = null;
  if (lifecycle.isActive("daily-briefing")) {
    const optedIn = new Set(
      listOptIns()
        .filter((optIn) => optIn.enabled)
        .map((optIn) => optIn.memberId)
    );
    briefings = members
      .filter((member) => optedIn.has(member.id))
      .map((member) => {
        const stored = readBriefingPng(member.id, date);
        return {
          memberId: member.id,
          name: member.displayName,
          png: stored.png ? stored.png.toString("base64") : null,
          generating: stored.generating,
        };
      });
  }

  return {
    language,
    dateLabel: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
    updatedAt: time.format(now),
    events,
    meals,
    chores,
    briefings,
  };
}

/** `GET /lite`: today's view for an old browser. Outside `/api`, so the access gate guards it;
 * the data needs a device key too, checked here against the same records as the API boundary.
 * Without a valid one the page offers the one-time setup instead. */
export async function liteRoutes(
  app: FastifyInstance,
  basePath: string,
  lifecycle: PluginLifecycle
): Promise<void> {
  const backoff = authenticationBackoff(app);
  const sendHtml = (reply: FastifyReply, html: string) =>
    reply
      .header("content-type", "text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(html);
  app.get(LITE_PATH, async (request: FastifyRequest, reply: FastifyReply) => {
    const rawKey = readDeviceCookie(request.headers.cookie);
    if (!rawKey) return sendHtml(reply, renderLiteSetup(householdLanguage(), basePath));
    const key = await lookupApiKey(rawKey);
    if (key.status !== "active") {
      const seconds = backoff.failure("api", request.ip);
      if (seconds) return sendAuthenticationBackoff(reply, seconds);
      return sendHtml(reply, renderLiteSetup(householdLanguage(), basePath, { lost: true }));
    }
    return sendHtml(reply, renderLiteToday(gatherLiteToday(lifecycle, Date.now())));
  });
}
