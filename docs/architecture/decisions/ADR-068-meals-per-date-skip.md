# ADR-068 — Meals: skip a recurring entry on one date

- **Status**: accepted (2026-11-16)
- **Supersedes**: the "no per-occurrence skip (option A)" part of `ADR-045`.
- **Context**: on the home deployment the weekly plan is set at the weekend and changed day to
  day from the phone (Admin → Quick changes). A one-off meal is added alongside the plan, so
  "Pisto instead of Garbanzos on Tuesday" showed both. Editing the recurring entry changes every
  Tuesday. `ADR-045` left option B (a per-date tombstone) as a later addition.

## Decision

Option B: a `meal_entry_skips` row `(entry_id, skip_date)` leaves that recurring entry out of
that date's derived menu. Nothing else changes.

- The derived day menu (and the week grid and every consumer built on it: Home, `/lite`, the
  daily briefing) drops the recurring entries skipped on the date. One-off entries cannot be
  skipped; they are deleted.
- `PUT /api/meal-entries/{id}/skips/{date}` skips, `DELETE` puts it back; both are idempotent.
  The date must fall on the entry's weekday. `GET /api/menu/skipped?date=` lists the skipped
  entries so a client can offer to put them back.
- Deleting the entry deletes its skips (`ON DELETE CASCADE`). Editing or deactivating an entry
  or plan still changes every matching weekday.
- Migration `0003_meal_entry_skips.sql`.

## Consequences

- Quick changes offers "instead of" (the default) or "as well" when a meal is added to a slot
  the plan already fills, and a "remove for this day only" / "put back" button per planned meal.
- The full admin meal pages do not show skips yet; a skipped meal is visible only on the quick
  changes page for that date.
