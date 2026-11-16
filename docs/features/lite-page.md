# Feature: Lite page (today's view for an old tablet)

Behavior reference. Auth follows [auth-sessions](auth-sessions.md); the data comes from the
owning modules ([calendar](calendar.md), [routines-chores](routines-chores.md),
[meals-recipes](meals-recipes.md), [daily-briefing](daily-briefing.md)).

The SPA needs a current browser: its styles need Safari 16.4 or later. An iPad that stops at
iOS 12 (iPad mini 2 and 3, iPad Air) loads it with broken styles. `GET /lite` gives such a
tablet a read-only view of the household's day. The server renders it as plain HTML: no
framework, no external assets. The page reloads itself every five minutes.

## User workflows

### User Story 1 — Connect an old tablet once

On the tablet, open `/lite`. The access gate asks for its token as for any other page. The
page then asks for the device bootstrap key (`MP_BOOTSTRAP_KEY`). It provisions the browser
through the same `POST /api/auth/provision` the SPA uses, with a few lines of ES5, and
reloads. The device appears in Admin → Access keys like any other device, and is revoked
there.

### User Story 2 — See today at a glance

The page shows, in the household language:

1. the date and the time of the last refresh;
2. today's calendar events, all-day first, with the members they belong to;
3. today's meals by slot (only while the Meals plugin is active);
4. each child's chores by day period, done or pending, with today's progress;
5. the stored daily briefing slip of each opted-in member (only while the Daily briefing
   plugin is active), with a link to each one when there are several.

Nothing on the page writes: it marks no chore and generates no briefing. A briefing that is
not generated yet, or is being generated, says so instead of its slip.

## Requirements

- **FR-001**: `GET /lite` MUST sit behind the access gate (it is outside `/api`).
- **FR-002**: Without a device key cookie the page MUST offer the one-time setup and show no
  household data. With a key that is unknown, revoked or expired it MUST offer the setup
  again with a notice, and count the attempt in the API authentication backoff (`429` once
  it trips).
- **FR-003**: With an active device key it MUST render today's view (User Story 2) for the
  household date and timezone, refresh itself every 300 seconds and be sent `no-store`.
- **FR-004**: The page MUST NOT need any script to show the day, and its setup script MUST be
  ES5 so Safari 12 runs it. Its CSS MUST avoid features Safari 12 lacks (flex `gap`, custom
  properties).
- **FR-005**: Every household-authored text MUST be HTML-escaped. Slips are inlined as
  `data:` PNGs, so the page makes no further request.
- **FR-006**: The page MUST be read-only: it calls only read functions of the owning modules.
