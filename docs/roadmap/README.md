# Roadmap

Candidate work found while setting up a real Spanish-language household (two adults, two
children aged 10 and 13) on 2026-11-13. Nothing here is committed or scheduled. Each item
records what was observed, what is known about the cause, and the options seen so far.

| #   | Item                                                                      | Kind    | Status                             |
| --- | ------------------------------------------------------------------------- | ------- | ---------------------------------- |
| 1   | [Weather and streak print twice by default](#1-weather-and-streak-twice)  | Bug/UX  | Open                               |
| 2   | [English content on a Spanish household's slip](#2-english-content)       | Feature | Open                               |
| 3   | [Emoji typed in a reminder prints as an empty box](#3-emoji-in-reminders) | Bug     | Open                               |
| 4   | [Print the briefing on an ordinary A4 printer](#4-a4-printing)            | Feature | Manual print done; unattended open |

The observations come from one generated briefing (all blocks enabled, household language
Spanish, 576-dot paper width, image 576 × 5272 px).

## 1. Weather and streak twice

**Observed.** With the default block set, the slip carries the weather twice (`05
METEOROLOGÍA` and `21 METEOROLOGÍA TEXTO`) and the streak twice (`03 RACHA` and `20 RACHA
TEXTO`). To a parent this reads as a duplicated entry.

**Cause.** `weather` / `weatherText` and `streak` / `streakText` are separate block types in
`src/shared/dailyBriefingBlocks.ts`, and all four have `defaultEnabled: true`. The text
variants are alternatives to the graphic ones, not complements.

**Workaround.** Admin → Daily briefing → Blocks: turn off the `(text)` variant, or the graphic
one, for each member.

**Options.**

- Set `defaultEnabled: false` on `weatherText` and `streakText`. Smallest change; existing
  households with no stored settings row would lose the text variants on the next briefing.
- Present each pair in the admin matrix as one row with a "graphic / text" choice, so both
  cannot be on at once.

## 2. English content

**Observed.** With the household language set to Spanish, these blocks print in English: dad
joke, word of the day, on this day, quote of the day, trivia, riddle and word search. Block
titles are translated; the content is not.

**Cause.** Two different situations:

| Block        | Kind     | Why it is English                                                    |
| ------------ | -------- | -------------------------------------------------------------------- |
| `dadJoke`    | corpus   | `languages: ["en"]`, only `corpora/jokes.json`                       |
| `wordOfDay`  | corpus   | `languages: ["en"]`, only `corpora/vocabulary-entries.json`          |
| `trivia`     | corpus   | `languages: ["en"]`, only `corpora/trivia-questions.json`            |
| `riddle`     | corpus   | `languages: ["en"]`, only `corpora/riddles.json`                     |
| `wordSearch` | corpus   | `languages: ["en"]`, only `corpora/word-search-corpus.json`          |
| `onThisDay`  | external | `languagePrefix` defaults to `"en"` in `blocks/onThisDay.ts`         |
| `quoteOfDay` | external | English quote observed; whether the source offers Spanish is unknown |

`animalFact`, `numberFact`, `wouldYouRather` and `drawingPrompt` already ship an `.es.json`
corpus and printed in Spanish. `phonics` is English by design.

**Options.**

- **Spanish corpora.** Add an `.es.json` sibling for each English-only corpus and list `"es"`
  in that block's `languages`. The loader and the per-block language selector already handle a
  second language. The work is the content: jokes, riddles and trivia need writing or
  licensing rather than translating word for word, and the word search needs a Spanish word
  list (decide how `Ñ` and accented vowels appear in the grid).
- **`onThisDay` in the household language.** The source takes a language prefix, but the
  cache key is `(date, blockType)` with no language column, so the first generation of the day
  fixes the language for everybody. Needs the cache key extended, or the prefix derived from
  the household language only.
- **Do not print what cannot be localized.** Until a corpus exists, a block with no content in
  the household language could default to off, or be flagged in the admin matrix ("English
  only"). Today nothing warns the parent before the slip is printed.

## 3. Emoji in reminders

**Observed.** A scheduled reminder written as "🎒 Revisa que llevas la agenda y el estuche"
prints as "▯ Revisa que llevas la agenda y el estuche": the emoji becomes an empty box.

**Cause.** Not investigated. The renderer has emoji support for reminders through vendored
Noto artwork (`render/emoji-images.ts`, `render/blocks/reminders.ts`), but that path serves
reminders whose items are images; an emoji typed inside the text goes through the text font,
which has no glyph for it.

**Options.** Strip or replace emoji in reminder text at render time; or render inline emoji
from the Noto set the app already ships; or reject/warn in the reminder form.

## 4. A4 printing

**Goal.** A household without a Bluetooth thermal printer should be able to print the
briefing on the ordinary A4 printer it already owns.

**Today.** Daily Briefing renders a 1-bit raster for a device render context that only knows
`paperWidthDots` (ADR-041). Printing wraps that raster as ESC/POS on the server (ADR-066) and
the kiosk browser sends the bytes over Web Bluetooth. The printing contract names Bluetooth as
the only transport and leaves further transports undecided
(`docs/architecture/contracts/printing.md`).

**The slip does not fit as it is.** It is one narrow column: 576 × 5272 px is about 72 mm ×
660 mm at 203 dpi, more than two A4 pages tall and a third of the page wide, so it has to be
split into columns.

**Done: A. Browser print.** Admin → Daily briefing → Briefings has a **Print on A4** button
(`src/client/daily-briefing/admin/BriefingA4Print.tsx`). It does not re-render anything: it
takes the stored slip image, cuts it between blocks and places it in three 60 mm columns on an
A4 page (83% of thermal size), then opens the browser's print dialog. The all-blocks slip above
fits on one page. Limits:

- It needs the stored image, which only exists when the briefing was generated with the Printing
  plugin active.
- It keeps the 1-bit thermal look and the slip's block order.
- It is manual and bypasses the print queue: no `printedAt`, and "print when the morning chores
  are done" does not reach the A4 printer. A kiosk Chrome started with `--kiosk-printing` would
  skip the dialog, but nothing triggers the print by itself.

**Open: B. Unattended A4.** Extend the device render context with a page format, render a PDF
(or page rasters) on the server, and add a transport arm that sends it to a network printer
(IPP). Keeps queueing, `printedAt` and the automatic trigger, and needs no browser. Costs: the
server must reach the printer on the LAN (a container network concern), a new failure surface,
and the contract's "Bluetooth only" decision has to be reopened in an ADR.

**Open questions.**

- Is the 1-bit thermal look good enough on A4, or is a page layout of its own (larger type,
  greyscale, member colours) worth a second renderer?
- One page per child, or one sheet for the whole household?
- Does automatic printing matter on A4, or is a manual "print today's" enough?
