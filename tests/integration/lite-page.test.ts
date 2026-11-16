import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/app";
import { generateKey, hashKey } from "../../src/server/auth/credentials";
import { getDb } from "../../src/server/db/client";
import { todayInHouseholdTz } from "../../src/server/lib/household-date";
import { createEvent } from "../../src/server/modules/calendar";
import { createEntry } from "../../src/server/modules/meals";
import { createChore, createRoutine, upsertAssignment } from "../../src/server/modules/routines";
import { renderLiteBriefing, renderLiteToday } from "../../src/server/lite/page";
import { seedMember } from "../helpers/daily-briefing-seed";
import { useIsolatedDb } from "../helpers/db";

useIsolatedDb();

const TOKEN = "mpg-test-access-token";
const GATE = `mp_gate=${createHash("sha256").update(TOKEN).digest("hex")}`;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function seedDeviceKey(revoked = false): string {
  const key = generateKey();
  getDb()
    .prepare(
      "INSERT INTO api_keys (id, key_hash, scope, kind, label, created_at, expires_at, revoked_at) VALUES (?, ?, '*', 'device', 'test', ?, NULL, ?)"
    )
    .run(`device-${key}`, hashKey(key), Date.now(), revoked ? Date.now() : null);
  return key;
}

describe("GET /lite", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.MP_ACCESS_TOKEN = TOKEN;
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.MP_ACCESS_TOKEN;
  });

  it("is behind the access gate", async () => {
    const res = await app.inject({ method: "GET", url: "/lite" });
    expect(res.body).toContain("access-gate-form");
  });

  it("offers the one-time setup to a browser without a device key", async () => {
    const res = await app.inject({ method: "GET", url: "/lite", headers: { cookie: GATE } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toContain('<form id="setup">');
    expect(res.body).toContain('xhr.open("POST", "/api/auth/provision")');
    expect(res.body).not.toContain("no longer valid");
    // The access token and the bootstrap key look alike; the page tells them apart.
    expect(res.body).toContain('key.indexOf("mpg-") === 0');
    expect(res.body).toContain("That is the access token (mpg-)");
    expect(res.body).toContain('.value.replace(/\\s+/g, "")');
  });

  it("asks to connect again when the device key was revoked", async () => {
    const key = seedDeviceKey(true);
    const res = await app.inject({
      method: "GET",
      url: "/lite",
      headers: { cookie: `${GATE}; mp_device_key=${key}` },
    });
    expect(res.body).toContain('<form id="setup">');
    expect(res.body).toContain("This device's key is no longer valid.");
  });

  it("shows today's agenda, chores and a button to each stored briefing slip", async () => {
    const date = todayInHouseholdTz(Date.now());
    seedMember("ana");
    getDb()
      .prepare(
        "INSERT INTO daily_briefing (id, member_id, date, status, payload, png, created_at, updated_at) VALUES ('b1', 'ana', ?, 'ready', '{}', ?, 0, 0)"
      )
      .run(date, PNG);
    createEvent({
      title: "Dentist <3",
      allDay: false,
      startUtc: `${date}T12:00:00.000Z`,
      endUtc: `${date}T13:00:00.000Z`,
      tzid: "Europe/Madrid",
    });
    const routine = createRoutine({ name: "Morning", dayPeriodId: "morning" });
    createChore(routine.id, { name: "Make the bed", icon: "🛏️" });
    upsertAssignment(routine.id, "ana", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], true);

    const res = await app.inject({
      method: "GET",
      url: "/lite",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<meta http-equiv="refresh" content="300">');
    expect(res.body).toMatch(/<span class="time">\d\d:\d\d<\/span> Dentist &lt;3/);
    expect(res.body).toContain('🛏️ <span class="name">Make the bed</span>');
    expect(res.body).toContain('<a class="open" href="?briefing=ana">ana ›</a>');
    expect(res.body).not.toContain("data:image/png");
    expect(res.body).not.toContain('<form id="setup">');

    const slip = await app.inject({
      method: "GET",
      url: "/lite?briefing=ana",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });
    expect(slip.body).toContain("<h1>ana&#39;s briefing</h1>");
    expect(slip.body).toContain(`src="data:image/png;base64,${PNG.toString("base64")}"`);
    expect(slip.body).toContain('<a class="open" href="lite">‹ Back</a>');
  });

  it("falls back to the day for a member without a briefing", async () => {
    seedMember("leo", { optedIn: false });
    const res = await app.inject({
      method: "GET",
      url: "/lite?briefing=leo",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });
    expect(res.body).toContain("<h2>Agenda</h2>");
    expect(res.body).not.toContain("briefing</h1>");
  });
  it("speaks Spanish, puts all-day events first and lists today's meals", async () => {
    const date = todayInHouseholdTz(Date.now());
    getDb()
      .prepare(
        "INSERT INTO settings_objects (object_name, data, updated_at) VALUES ('locale', ?, 0)"
      )
      .run(JSON.stringify({ language: "es" }));
    seedMember("leo");
    createEvent({
      title: "Piscina",
      allDay: false,
      startUtc: `${date}T16:00:00.000Z`,
      endUtc: `${date}T17:00:00.000Z`,
      tzid: "Europe/Madrid",
    });
    const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString();
    createEvent({
      title: "Excursión",
      allDay: true,
      startDate: date,
      endDate: tomorrow.slice(0, 10),
    });
    createEvent({
      title: "Desayuno con abuela",
      allDay: false,
      startUtc: `${date}T08:00:00.000Z`,
      endUtc: `${date}T09:00:00.000Z`,
      tzid: "Europe/Madrid",
    });
    createEntry({ kind: "oneoff", date, slot: "lunch", note: "Lentejas" });

    const res = await app.inject({
      method: "GET",
      url: "/lite",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });

    expect(res.body).toContain('<html lang="es">');
    const order = ["Excursión", "Desayuno con abuela", "Piscina"].map((title) =>
      res.body.indexOf(title)
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(res.body).toContain('<span class="time">Comida</span> Lentejas');
    expect(res.body).toContain("Aún no se ha generado.");

    const slip = await app.inject({
      method: "GET",
      url: "/lite?briefing=leo",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });
    expect(slip.body).toContain("<h1>Resumen de leo</h1>");
    expect(slip.body).toContain("Aún no se ha generado.");
  });

  it("leaves out meals and briefings while their plugins are inactive", async () => {
    getDb()
      .prepare(
        "UPDATE plugin_activation_registry SET state = 'inactive' WHERE plugin_id IN ('meals-recipes', 'daily-briefing')"
      )
      .run();
    await app.close();
    app = await buildApp();
    seedMember("ana");

    const res = await app.inject({
      method: "GET",
      url: "/lite",
      headers: { cookie: `${GATE}; mp_device_key=${seedDeviceKey()}` },
    });

    expect(res.body).toContain("<h2>Chores</h2>");
    expect(res.body).not.toContain("<h2>Meals</h2>");
    expect(res.body).not.toContain("Daily briefing");
  });

  it("backs off after repeated unknown device keys", async () => {
    let status = 200;
    for (let attempt = 0; attempt < 25 && status === 200; attempt += 1) {
      const res = await app.inject({
        method: "GET",
        url: "/lite",
        headers: { cookie: `${GATE}; mp_device_key=mpk-not-a-key` },
      });
      status = res.statusCode;
    }
    expect(status).toBe(429);
  });
});

describe("renderLiteToday", () => {
  const today = {
    language: "es" as const,
    dateLabel: "Lunes, 16 de noviembre",
    updatedAt: "08:05",
    events: [{ time: null, title: "Excursión", who: ["Ana", "Leo"] }],
    meals: [{ slot: "lunch" as const, labels: ["Lentejas"] }],
    chores: [
      {
        name: "Ana",
        progress: { completed: 1, total: 2 },
        periods: [
          {
            id: "morning" as const,
            chores: [
              { name: "Cama", icon: null, completed: true },
              { name: "Dientes", icon: null, completed: false },
            ],
          },
          { id: "night" as const, chores: [] },
        ],
      },
    ],
    briefings: [
      { memberId: "ana", name: "Ana", ready: true, generating: false },
      { memberId: "leo", name: "Leo", ready: false, generating: true },
      { memberId: "eva", name: "Eva", ready: false, generating: false },
    ],
  };

  it("speaks the household's language and skips empty day periods", () => {
    const html = renderLiteToday(today);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<span class="time">Todo el día</span> Excursión');
    expect(html).toContain("· Ana, Leo");
    expect(html).toContain('<span class="time">Comida</span> Lentejas');
    expect(html).toContain('Ana <span class="muted">1/2</span>');
    expect(html).toContain('<li class="done">');
    expect(html).not.toContain(">Noche<");
    expect(html).toContain('<a class="open" href="?briefing=ana">Ana ›</a>');
    expect(html).toContain('Leo <span class="muted">Generándose…</span>');
    expect(html).toContain('Eva <span class="muted">Aún no se ha generado.</span>');
  });

  it("leaves out the sections of inactive plugins and says when a day is empty", () => {
    const html = renderLiteToday({
      ...today,
      events: [],
      meals: null,
      chores: [],
      briefings: null,
    });
    expect(html).toContain("Hoy no hay nada en el calendario.");
    expect(html).toContain("Hoy no hay tareas.");
    expect(html).not.toContain("<h2>Comidas</h2>");
    expect(html).not.toContain("Resumen del día");
  });
});

describe("renderLiteBriefing", () => {
  it("says a slip is being generated", () => {
    const html = renderLiteBriefing({ language: "es", name: "Leo", png: null, generating: true });
    expect(html).toContain("<h1>Resumen de Leo</h1>");
    expect(html).toContain("Generándose…");
    expect(html).toContain('<a class="open" href="lite">‹ Volver</a>');
  });
});
