import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  addCalendarDays,
  dateTimeLocalToUtcInstant,
  displayTitle,
  formatInstantAsDateTimeLocal,
} from "@/calendar/calendar-presentation";
import { ChoicePills } from "@/components/ChoicePills";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n";
import type { MessageKey } from "@/i18n/messages";
import { authFetch } from "@/lib/credential";
import { todayInHouseholdTimezone } from "@/lib/household-date";
import { useHouseholdSettings } from "@/lib/householdSettings";
import { usePluginActive } from "@/plugins/contributions";
import { MemberPills } from "@/ui";
import type {
  DailyMessage,
  DailyMessageUpsert,
  EventInput,
  FeedItem,
  Member,
  MenuItem,
  Slot,
} from "../../shared";

type Kind = "meal" | "event" | "note";

const SLOTS: readonly Slot[] = ["breakfast", "lunch", "snack", "dinner"];
const EVENT_MINUTES = 60;

const KIND_LABEL: Record<Kind, MessageKey> = {
  meal: "quickChanges.kind.meal",
  event: "quickChanges.kind.event",
  note: "quickChanges.kind.note",
};

interface DayPlan {
  menu: MenuItem[];
  /** Weekly-plan meals left out of this day only. */
  skipped: MenuItem[];
  events: FeedItem[];
  notes: DailyMessage[];
}

async function readJson<T>(path: string): Promise<T> {
  const response = await authFetch(path, { credentials: "include" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function send(path: string, method: string, body?: unknown): Promise<Response> {
  const response = await authFetch(path, {
    method,
    credentials: "include",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return response;
}

/** Small changes for one day, from a phone: a one-off meal (instead of, or as well as, what the
 * weekly plan has in that slot), an appointment, or a note on a child's briefing, with what that
 * day already holds underneath. Weekly-plan meals can be left out of that day only and put back.
 * Everything goes through the same endpoints as the full admin pages. */
export function QuickChanges() {
  const { language, t } = useTranslation();
  const { timezone } = useHouseholdSettings();
  const mealsActive = usePluginActive("meals-recipes");
  const notesActive = usePluginActive("daily-messages");
  const locale = language === "es" ? "es-ES" : "en-GB";

  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<Kind>("event");
  const [members, setMembers] = useState<Member[]>([]);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [slot, setSlot] = useState<Slot>("lunch");
  const [mealText, setMealText] = useState("");
  const [replacePlanned, setReplacePlanned] = useState(true);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [eventMembers, setEventMembers] = useState<string[]>([]);
  const [noteMember, setNoteMember] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const kinds: Kind[] = [
    ...(mealsActive ? (["meal"] as const) : []),
    "event",
    ...(notesActive ? (["note"] as const) : []),
  ];

  useEffect(() => {
    if (!timezone) return;
    const now = todayInHouseholdTimezone(timezone);
    setToday(now);
    setDate((current) => current || addCalendarDays(now, 1));
  }, [timezone]);

  useEffect(() => {
    let cancelled = false;
    readJson<Member[]>("/api/members")
      .then((all) => {
        if (!cancelled) setMembers(all.filter((member) => member.lifecycle === "active"));
      })
      .catch(() => {
        if (!cancelled) setError(t("quickChanges.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!timezone || !date) return;
    let cancelled = false;
    setPlan(null);
    const range = new URLSearchParams({
      source: "all",
      from: dateTimeLocalToUtcInstant(`${date}T00:00`, timezone),
      to: dateTimeLocalToUtcInstant(`${addCalendarDays(date, 1)}T00:00`, timezone),
    });
    void (async () => {
      try {
        const [menu, skipped, events, notes] = await Promise.all([
          mealsActive ? readJson<MenuItem[]>(`/api/menu?date=${date}`) : [],
          mealsActive ? readJson<MenuItem[]>(`/api/menu/skipped?date=${date}`) : [],
          readJson<FeedItem[]>(`/api/calendar/events?${range.toString()}`),
          notesActive
            ? Promise.all(
                members.map((member) =>
                  readJson<DailyMessage[]>(
                    `/api/daily-messages?${new URLSearchParams({ memberId: member.id, from: date, days: "1" }).toString()}`
                  )
                )
              ).then((lists) => lists.flat())
            : [],
        ]);
        if (cancelled) return;
        setPlan({
          // All-day first, then by start; meals in the order of the day.
          events: [...events].sort(
            (a, b) =>
              Number(b.allDay) - Number(a.allDay) ||
              Date.parse(a.occurrenceStart) - Date.parse(b.occurrenceStart)
          ),
          menu: [...menu].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
          skipped,
          notes,
        });
      } catch {
        if (!cancelled) setError(t("quickChanges.loadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timezone, date, members, mealsActive, notesActive, reloadKey, t]);

  const dayLabel = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`)),
    [locale]
  );

  async function run(action: () => Promise<unknown>, done: () => void) {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await action();
      done();
      setSaved(t("quickChanges.saved"));
      setReloadKey((key) => key + 1);
    } catch {
      setError(t("quickChanges.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!timezone || !date || saving) return;
    if (kind === "meal") {
      const note = mealText.trim();
      if (!note) return;
      const replaced = replacePlanned ? plannedInSlot : [];
      void run(
        async () => {
          await send("/api/meal-entries", "POST", { kind: "oneoff", date, slot, note });
          for (const item of replaced) {
            await send(`/api/meal-entries/${item.entryId}/skips/${date}`, "PUT");
          }
        },
        () => setMealText("")
      );
    } else if (kind === "event") {
      const name = title.trim();
      if (!name) return;
      void run(
        async () => {
          let input: EventInput;
          if (time) {
            const startUtc = dateTimeLocalToUtcInstant(`${date}T${time}`, timezone);
            const endUtc = new Date(Date.parse(startUtc) + EVENT_MINUTES * 60_000).toISOString();
            input = { title: name, allDay: false, startUtc, endUtc, tzid: timezone };
          } else {
            input = {
              title: name,
              allDay: true,
              startDate: date,
              endDate: addCalendarDays(date, 1),
            };
          }
          const created = await send("/api/calendar/events", "POST", input);
          if (eventMembers.length > 0) {
            const { id } = (await created.json()) as { id: string };
            await send(`/api/calendar/events/${id}/assignments`, "PUT", {
              memberIds: eventMembers,
            });
          }
        },
        () => {
          setTitle("");
          setTime("");
          setEventMembers([]);
        }
      );
    } else {
      const text = noteText.trim();
      if (!text || !noteMember) return;
      const input: DailyMessageUpsert = { memberId: noteMember, date, text };
      void run(
        () => send("/api/daily-messages", "PUT", input),
        () => setNoteText("")
      );
    }
  }

  const memberName = (id: string) => members.find((member) => member.id === id)?.displayName ?? id;
  const eventTime = (event: FeedItem) =>
    event.allDay || !timezone
      ? t("quickChanges.allDay")
      : formatInstantAsDateTimeLocal(event.occurrenceStart, timezone).slice(11);
  const existingNote = plan?.notes.find((note) => note.memberId === noteMember);
  // Weekly-plan meals in the chosen slot, which a new meal can stand in for that day.
  const plannedInSlot =
    plan?.menu.filter((item) => item.slot === slot && item.source === "recurring") ?? [];
  const meals = plan
    ? [
        ...plan.menu.map((item) => ({ item, skipped: false })),
        ...plan.skipped.map((item) => ({ item, skipped: true })),
      ].sort((a, b) => SLOTS.indexOf(a.item.slot) - SLOTS.indexOf(b.item.slot))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5" data-testid="quick-changes">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("quickChanges.title")}</h1>
        <p className="text-muted-foreground">{t("quickChanges.description")}</p>
      </div>

      <section className="flex flex-col gap-2">
        <ChoicePills
          groupLabel={t("quickChanges.day")}
          value={date === today ? "today" : date === addCalendarDays(today, 1) ? "tomorrow" : null}
          onChange={(value) => {
            setSaved(null);
            setDate(value === "today" ? today : addCalendarDays(today, 1));
          }}
          options={[
            { value: "today", label: t("quickChanges.today"), "data-testid": "quick-day-today" },
            {
              value: "tomorrow",
              label: t("quickChanges.tomorrow"),
              "data-testid": "quick-day-tomorrow",
            },
          ]}
        />
        <Field label={t("quickChanges.day")}>
          <Input
            type="date"
            value={date}
            min={today}
            onChange={(event) => {
              setSaved(null);
              if (event.target.value) setDate(event.target.value);
            }}
            data-testid="quick-day-date"
          />
        </Field>
      </section>

      <form
        className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-sm"
        onSubmit={submit}
      >
        <ChoicePills
          groupLabel={t("quickChanges.kind")}
          value={kind}
          onChange={(value) => {
            setSaved(null);
            setKind(value);
          }}
          options={kinds.map((value) => ({
            value,
            label: t(KIND_LABEL[value]),
            "data-testid": `quick-kind-${value}`,
          }))}
        />

        {kind === "meal" && (
          <>
            <ChoicePills
              groupLabel={t("quickChanges.meal.slot")}
              value={slot}
              onChange={setSlot}
              options={SLOTS.map((value) => ({
                value,
                label: t(`meals.slot.${value}`),
                "data-testid": `quick-slot-${value}`,
              }))}
            />
            <Field label={t("quickChanges.meal.what")}>
              <Input
                value={mealText}
                onChange={(event) => setMealText(event.target.value)}
                placeholder={t("quickChanges.meal.placeholder")}
                data-testid="quick-meal-text"
              />
            </Field>
            {plannedInSlot.length > 0 && (
              <ChoicePills
                groupLabel={t("quickChanges.meal.planned")}
                value={replacePlanned ? "replace" : "alongside"}
                onChange={(value) => setReplacePlanned(value === "replace")}
                options={[
                  {
                    value: "replace",
                    label: t("quickChanges.meal.replace").replace(
                      "{labels}",
                      plannedInSlot.map((item) => item.label).join(", ")
                    ),
                    "data-testid": "quick-meal-replace",
                  },
                  {
                    value: "alongside",
                    label: t("quickChanges.meal.alongside"),
                    "data-testid": "quick-meal-alongside",
                  },
                ]}
              />
            )}
          </>
        )}

        {kind === "event" && (
          <>
            <Field label={t("quickChanges.event.title")}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("quickChanges.event.placeholder")}
                data-testid="quick-event-title"
              />
            </Field>
            <Field label={t("quickChanges.event.time")} hint={t("quickChanges.event.timeHint")}>
              <Input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                data-testid="quick-event-time"
              />
            </Field>
            <p className="text-control font-semibold">{t("quickChanges.event.who")}</p>
            <MemberPills
              groupLabel={t("quickChanges.event.who")}
              members={members}
              value={eventMembers}
              onChange={setEventMembers}
              testIdPrefix="quick-event-member"
            />
          </>
        )}

        {kind === "note" && (
          <>
            <p className="text-control font-semibold">{t("quickChanges.note.who")}</p>
            <MemberPills
              mode="single"
              groupLabel={t("quickChanges.note.who")}
              members={members}
              value={noteMember}
              onChange={setNoteMember}
              testIdPrefix="quick-note-member"
            />
            <Field
              label={t("quickChanges.note.text")}
              hint={existingNote ? t("quickChanges.note.replaces") : t("quickChanges.note.hint")}
            >
              <Textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder={t("quickChanges.note.placeholder")}
                maxLength={500}
                data-testid="quick-note-text"
              />
            </Field>
          </>
        )}

        <Button type="submit" size="lg" disabled={saving || !date} data-testid="quick-save">
          {saving ? t("quickChanges.saving") : t("quickChanges.save")}
        </Button>
        {saved && (
          <p role="status" className="text-success font-semibold" data-testid="quick-saved">
            {saved}
          </p>
        )}
        <ErrorNotice message={error} />
      </form>

      {date && (
        <section className="flex flex-col gap-3" data-testid="quick-plan">
          <h2 className="text-lg font-semibold">
            {t("quickChanges.planned").replace("{day}", dayLabel(date))}
          </h2>
          {!plan ? (
            <p className="text-muted-foreground">…</p>
          ) : meals.length + plan.events.length + plan.notes.length === 0 ? (
            <p className="text-muted-foreground">{t("quickChanges.nothing")}</p>
          ) : (
            <ul className="bg-card divide-border m-0 list-none divide-y rounded-2xl border p-0 shadow-sm">
              {plan.events.map((event) => (
                <li key={`${event.id}-${event.occurrenceStart}`} className="px-4 py-3">
                  <span className="font-semibold">{eventTime(event)}</span> {displayTitle(event)}
                  {event.assignedTo.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {event.assignedTo.map(memberName).join(", ")}
                    </span>
                  )}
                </li>
              ))}
              {meals.map(({ item, skipped }) => (
                <li key={item.entryId} className="flex items-center gap-2 px-4 py-3">
                  <span className={skipped ? "text-muted-foreground flex-1" : "flex-1"}>
                    <span className="font-semibold">{t(`meals.slot.${item.slot}`)}</span>{" "}
                    <span className={skipped ? "line-through" : undefined}>{item.label}</span>
                    {skipped && <> · {t("quickChanges.skipped")}</>}
                  </span>
                  {item.source === "oneoff" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("quickChanges.remove")}
                      disabled={saving}
                      data-testid={`quick-remove-meal-${item.entryId}`}
                      onClick={() =>
                        void run(
                          () => send(`/api/meal-entries/${item.entryId}`, "DELETE"),
                          () => undefined
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t(skipped ? "quickChanges.restore" : "quickChanges.skip")}
                      disabled={saving}
                      data-testid={`quick-${skipped ? "restore" : "skip"}-meal-${item.entryId}`}
                      onClick={() =>
                        void run(
                          () =>
                            send(
                              `/api/meal-entries/${item.entryId}/skips/${date}`,
                              skipped ? "DELETE" : "PUT"
                            ),
                          () => undefined
                        )
                      }
                    >
                      {skipped ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                    </Button>
                  )}
                </li>
              ))}
              {plan.notes.map((note) => (
                <li key={note.memberId} className="flex items-center gap-2 px-4 py-3">
                  <span className="flex-1">
                    <span className="font-semibold">
                      {t("quickChanges.noteFor").replace("{name}", memberName(note.memberId))}
                    </span>{" "}
                    {note.text}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("quickChanges.remove")}
                    disabled={saving}
                    data-testid={`quick-remove-note-${note.memberId}`}
                    onClick={() =>
                      void run(
                        () =>
                          send(
                            `/api/daily-messages?${new URLSearchParams({ memberId: note.memberId, date }).toString()}`,
                            "DELETE"
                          ),
                        () => undefined
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
