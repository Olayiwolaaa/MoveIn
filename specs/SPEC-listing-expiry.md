# Spec: listing-expiry

Status: APPROVED 2026-10-23
Module id: `listing-expiry` · Depends on: listings, billing, notifications · Respects: moderation (MOD-054)
Project spec: `SPEC.md` · Uses: `ListingsService.markExpired` / `archive` (LST-050 to LST-055)

## Objective

Keep search free of stale listings without anyone doing it by hand. Merchants get reminded before their paid time runs out, a listing drops out of search the moment it expires, and it's archived (soft deleted) after a grace period. Live listings whose availability hasn't been confirmed for a while get a nudge, so students see fresher information.

## Scope

In: scheduled jobs for reminders, expiry, archiving and availability nudges; copying an archived listing into a new draft.

Out: renewal itself (listings + billing, LST-025 to LST-027); payment; emails themselves (notifications); auto-archiving drafts.

## Timings

All values are environment settings so they can change without a code change.

| Setting                     | Default | Meaning                                                     |
| --------------------------- | ------- | ----------------------------------------------------------- |
| `EXPIRY_REMINDER_DAYS`      | 5       | First reminder this many days before `expiresAt`            |
| `EXPIRY_LAST_REMINDER_DAYS` | 1       | Last reminder this many days before `expiresAt`             |
| `ARCHIVE_GRACE_DAYS`        | 14      | Archive this many days after `expiresAt`                    |
| `AVAILABILITY_STALE_DAYS`   | 14      | Nudge when availability hasn't been confirmed for this long |

With a 30-day plan: live day 0, first reminder day 25, last reminder day 29, hidden day 30, archived day 44.

**Visibility doesn't wait for the job.** The public rule already checks `expiresAt` in the future (LST-050), so a listing leaves search the second it expires, even if the job runs late. The job only updates the stored status and sends email.

## Data model

No new tables. Reminders and nudges use notification `dedupeKey`s so each is sent once:

| Notification       | `dedupeKey`                                 |
| ------------------ | ------------------------------------------- |
| First reminder     | `expiring:<listingId>:<expiresAt ISO>`      |
| Last reminder      | `expiring-last:<listingId>:<expiresAt ISO>` |
| Expired            | `expired:<listingId>:<expiresAt ISO>`       |
| Archived           | `archived:<listingId>`                      |
| Availability nudge | `stale:<listingId>:<availabilityAt ISO>`    |

Because the key includes `expiresAt`, renewing a listing (which moves `expiresAt`) automatically starts a fresh reminder cycle.

## Interfaces

**Jobs** (NestJS scheduler, each behind a Postgres advisory lock, NTF-009)

| Job                        | Runs                     | Does               |
| -------------------------- | ------------------------ | ------------------ |
| `expire-listings`          | every 15 min             | EXP-001 to EXP-004 |
| `send-expiry-reminders`    | hourly                   | EXP-010 to EXP-013 |
| `archive-listings`         | daily 03:00 Africa/Lagos | EXP-020 to EXP-023 |
| `nudge-stale-availability` | daily 09:00 Africa/Lagos | EXP-030 to EXP-033 |

**HTTP (API)** — amendment to listings (A5)

| Method | Path                 | Who             | Purpose                                                    |
| ------ | -------------------- | --------------- | ---------------------------------------------------------- |
| POST   | `/listings/:id/copy` | owning merchant | Copy an `ARCHIVED` or `EXPIRED` listing into a new `DRAFT` |

## Requirements

### Expiry

| Id      | Requirement                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-001 | When the expire job finds a `PUBLISHED` listing whose `expiresAt` has passed, it shall call `ListingsService.markExpired` and queue `listing.expired`, in one transaction. |
| EXP-002 | The expire job shall process listings in batches of 200 until none are left, so a backlog after downtime clears in one run.                                                |
| EXP-003 | If the expire job fails partway, then listings already expired shall stay expired and the next run shall continue with the rest.                                           |
| EXP-004 | Expiring a listing shall not change its availability, fees, photos or stats, so renewing brings it back exactly as it was.                                                 |

### Reminders

| Id      | Requirement                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXP-010 | When a `PUBLISHED` listing's `expiresAt` is within `EXPIRY_REMINDER_DAYS`, the reminder job shall queue `listing.expiringSoon` with the expiry date and slots the merchant has left. |
| EXP-011 | When a `PUBLISHED` listing's `expiresAt` is within `EXPIRY_LAST_REMINDER_DAYS`, the reminder job shall queue `listing.expiringTomorrow`.                                             |
| EXP-012 | Where a listing's whole paid period is shorter than `EXPIRY_REMINDER_DAYS` (for example a short free trial), the job shall send only the last reminder.                              |
| EXP-013 | If the listing has already been renewed beyond the reminder window, or its merchant is suspended, then the job shall send no reminder.                                               |
| EXP-014 | When several of one merchant's listings need the same reminder on the same day, the job shall send one email listing them all.                                                       |

### Archiving

| Id      | Requirement                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-020 | When an `EXPIRED` or `REMOVED` listing's `expiresAt` is more than `ARCHIVE_GRACE_DAYS` in the past, the archive job shall call `ListingsService.archive(GRACE_ENDED)` and, for `EXPIRED` listings, queue `listing.archived`. |
| EXP-021 | While the listing's merchant has a suspension `UNDER_REVIEW`, the archive job shall skip their listings (MOD-054).                                                                                                           |
| EXP-022 | Archiving shall keep the listing, fees, photo records and stats (LST-054), and shall not delete photos from Cloudinary.                                                                                                      |
| EXP-023 | The archive job shall never archive a `DRAFT`; drafts stay until the merchant deletes them (the 20-draft limit, LST-003, stops buildup).                                                                                     |

### Availability nudges

| Id      | Requirement                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-030 | When a public listing marked `AVAILABLE` has `availabilityAt` older than `AVAILABILITY_STALE_DAYS`, the nudge job shall queue `listing.checkAvailability` with one-tap links (NTF-030). |
| EXP-031 | The nudge job shall send at most one nudge per listing per `AVAILABILITY_STALE_DAYS` period, and none in the last `EXPIRY_LAST_REMINDER_DAYS` before expiry.                            |
| EXP-032 | When the merchant confirms availability by any route (dashboard, one-tap link, edit), `availabilityAt` resets and the next nudge waits another full period.                             |
| EXP-033 | Where a `listing.takenReported` nudge (MOD-017) was sent in the last 7 days, the nudge job shall skip that listing.                                                                     |

### Copy to new draft (Amendment A5 to listings)

| Id      | Requirement                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-040 | When a merchant copies an `ARCHIVED` or `EXPIRED` listing they own, the API shall create a new `DRAFT` with the same details, fees and photo references, availability `AVAILABLE`, and no `publishedAt` or `expiresAt`. |
| EXP-041 | Copying shall not change the original listing and shall count toward the 20-draft limit (LST-003).                                                                                                                      |
| EXP-042 | If the original's campus or area has since been deactivated (LST-064), then the copy shall leave that field empty for the merchant to choose again.                                                                     |

## Acceptance tests

- Listing with `expiresAt` 10 minutes ago is absent from search immediately, and `EXPIRED` after the next job run (LST-050, EXP-001).
- 1,000 overdue listings after an outage all expire in one run (EXP-002).
- 30-day listing: reminder on day 25, last reminder on day 29, each once (EXP-010, EXP-011).
- Renewing on day 26 starts a new reminder cycle for the new expiry date, with no further emails for the old one (dedupe keys).
- 3-day free trial: only the last reminder is sent (EXP-012).
- Merchant with 4 listings expiring on the same day gets one email (EXP-014).
- Listing expired 15 days ago is archived; one whose merchant is under review is not (EXP-020, EXP-021).
- Drafts are never archived by the job (EXP-023).
- Listing unconfirmed for 15 days gets one nudge; confirming via the link resets the clock (EXP-030, EXP-032).
- Copying an archived listing gives a new draft with the same photos; a deactivated area comes through empty (EXP-040, EXP-042).

## Decisions (2026-10-23)

1. **Timings:** defaults approved (5-day and 1-day reminders, archive after 14 days, availability nudge every 14 days).
2. **Amendment A5 (copy to new draft):** approved.
