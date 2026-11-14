# Roadmap

Candidate work found while setting up a real Spanish-language household (two adults, two
children aged 10 and 13) on 2026-11-13. Nothing here is committed or scheduled. Each item
records what was observed, what is known about the cause, and the options seen so far.

| #   | Item                                                                      | Kind    | Status                             |
| --- | ------------------------------------------------------------------------- | ------- | ---------------------------------- |
| 1   | [Weather and streak print twice by default](#1-weather-and-streak-twice)  | Bug/UX  | Open                               |
| 2   | [English content on a Spanish household's slip](#2-english-content)       | Feature | Done                               |
| 3   | [Emoji typed in a reminder prints as an empty box](#3-emoji-in-reminders) | Bug     | Open                               |
| 4   | [Print the briefing on an ordinary A4 printer](#4-a4-printing)            | Feature | Manual print done; unattended open |
| 5   | [Household chores beyond children's routines](#5-household-chores)        | Feature | Open                               |
| 6   | [The day's chores on the printed briefing](#6-chores-on-the-briefing)     | Feature | Done                               |
| 7   | [Household events on the briefing's agenda](#7-household-events)          | Feature | Done                               |
| 8   | [Reusing chores across routines](#8-reusing-chores)                       | Feature | Copies done; shared catalogue open |
| 9   | [The saint's day on the briefing](#9-saints-day)                          | Feature | Open, after item 2                 |
| 10  | [An English word a day for a Spanish household](#10-english-word)         | Feature | Open, after item 2                 |

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

**Decided (2026-11-14).** For this household only, not as an upstream contribution; one block
at a time, each deployed and seen on paper before the next:

| Block        | Decision                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| `onThisDay`  | Spanish Wikipedia, events only (no births or deaths), always                    |
| `riddle`     | Translate the 122, replacing the ones that depend on English                    |
| `dadJoke`    | 588 new Spanish jokes: wordplay, "colmos", absurd questions, short situations   |
| `quoteOfDay` | Local Spanish corpus mixing proverbs and well-attributed quotes; `en` unchanged |
| `wordSearch` | Curated themed word list; `Ñ` is a letter, vowels unaccented in the grid        |
| `wordOfDay`  | Spanish vocabulary (Spanish word, Spanish definition), 398 words in four levels |
| `trivia`     | Translate, replacing US-centric and non-child questions; same total of 832      |

The word search prints its word list with accents ("CAMIÓN") while the grid holds "CAMION".
Content is written in one pass and corrected as it shows up on paper, so each corpus goes
through an automated check (facts, answers, duplicates, tone for ages 10 to 13).
Items [9](#9-saints-day) and [10](#10-english-word) follow in the same run.

**Done: `onThisDay`.** The block reads the Wikipedia edition of the household language and
carries events only (FR-032, FR-033 in `docs/features/daily-briefing.md`). Found on the way,
against the live feed and a real render:

- The `all` feed in Spanish took over seven seconds when measured, more than the five-second
  timeout; the `events` feed answered in a fraction of a second, so the block asks for that one.
- A long line ran past the paper's edge in either language. Each line is now a row of columns
  (bullet, bold year, text) and wraps under its own text.
- Spanish events write their dashes with the horizontal bar, which printed as an empty box:
  6% of the events sampled had one. It is swapped for an em dash on paper.
- Spanish events run long (a tenth are over 260 characters, some several hundred), so events
  over 200 characters are left out while at least three shorter ones exist.

A briefing generated before the change keeps its English lines; **Regenerate** replaces them.

**Done: `riddle`.** `corpora/riddles.es.json` holds one Spanish riddle per English slot, with
the slot's difficulty, so a date picks the same slot in either language (FR-034). Of the 122:

- 76 keep the idea of the English riddle: 72 with the same answer and 4 with its Spanish
  counterpart (a nine-letter palindrome, the hedgehog, the last letter of "arcoíris", the
  cat). Some needed the Spanish form of the same idea: the coin has "cara y cruz" rather than
  head and tail, the alphabet has 27 letters, and the letter riddles were rebuilt on Spanish
  words ("minuto", "momento", "marzo", "abril").
- 46 are other riddles, most of them traditional Spanish "adivinanzas". They take the slots
  whose English riddle is a play on English words (ears of corn, stories of a building, a
  tree's bark, a tennis serve), the slots that repeat an answer (the English corpus asks for
  the clock, fire, silence and a hole three times each) and three slots whose riddle
  twinned another one.

No two Spanish riddles share an answer. A review of the content found no wrong answer; it
reworded the riddles that another entry's answer also solved ("vuela sin alas", "tiene un
ojo y no ve", "cuatro patas y no anda") and replaced the twins. A test checks, for every
entry, the slot's difficulty, the reviewed character set, paired marks and quotes, the
length, duplicates (ignoring accents and articles) and leftover English.

A briefing generated before the change keeps its English riddle; **Regenerate** replaces
it. A riddle language set explicitly to English in Admin → Daily briefing → Blocks stays
English.

**Done: `dadJoke`.** `corpora/jokes.es.json` holds 588 Spanish jokes, as many as the English
corpus, so a date picks a slot in either language (FR-035). None is a translation: English
puns ("a quack mob", "import-ant") do not survive one. The mix: 160 "¿Qué le dijo...?", 117
"colmos", 153 short questions with a pun for an answer ("¿Por qué...?", "¿Cómo se
llama...?", "¿Qué sale de cruzar...?") and 158 short scenes (doctor, waiter, Jaimito, "van
dos", "toc, toc"). A first draft of 863 was cut by a third on review: jokes with no pun,
English puns that slipped through, ones that made fun of someone's body, disability or
origin, and repeats of an idea.
A test checks the character set, paired marks and quotes, the length, duplicates and leftover
English.

A briefing generated before the change keeps its English joke; **Regenerate** replaces it. A
joke language set explicitly to English in Admin → Daily briefing → Blocks stays English.

**Done: `quoteOfDay`.** ZenQuotes has no Spanish, so a Spanish household reads
`corpora/quotes.es.json` instead and makes no call (FR-036); any other language keeps ZenQuotes.
The corpus holds 366 entries picked by day of year, as `numberFact` does, so no quote repeats
within a year: 262 Spanish proverbs and 104 quotes spread evenly through the year. The quotes
are limited to authors on record: Spanish and Latin American literature (Cervantes, Machado,
Calderón, Bécquer, Lorca, Borges...), classics (Séneca, Confucio, Horacio), children's books
(El principito, Alicia, Tolkien) and a few documented sayings (Newton, Edison, Armstrong,
Mandela, Malala). Famous lines with a doubtful attribution were left out, as were proverbs that
mock someone or read badly to a child. A test checks the count, character set, marks, length
and duplicates.

A briefing generated before the change keeps its English quote; **Regenerate** replaces it.
The block stays external: it has no per-block language, it follows the household language.

**Done: `wordSearch`.** `corpora/word-search.es.json` holds a curated themed list (animals,
food, sport, school, nature, geography, home, body, clothes, transport, music, jobs, calendar,
adventure): 217 easy words of 3 to 5 letters, 225 medium of 6 to 7 and 160 hard of 8 to 10,
matching the grid profiles (FR-037). The grid holds "CAMION" with `Ñ` as its own letter and
fills empty cells from an alphabet with `Ñ`; the word list prints "CAMIÓN". Checked on a real
render.

Changed from the decision above at the household's request: with no language set on the
block, a Spanish household gets Spanish or English by date, picked by a hash of the date
rather than strict alternation, so the same for every member that day and stable on
**Regenerate**. Setting the block's language to Spanish or English in Admin → Daily briefing
→ Blocks pins it. The English path is unchanged byte for byte (its pinned tests still pass).

**Done: `wordOfDay`.** `corpora/vocabulary-entries.es.json` holds 398 Spanish words, as many
per level as the English corpus (100, 100, 100, 98), so a date and a level pick the same slot
in either language (FR-038). Level 1 is everyday vocabulary for a ten-year-old ("valiente",
"huella", "trepar"); level 4 is literary ("inefable", "serendipia", "dilucidar"). Each entry has
a Spanish word class, an own definition (not copied from a dictionary) and an example; no
pronunciation is printed. Checked on a real render.

**Done: `trivia`.** `corpora/trivia-questions.es.json` holds one Spanish question per English
slot with the slot's difficulty, 832 in all, so a date picks the same slot in either language
(FR-039). 495 are translations; 337 slots hold another question of the same difficulty and
category because the English one was US-centric (NHL, NFL, US states and presidents),
unsuitable for children (weapons, disasters, drugs, alcohol), dependent on English words,
outdated, doubtful (a few were plainly wrong in the source) or repeated. Most new questions
lean on Spain, Europe and Latin America. An independent review of all 832 found no wrong
answer; its fixes are in: options that were also defensible, questions that gave away
their answer, and repeats of the same fact. Categories are in Spanish and options are
sorted in Spanish order. Checked on a real render. The Spanish file keeps the Open Trivia
Database's CC BY-SA 4.0 license for the translated questions (NOTICE).

With this, every block of the list above prints in Spanish for a Spanish household, except
`phonics`, which is English by design.

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

## 5. Household chores

**Goal.** Share the housework (set the table, wash up, empty the dishwasher, put clean clothes
away, bring in the washing) among the family, not only run each child's personal routine.

**Today.** A routine holds ordered chores for one day period and is assigned to one child on a
set of weekdays (`docs/features/routines-chores.md`). That covers "Julia sets the table on
Mondays", and nothing else:

- **Children only.** An assignment to a member who is not an active child is rejected
  (FR-001), and the board has columns for children only. Adults cannot be given chores.
- **No turns.** Alternating a chore between two children means two routines with crossed
  weekdays, kept in step by hand. An odd number of days, a holiday or a swap breaks the
  pattern.
- **Weekdays only.** A chore that happens when it is needed (bring in the washing, take out
  the bins when full) has no place. The nearest tool is a daily message, which cannot be ticked.
- **One streak.** The streak asks for every chore of the day, so housework added to a child's
  board makes the personal-routine streak harder to keep.

**Workaround.** Routines "House A" and "House B" with the chores split between them and
assigned on crossed weekdays (A to one child Mon/Wed/Fri and to the other Tue/Thu; B the
opposite), placed in an afternoon or evening period so they do not hold back the morning
print.

**Options.**

- **Rotation.** A routine assigned to a group of members that takes turns by day or by week,
  with the board showing whose turn it is. Removes the crossed-weekday bookkeeping.
- **Chores for adults.** Let a routine be assigned to any active member. Touches the member
  role model (ADR-001), the board (a column per adult, or a household column) and the
  children-only rule above; the briefing trigger already tolerates a member without a column.
- **One-off and as-needed chores.** A chore for one member on one date, or an unassigned
  "whoever does it" chore that anyone can tick. Needs a dated entry beside the weekday rule.
- **Streak scope.** Let a routine opt out of the streak, so housework can be tracked without
  putting the personal streak at risk.

**Open questions.**

- Should adults' chores show on the kiosk, or only in their briefing?
- Is a turn decided per day, per week, or by who did it last?
- Does an as-needed chore belong to Routines, or is it a different thing (a shared to-do list)?

## 6. Chores on the briefing

**Observed.** The printed briefing showed the chore streak but not the chores themselves, so a
household that prints on paper had no list of what each child has to do that day.

**Done.** A `choreList` block ("Today's chores" / "Tareas de hoy") lists the member's chores
for the date by day period, each with a `[ ]` box to tick on paper. It is on by default, sits
after the agenda for a household with no stored block order, and is appended at the end for one
that already has an order (drag it in Admin → Daily briefing → Blocks). A member with no chores
that day gets no block.

**Limits.** The list is the snapshot of the moment of generation: chores ticked on the tablet
afterwards do not change the paper, and a regeneration later in the day prints the ones already
done as `[x]`. Chore emoji are not printed.

## 7. Household events

**Observed.** The agenda block listed only the events assigned to the member. An event that
names nobody ("Dentist", a relative's birthday) reached no briefing at all, although it is on
the kiosk calendar for everyone.

**Done.** The `today` block now carries a second list, `household`, with the events assigned to
nobody, printed under a "Family" / "Familia" heading after the member's own. Events assigned
only to other members stay out. A member with no event of their own still gets the block when
the household has one.

**Also done.** An agenda title was cut at 36 characters ("13:30 Prueba intolerancia gluten
pa…"). It now wraps over as many lines as it needs, aligned under its text, and is only cut at
120 characters.

**Note.** The previous behaviour was on purpose (the member filter was a tightening over the
earlier unfiltered read). This keeps the member's list strict and adds the household's beside
it; it is always on, with no per-block setting. Reminders gated on a calendar event are
unchanged: they still need an event assigned to the member.

## 8. Reusing chores

**Observed.** A chore belongs to one routine. "Brush teeth" in the morning and in the bedtime
routine is typed twice, with its icon, and so is every variant of a housework routine.

**Done (copies).** The Add chore dialog offers the chores other routines already have; picking
one fills in its name and icon. **Duplicate** copies a routine with its chores, in order, into
a new routine of the same day period, without assignments. Both are done by the admin page with
the existing API, so there is no schema change.

**Open: a shared catalogue.** Copies do not stay linked: renaming a chore does not rename its
copies. A catalogue like the recipe one (chores defined once, routines referencing them) needs
a schema change, because a completion is stored per chore: the same catalogue chore in two
routines on one day needs a completion per placement, which also reaches the board, the streak
and the admin page. Best done together with [item 5](#5-household-chores), which already
reshapes how chores, routines and members relate.

## 9. Saint's day

**Goal.** A briefing block with the Spanish _santoral_ of the day (the saints celebrated on
that date), as printed on a Spanish wall calendar.

**To investigate.**

- A source for the data and its licence, and how many saints to print per day (the calendar
  lists several; a wall calendar prints one or two).
- Shape: a local corpus keyed by day of the year, like `numberFact`, needs no network and no
  cache. February 29 needs an entry.
- It only makes sense for a Spanish household: decide whether the block is offered at all when
  the household language is English.

## 10. English word

**Goal.** A block that teaches one English word a day to a Spanish-speaking child: the word,
its explanation and its Spanish translation. It is separate from `wordOfDay`, which
[item 2](#2-english-content) turns into Spanish vocabulary for a Spanish household.

**To investigate.**

- Whether it reuses the 398 English entries of `corpora/vocabulary-entries.json`. Their levels
  (L1 to L4) were set for native speakers: L1 and L2 suit a 10 to 13 year old learning English,
  L4 ("acrimony", "circumlocution") does not.
- Which fields print: word, pronunciation, translation, explanation in Spanish, example in
  English. The current entry has no `translation` field.
- Whether it is a new block type or a mode of `wordOfDay`. A language selector that offers
  "Spanish" for an English word would mislead.
