# Feature: Quick changes (one day's changes from a phone)

Behavior reference. The changes go through the owning features' endpoints:
[meals-recipes](meals-recipes.md) (one-off entries), [calendar](calendar.md) (local events and
their assignments) and [daily-messages](daily-messages.md) (a note on a member's briefing).

The weekly plan is set up once, at the weekend. During the week small things come up: a
different dinner tomorrow, an unexpected appointment, something a child must remember.
`/admin/quick` collects those on one page sized for a phone, behind the admin PIN like the rest of
Admin.

## User workflows

### User Story 1 — Add something for one day

The parent opens Admin → Quick changes, keeps Tomorrow (the default) or picks Today or another
date, and adds one of:

- **Meal**: a slot (breakfast, lunch, snack, dinner) and free text. It is a one-off entry for
  that date, so the weekly plan stays as it was. Only while the Meals plugin is active.
- **Appointment**: a title, an optional time and the people it is for. With a time it lasts an
  hour; without one it is an all-day event.
- **Note for someone**: a member and a short text, printed on that member's daily briefing for
  that date. A member has at most one note per date, so the page says when saving replaces one.
  Only while the Daily messages plugin is active.

The phone keyboard's dictation fills any of the text fields by voice.

### User Story 2 — See and correct the day

Below the form, the page lists what the chosen day already holds: its events with their time and
people, its menu, and its notes. One-off meals and notes have a Remove button. Planned (recurring)
meals and events are changed from their own admin pages, because a change there affects other
days too.

## Requirements

- **FR-001**: The page MUST default to the household's tomorrow and never offer a past date.
- **FR-002**: A meal MUST be saved as a one-off entry (`POST /api/meal-entries`,
  `kind: "oneoff"`), never as a change to a meal plan.
- **FR-003**: An appointment with a time MUST start at that household-local time and last 60
  minutes; without a time it MUST be an all-day event for that date. Chosen people MUST be
  assigned after creation.
- **FR-004**: A note MUST upsert the member's message for that date.
- **FR-005**: After every save or removal the day's list MUST reload, and a failed save MUST
  keep what was typed and say so.
- **FR-006**: The meal and note choices MUST disappear while their plugin is inactive.
