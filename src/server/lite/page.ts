// The lite page: today's household view as plain server-rendered HTML for browsers too old for
// the SPA (an iPad stuck on iOS 12 has Safari 12; the SPA's styles need Safari 16.4). No
// framework and no external assets: one HTML document that refreshes itself. Its only script is
// the ES5 provisioning call on the setup page. Pure: the route gathers the data.

import type { PeriodId, Slot } from "../../shared";

export type LiteLanguage = "es" | "en";

export interface LiteEvent {
  /** `HH:mm` in the household timezone; null for an all-day event. */
  time: string | null;
  title: string;
  who: string[];
}

export interface LiteChoreColumn {
  name: string;
  progress: { completed: number; total: number } | null;
  periods: { id: PeriodId; chores: { name: string; icon: string | null; completed: boolean }[] }[];
}

export interface LiteBriefing {
  memberId: string;
  name: string;
  /** The stored slip as base64 PNG; null when there is none to show. */
  png: string | null;
  generating: boolean;
}

export interface LiteToday {
  language: LiteLanguage;
  /** "lunes, 16 de noviembre". */
  dateLabel: string;
  /** `HH:mm` of this render. */
  updatedAt: string;
  events: LiteEvent[];
  /** Null when the Meals plugin is inactive. */
  meals: { slot: Slot; labels: string[] }[] | null;
  chores: LiteChoreColumn[];
  /** Null when the Daily briefing plugin is inactive. */
  briefings: LiteBriefing[] | null;
}

/** Seconds between the page's own reloads. */
export const LITE_REFRESH_SECONDS = 300;

const STRINGS = {
  en: {
    title: "Today",
    updated: "Updated at",
    agenda: "Agenda",
    noEvents: "Nothing on the calendar today.",
    allDay: "All day",
    meals: "Meals",
    noMeals: "No meals planned today.",
    chores: "Chores",
    noChores: "No chores today.",
    briefings: "Daily briefing",
    noBriefing: "Not generated yet.",
    generating: "Being generated…",
    slot: { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" },
    period: { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" },
    setupTitle: "Connect this device",
    setupText:
      "Enter the device bootstrap key (MP_BOOTSTRAP_KEY) once. This device can then show today's view, and nothing on it can change the household's data.",
    setupLost: "This device's key is no longer valid. Connect it again.",
    setupLabel: "Bootstrap key",
    setupButton: "Connect",
    setupWorking: "Connecting…",
    setupFailed: "That key was not accepted. Check it and try again.",
  },
  es: {
    title: "Hoy",
    updated: "Actualizado a las",
    agenda: "Agenda",
    noEvents: "Hoy no hay nada en el calendario.",
    allDay: "Todo el día",
    meals: "Comidas",
    noMeals: "Hoy no hay comidas planificadas.",
    chores: "Tareas",
    noChores: "Hoy no hay tareas.",
    briefings: "Resumen del día",
    noBriefing: "Aún no se ha generado.",
    generating: "Generándose…",
    slot: { breakfast: "Desayuno", lunch: "Comida", snack: "Merienda", dinner: "Cena" },
    period: { morning: "Mañana", afternoon: "Mediodía", evening: "Tarde", night: "Noche" },
    setupTitle: "Conectar este dispositivo",
    setupText:
      "Introduce una vez la clave de alta de dispositivos (MP_BOOTSTRAP_KEY). Después este dispositivo mostrará el día de hoy, y desde él no se puede cambiar nada.",
    setupLost: "La clave de este dispositivo ya no es válida. Vuelve a conectarlo.",
    setupLabel: "Clave de alta",
    setupButton: "Conectar",
    setupWorking: "Conectando…",
    setupFailed: "Esa clave no se ha aceptado. Revísala y vuelve a intentarlo.",
  },
} as const;

const CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: #f5f2ed;
    color: #2b2926;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 18px;
    line-height: 1.35;
  }
  header { margin-bottom: 12px; }
  h1 { margin: 0; font-size: 30px; }
  h2 { margin: 0 0 8px; font-size: 22px; }
  h3 { margin: 10px 0 4px; font-size: 18px; }
  .muted { color: #77726b; font-size: 15px; }
  .card {
    margin-bottom: 14px;
    padding: 12px 14px;
    border: 1px solid #e4dfd8;
    border-radius: 14px;
    background: #fdfbf8;
  }
  ul { margin: 0; padding: 0; list-style: none; }
  li { padding: 3px 0; }
  .time { display: inline-block; min-width: 4.2em; font-weight: 600; }
  .who { color: #77726b; }
  .done { color: #77726b; text-decoration: line-through; }
  .mark { display: inline-block; width: 1.4em; }
  .row:after { content: ""; display: table; clear: both; }
  .half { float: left; width: 50%; padding-right: 14px; }
  nav a {
    display: inline-block;
    margin: 0 8px 8px 0;
    padding: 8px 14px;
    border-radius: 999px;
    background: #5a5a40;
    color: #fff;
    text-decoration: none;
  }
  .slip { display: block; width: 100%; max-width: 576px; margin: 0 auto; background: #fff; }
  label { display: block; margin: 12px 0 6px; font-weight: 600; }
  input {
    display: block;
    width: 100%;
    padding: 10px;
    border: 1px solid #cfc9c1;
    border-radius: 8px;
    font-size: 18px;
  }
  button {
    margin-top: 12px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: #5a5a40;
    color: #fff;
    font-size: 18px;
  }
  .error { color: #b3261e; }
`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function documentHtml(language: LiteLanguage, title: string, head: string, body: string): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="apple-mobile-web-app-capable" content="yes">
${head}<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function agendaHtml(today: LiteToday): string {
  const t = STRINGS[today.language];
  if (today.events.length === 0) return `<p class="muted">${t.noEvents}</p>`;
  const items = today.events.map((event) => {
    const who =
      event.who.length > 0 ? ` <span class="who">· ${escapeHtml(event.who.join(", "))}</span>` : "";
    return `<li><span class="time">${event.time ?? t.allDay}</span> ${escapeHtml(event.title)}${who}</li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

function mealsHtml(today: LiteToday, meals: NonNullable<LiteToday["meals"]>): string {
  const t = STRINGS[today.language];
  if (meals.length === 0) return `<p class="muted">${t.noMeals}</p>`;
  const items = meals.map(
    (meal) =>
      `<li><span class="time">${t.slot[meal.slot]}</span> ${escapeHtml(meal.labels.join(", "))}</li>`
  );
  return `<ul>${items.join("")}</ul>`;
}

function choresHtml(today: LiteToday): string {
  const t = STRINGS[today.language];
  if (today.chores.length === 0) return `<p class="muted">${t.noChores}</p>`;
  return today.chores
    .map((column) => {
      const progress = column.progress
        ? ` <span class="muted">${column.progress.completed}/${column.progress.total}</span>`
        : "";
      const periods = column.periods
        .filter((period) => period.chores.length > 0)
        .map((period) => {
          const chores = period.chores.map(
            (chore) =>
              `<li${chore.completed ? ' class="done"' : ""}><span class="mark">${chore.completed ? "✅" : "⬜️"}</span>${escapeHtml(`${chore.icon ?? ""} ${chore.name}`.trim())}</li>`
          );
          return `<p class="muted">${t.period[period.id]}</p><ul>${chores.join("")}</ul>`;
        });
      return `<h3>${escapeHtml(column.name)}${progress}</h3>${periods.join("")}`;
    })
    .join("");
}

function briefingsHtml(today: LiteToday, briefings: LiteBriefing[]): string {
  const t = STRINGS[today.language];
  const nav =
    briefings.length > 1
      ? `<nav>${briefings
          .map((b) => `<a href="#briefing-${escapeHtml(b.memberId)}">${escapeHtml(b.name)}</a>`)
          .join("")}</nav>`
      : "";
  const cards = briefings.map((briefing) => {
    const content = briefing.png
      ? `<img class="slip" alt="" src="data:image/png;base64,${briefing.png}">`
      : `<p class="muted">${briefing.generating ? t.generating : t.noBriefing}</p>`;
    return `<section class="card" id="briefing-${escapeHtml(briefing.memberId)}"><h2>${t.briefings} · ${escapeHtml(briefing.name)}</h2>${content}</section>`;
  });
  return nav + cards.join("");
}

/** The household's day: agenda, meals, chores, then each child's stored briefing slip. */
export function renderLiteToday(today: LiteToday): string {
  const t = STRINGS[today.language];
  const meals = today.meals
    ? `<section class="card"><h2>${t.meals}</h2>${mealsHtml(today, today.meals)}</section>`
    : "";
  const body = `<header><h1>${escapeHtml(today.dateLabel)}</h1><p class="muted">${t.updated} ${today.updatedAt}</p></header>
<div class="row">
<div class="half">
<section class="card"><h2>${t.agenda}</h2>${agendaHtml(today)}</section>
${meals}
</div>
<div class="half">
<section class="card"><h2>${t.chores}</h2>${choresHtml(today)}</section>
</div>
</div>
${today.briefings ? briefingsHtml(today, today.briefings) : ""}`;
  return documentHtml(
    today.language,
    t.title,
    `<meta http-equiv="refresh" content="${LITE_REFRESH_SECONDS}">\n`,
    body
  );
}

/** The one-time setup: provisions this browser with the bootstrap key through the same
 * `POST /api/auth/provision` the SPA uses (it sets the device cookie), then reloads. */
export function renderLiteSetup(
  language: LiteLanguage,
  basePath: string,
  options: { lost?: boolean } = {}
): string {
  const t = STRINGS[language];
  const lost = options.lost ? `<p class="error">${t.setupLost}</p>` : "";
  // ES5 only: Safari 12 is the reason this page exists.
  const script = `<script>
(function () {
  var form = document.getElementById("setup");
  var status = document.getElementById("status");
  form.onsubmit = function (event) {
    event.preventDefault();
    var key = document.getElementById("key").value;
    if (!key) return;
    status.className = "muted";
    status.textContent = ${JSON.stringify(t.setupWorking)};
    var xhr = new XMLHttpRequest();
    xhr.open("POST", ${JSON.stringify(`${basePath}/api/auth/provision`)});
    xhr.setRequestHeader("Authorization", "Bearer " + key);
    xhr.onload = function () {
      if (xhr.status === 200) {
        window.location.reload();
        return;
      }
      status.className = "error";
      status.textContent = ${JSON.stringify(t.setupFailed)};
    };
    xhr.onerror = xhr.onload;
    xhr.send();
  };
})();
</script>`;
  const body = `<section class="card">
<h1>${t.setupTitle}</h1>
${lost}<p>${t.setupText}</p>
<form id="setup">
<label for="key">${t.setupLabel}</label>
<input id="key" type="password" autocomplete="off" autocapitalize="off" autocorrect="off">
<button type="submit">${t.setupButton}</button>
<p id="status" role="status"></p>
</form>
</section>
${script}`;
  return documentHtml(language, t.setupTitle, "", body);
}
