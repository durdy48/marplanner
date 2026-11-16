import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickChanges } from "@/admin/QuickChanges";
import { LanguageProvider } from "@/i18n";
import { HouseholdSettingsProvider } from "@/lib/householdSettings";
import {
  Role,
  type DailyMessage,
  type FeedItem,
  type Member,
  type MenuItem,
} from "../../src/shared";

vi.mock("@/lib/household-date", () => ({
  todayInHouseholdTimezone: () => "2026-01-15",
}));

const MEMBERS: Member[] = [
  {
    id: "ana",
    displayName: "Ana",
    colorKey: "blue",
    role: Role.child,
    lifecycle: "active",
    createdAt: 0,
    updatedAt: 0,
    celebration: { preset: "confetti" },
  },
  {
    id: "old",
    displayName: "Old",
    colorKey: "red",
    role: Role.child,
    lifecycle: "archived",
    createdAt: 0,
    updatedAt: 0,
    celebration: { preset: "confetti" },
  },
];

interface Backend {
  menu?: MenuItem[];
  events?: FeedItem[];
  notes?: DailyMessage[];
  fail?: (url: string, method: string) => boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockBackend(backend: Backend = {}) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (backend.fail?.(url, method)) return json({ error: "x" }, 500);
    if (url === "/api/settings") return json({ locale: { timezone: "UTC", language: "en" } });
    if (url === "/api/members") return json(MEMBERS);
    if (url.startsWith("/api/menu")) return json(backend.menu ?? []);
    if (url.startsWith("/api/calendar/events?")) return json(backend.events ?? []);
    if (url.startsWith("/api/daily-messages?") && method === "GET") {
      const memberId = new URL(url, "http://x").searchParams.get("memberId");
      return json((backend.notes ?? []).filter((note) => note.memberId === memberId));
    }
    if (url === "/api/calendar/events" && method === "POST") return json({ id: "ev-1" }, 201);
    if (method === "DELETE") return new Response(null, { status: 204 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderPage() {
  render(
    <HouseholdSettingsProvider>
      <LanguageProvider>
        <QuickChanges />
      </LanguageProvider>
    </HouseholdSettingsProvider>
  );
}

const writes = (calls: ReturnType<typeof mockBackend>) =>
  calls.filter((call) => call.method !== "GET");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickChanges", () => {
  it("starts on tomorrow and adds a one-off meal to it", async () => {
    const calls = mockBackend();
    renderPage();

    await screen.findByText("Already planned for Friday 16 January");
    expect(screen.getByTestId("quick-day-date")).toHaveValue("2026-01-16");
    await screen.findByText("Nothing planned yet.");

    fireEvent.click(screen.getByTestId("quick-kind-meal"));
    fireEvent.click(screen.getByTestId("quick-slot-dinner"));
    fireEvent.change(screen.getByTestId("quick-meal-text"), { target: { value: " Omelette " } });
    fireEvent.click(screen.getByTestId("quick-save"));

    expect(await screen.findByTestId("quick-saved")).toHaveTextContent("Saved.");
    expect(writes(calls)).toEqual([
      {
        url: "/api/meal-entries",
        method: "POST",
        body: { kind: "oneoff", date: "2026-01-16", slot: "dinner", note: "Omelette" },
      },
    ]);
    expect(screen.getByTestId("quick-meal-text")).toHaveValue("");
  });

  it("adds a one-hour appointment for the chosen people, or an all-day one without a time", async () => {
    const calls = mockBackend();
    renderPage();
    await screen.findByText("Nothing planned yet.");

    expect(screen.queryByTestId("quick-event-member-old")).toBeNull();
    fireEvent.change(screen.getByTestId("quick-event-title"), { target: { value: "Dentist" } });
    fireEvent.change(screen.getByTestId("quick-event-time"), { target: { value: "17:30" } });
    fireEvent.click(screen.getByTestId("quick-event-member-ana"));
    fireEvent.click(screen.getByTestId("quick-save"));
    await screen.findByTestId("quick-saved");

    fireEvent.click(screen.getByTestId("quick-day-today"));
    fireEvent.change(screen.getByTestId("quick-event-title"), { target: { value: "Trip" } });
    fireEvent.click(screen.getByTestId("quick-save"));
    await waitFor(() => expect(writes(calls)).toHaveLength(3));

    expect(writes(calls)).toEqual([
      {
        url: "/api/calendar/events",
        method: "POST",
        body: {
          title: "Dentist",
          allDay: false,
          startUtc: "2026-01-16T17:30:00.000Z",
          endUtc: "2026-01-16T18:30:00.000Z",
          tzid: "UTC",
        },
      },
      { url: "/api/calendar/events/ev-1/assignments", method: "PUT", body: { memberIds: ["ana"] } },
      {
        url: "/api/calendar/events",
        method: "POST",
        body: { title: "Trip", allDay: true, startDate: "2026-01-15", endDate: "2026-01-16" },
      },
    ]);
  });

  it("writes a note on a child's briefing and says when it replaces one", async () => {
    const calls = mockBackend({
      notes: [
        {
          id: "n1",
          memberId: "ana",
          date: "2026-01-16",
          text: "Swim kit",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    renderPage();
    await screen.findByText("Note for Ana:");

    fireEvent.click(screen.getByTestId("quick-kind-note"));
    expect(screen.getByText("It is printed on their daily briefing for that day.")).toBeVisible();
    fireEvent.click(screen.getByTestId("quick-note-member-ana"));
    expect(
      screen.getByText("They already have a note that day; saving replaces it.")
    ).toBeVisible();
    fireEvent.change(screen.getByTestId("quick-note-text"), { target: { value: "Tidy up" } });
    fireEvent.click(screen.getByTestId("quick-save"));

    await screen.findByTestId("quick-saved");
    expect(writes(calls)).toEqual([
      {
        url: "/api/daily-messages",
        method: "PUT",
        body: { memberId: "ana", date: "2026-01-16", text: "Tidy up" },
      },
    ]);
  });

  it("lists the day and removes one-off meals and notes, never planned meals", async () => {
    const calls = mockBackend({
      events: [
        {
          id: "e1",
          occurrenceStart: "2026-01-16T09:15:00.000Z",
          source: "local",
          title: "Swimming",
          allDay: false,
          assignedTo: ["ana"],
        },
        {
          id: "e2",
          occurrenceStart: "2026-01-16",
          source: "local",
          title: "Holiday",
          allDay: true,
          assignedTo: [],
        },
      ],
      menu: [
        {
          entryId: "m1",
          slot: "lunch",
          label: "Lentils",
          isTombstone: false,
          source: "recurring",
          planId: "p1",
          recipeId: "r1",
          note: null,
        },
        {
          entryId: "m2",
          slot: "dinner",
          label: "Pizza",
          isTombstone: false,
          source: "oneoff",
          planId: null,
          recipeId: null,
          note: "Pizza",
        },
      ],
      notes: [
        {
          id: "n1",
          memberId: "ana",
          date: "2026-01-16",
          text: "Swim kit",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    renderPage();

    const plan = await screen.findByTestId("quick-plan");
    await within(plan).findByText("Swimming");
    expect(plan).toHaveTextContent("09:15 Swimming · Ana");
    expect(plan).toHaveTextContent("All day Holiday");
    expect(plan).toHaveTextContent("Lunch Lentils");
    // All-day events lead, then the timed ones; meals follow the day.
    expect(plan.textContent!.indexOf("Holiday")).toBeLessThan(
      plan.textContent!.indexOf("Swimming")
    );
    expect(plan.textContent!.indexOf("Lentils")).toBeLessThan(plan.textContent!.indexOf("Pizza"));
    expect(screen.queryByTestId("quick-remove-meal-m1")).toBeNull();

    fireEvent.click(screen.getByTestId("quick-remove-meal-m2"));
    await screen.findByTestId("quick-saved");
    fireEvent.click(screen.getByTestId("quick-remove-note-ana"));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));

    expect(writes(calls).map(({ url, method }) => `${method} ${url}`)).toEqual([
      "DELETE /api/meal-entries/m2",
      "DELETE /api/daily-messages?memberId=ana&date=2026-01-16",
    ]);
  });

  it("keeps the form and reports a failed save, and a plan that cannot load", async () => {
    mockBackend({
      fail: (url, method) => method === "POST" || url.startsWith("/api/menu"),
    });
    renderPage();

    expect(await screen.findByText("Couldn't load that day's plan.")).toBeVisible();
    fireEvent.change(screen.getByTestId("quick-event-title"), { target: { value: "Dentist" } });
    fireEvent.click(screen.getByTestId("quick-save"));

    expect(await screen.findByText("Couldn't save the change. Please try again.")).toBeVisible();
    expect(screen.getByTestId("quick-event-title")).toHaveValue("Dentist");
    expect(screen.queryByTestId("quick-saved")).toBeNull();
  });

  it("moves to another day from the date field", async () => {
    mockBackend();
    renderPage();
    await screen.findByText("Already planned for Friday 16 January");

    fireEvent.change(screen.getByTestId("quick-day-date"), { target: { value: "2026-01-20" } });

    await screen.findByText("Already planned for Tuesday 20 January");
  });
});
