// The lite page: today's household view as plain server-rendered HTML for browsers too old for
// the SPA (an iPad stuck on iOS 12 has Safari 12; the SPA's styles need Safari 16.4). No
// framework and no external assets: one screen that refreshes itself, laid out to fit an iPad
// without scrolling, with each child's briefing slip one tap away on a screen of its own. Its only
// script is the ES5 provisioning call on the setup page. Pure: the route gathers the data.

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
  /** A stored slip exists for today. */
  ready: boolean;
  generating: boolean;
}

/** One child's briefing on a screen of its own. */
export interface LiteBriefingView {
  language: LiteLanguage;
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
    briefingOf: "{name}'s briefing",
    noBriefing: "Not generated yet.",
    generating: "Being generated…",
    back: "‹ Back",
    slot: { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" },
    period: { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" },
    setupTitle: "Connect this device",
    setupText:
      "Enter the device bootstrap key (MP_BOOTSTRAP_KEY, it starts with mpk-) once. This device can then show today's view, and nothing on it can change the household's data.",
    setupLost: "This device's key is no longer valid. Connect it again.",
    setupLabel: "Bootstrap key",
    setupButton: "Connect",
    setupWorking: "Connecting…",
    setupFailed: "That key was not accepted. Check it and try again.",
    setupGateToken:
      "That is the access token (mpg-), already entered on the previous screen. Here goes the bootstrap key, which starts with mpk-.",
    setupThrottled: "Too many failed attempts. Wait {seconds} seconds and try again.",
    setupOffline: "Could not reach the server. Check the Wi-Fi and try again.",
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
    briefingOf: "Resumen de {name}",
    noBriefing: "Aún no se ha generado.",
    generating: "Generándose…",
    back: "‹ Volver",
    slot: { breakfast: "Desayuno", lunch: "Comida", snack: "Merienda", dinner: "Cena" },
    period: { morning: "Mañana", afternoon: "Mediodía", evening: "Tarde", night: "Noche" },
    setupTitle: "Conectar este dispositivo",
    setupText:
      "Introduce una vez la clave de alta de dispositivos (MP_BOOTSTRAP_KEY, empieza por mpk-). Después este dispositivo mostrará el día de hoy, y desde él no se puede cambiar nada.",
    setupLost: "La clave de este dispositivo ya no es válida. Vuelve a conectarlo.",
    setupLabel: "Clave de alta",
    setupButton: "Conectar",
    setupWorking: "Conectando…",
    setupFailed: "Esa clave no se ha aceptado. Revísala y vuelve a intentarlo.",
    setupGateToken:
      "Ese es el token de acceso (mpg-), que ya se puso en la pantalla anterior. Aquí va la clave de alta, que empieza por mpk-.",
    setupThrottled:
      "Demasiados intentos fallidos. Espera {seconds} segundos y vuelve a intentarlo.",
    setupOffline:
      "No se ha podido contactar con el servidor. Revisa el wifi y vuelve a intentarlo.",
  },
} as const;

// Safari 12: no flex `gap`, no custom properties; floats and margins do the layout.
const CSS = `
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    padding: 12px;
    background: #f5f2ed;
    color: #2b2926;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 18px;
    line-height: 1.3;
  }
  header { margin: 0 4px 10px; }
  header:after, .row:after { content: ""; display: table; clear: both; }
  h1 { float: left; margin: 0; font-size: 28px; }
  header .muted { float: right; margin: 8px 0 0; }
  h2 { margin: 0 0 6px; font-size: 20px; }
  h3 { margin: 0 0 4px; font-size: 19px; }
  p { margin: 0; }
  .muted { color: #77726b; font-size: 15px; }
  .card {
    margin: 0 4px 8px;
    padding: 10px 12px;
    border: 1px solid #e4dfd8;
    border-radius: 14px;
    background: #fdfbf8;
  }
  .side { float: left; width: 38%; }
  .main { float: left; width: 62%; }
  .child { float: left; padding-right: 10px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { padding: 2px 0; }
  .time { display: inline-block; min-width: 4.4em; font-weight: 600; }
  .who { color: #77726b; }
  .period { margin: 6px 0 1px; color: #77726b; font-size: 14px; text-transform: uppercase; }
  .done { color: #9a948c; }
  .done .name { text-decoration: line-through; }
  .mark { display: inline-block; width: 1.3em; color: #5a5a40; font-weight: 700; }
  .open {
    display: block;
    margin-top: 8px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #5a5a40;
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    text-decoration: none;
  }
  .open .muted { color: #e8e6dc; }
  .closed { background: #e4dfd8; color: #77726b; }
  .closed .muted { color: #77726b; }
  .bar { margin: 0 4px 10px; }
  .bar:after { content: ""; display: table; clear: both; }
  .bar .open { float: left; margin: 0 14px 0 0; padding: 10px 18px; }
  .bar h1 { margin-top: 6px; }
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
  const width = `${Math.floor(10000 / today.chores.length) / 100}%`;
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
              `<li${chore.completed ? ' class="done"' : ""}><span class="mark">${chore.completed ? "✓" : "○"}</span>${chore.icon ? `${escapeHtml(chore.icon)} ` : ""}<span class="name">${escapeHtml(chore.name)}</span></li>`
          );
          return `<p class="period">${t.period[period.id]}</p><ul>${chores.join("")}</ul>`;
        });
      return `<div class="child" style="width:${width}"><h3>${escapeHtml(column.name)}${progress}</h3>${periods.join("")}</div>`;
    })
    .join("");
}

function briefingsHtml(today: LiteToday, briefings: LiteBriefing[]): string {
  const t = STRINGS[today.language];
  const buttons = briefings.map((briefing) => {
    const name = escapeHtml(briefing.name);
    if (briefing.ready) {
      return `<a class="open" href="?briefing=${encodeURIComponent(briefing.memberId)}">${name} ›</a>`;
    }
    const state = briefing.generating ? t.generating : t.noBriefing;
    return `<div class="open closed">${name} <span class="muted">${state}</span></div>`;
  });
  return `<section class="card"><h2>${t.briefings}</h2>${buttons.join("")}</section>`;
}

/** The household's day on one screen: agenda, meals and the briefing buttons beside every
 * child's chores. */
export function renderLiteToday(today: LiteToday): string {
  const t = STRINGS[today.language];
  const meals = today.meals
    ? `<section class="card"><h2>${t.meals}</h2>${mealsHtml(today, today.meals)}</section>`
    : "";
  const briefings =
    today.briefings && today.briefings.length > 0 ? briefingsHtml(today, today.briefings) : "";
  const body = `<header><h1>${escapeHtml(today.dateLabel)}</h1><p class="muted">${t.updated} ${today.updatedAt}</p></header>
<div class="row">
<div class="side">
<section class="card"><h2>${t.agenda}</h2>${agendaHtml(today)}</section>
${meals}
${briefings}
</div>
<div class="main">
<section class="card"><h2>${t.chores}</h2><div class="row">${choresHtml(today)}</div></section>
</div>
</div>`;
  return documentHtml(
    today.language,
    t.title,
    `<meta http-equiv="refresh" content="${LITE_REFRESH_SECONDS}">\n`,
    body
  );
}

/** One child's stored slip, with a way back to the day. It refreshes too, so a slip generated
 * while it is open appears on its own. */
export function renderLiteBriefing(view: LiteBriefingView): string {
  const t = STRINGS[view.language];
  const title = t.briefingOf.replace("{name}", view.name);
  const content = view.png
    ? `<img class="slip" alt="" src="data:image/png;base64,${view.png}">`
    : `<p class="muted">${view.generating ? t.generating : t.noBriefing}</p>`;
  const body = `<div class="bar"><a class="open" href="lite">${t.back}</a><h1>${escapeHtml(title)}</h1></div>
<section class="card">${content}</section>
<div class="bar"><a class="open" href="lite">${t.back}</a></div>`;
  return documentHtml(
    view.language,
    title,
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
  function fail(message) {
    status.className = "error";
    status.textContent = message;
  }
  form.onsubmit = function (event) {
    event.preventDefault();
    // A pasted key often brings a space or line break along.
    var key = document.getElementById("key").value.replace(/\\s+/g, "");
    if (!key) return;
    if (key.indexOf("mpg-") === 0) {
      fail(${JSON.stringify(t.setupGateToken)});
      return;
    }
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
      if (xhr.status === 429) {
        var seconds = xhr.getResponseHeader("Retry-After") || "60";
        fail(${JSON.stringify(t.setupThrottled)}.replace("{seconds}", seconds));
        return;
      }
      fail(${JSON.stringify(t.setupFailed)});
    };
    xhr.onerror = function () {
      fail(${JSON.stringify(t.setupOffline)});
    };
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
