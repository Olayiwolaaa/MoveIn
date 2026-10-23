# Spec: moderation

Status: APPROVED 2026-10-23
Module id: `moderation` · Depends on: identity, listings · Used by: discovery (report slot), notifications (events), listing-expiry (archive hold)
Project spec: `SPEC.md` · Uses: `ListingsService.remove/restore/extendExpiry` (LST-053, LST-056), `IdentityService.setStatus` (IDN-030, IDN-031 as amended)

## Objective

Listings go live without review, so moderation is how MoveIn keeps them honest afterwards. Students flag problems in a few taps without an account. When several people with real phone numbers report the same merchant for a scam, MoveIn takes that merchant offline at once, without waiting for an admin, and then gives the merchant a fair appeal. Every action is on record.

## Scope

In: anonymous report form with bot check; spam limits; admin report queue; remove and restore listings; manual suspension; automatic suspension on qualifying scam reports; merchant appeals; investigation and decision; making up lost listing days when a merchant is cleared; admin audit-log viewer; events for notifications.

Out: pre-publication review (decided against); verification badges; calling or messaging from inside MoveIn (admins call people from their own phones).

## Changes to approved parts

| Part     | Change                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identity | Audit-log **writer** lives in identity (built first). Moderation owns only the **viewer**.                                                                                                                                            |
| identity | **Amend IDN-031:** `setStatus` accepts an `ADMIN` actor, or the `SYSTEM` actor for automatic suspension only (MOD-050).                                                                                                               |
| listings | **Amendment A4:** new `ListingsService.extendExpiry(listingId, days, actorId, reason)` and a lifecycle step `EXPIRED → PUBLISHED` when making up lost days (LST-056, LST-057). Not counted against the 180-day renewal cap (LST-027). |

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  actorId     String
  action      String
  targetType  String
  targetId    String
  reason      String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([targetType, targetId])
  @@index([actorId, createdAt])
}
```

`actorId` is a user id, or the literal `SYSTEM` for automatic actions.

## Data model (Prisma)

```prisma
enum ReportReason {
  ALREADY_TAKEN
  WRONG_PRICE_OR_FEES
  PHOTOS_DONT_MATCH
  WRONG_LOCATION
  ASKED_FOR_MONEY_UPFRONT
  FAKE_OR_SCAM
  OFFENSIVE
  OTHER
}
enum ReportStatus { OPEN ACTIONED DISMISSED }
enum SuspensionKind { MANUAL AUTOMATIC }
enum SuspensionState { UNDER_REVIEW CONFIRMED CLEARED }

model Report {
  id              String       @id @default(uuid())
  listingId       String
  merchantId      String
  reason          ReportReason
  details         String?
  reporterPhone   String?
  reporterHash    String
  qualifying      Boolean      @default(false)
  status          ReportStatus @default(OPEN)
  suspensionId    String?
  resolvedById    String?
  resolution      String?
  resolvedAt      DateTime?
  createdAt       DateTime     @default(now())

  @@index([status, listingId])
  @@index([merchantId, qualifying, createdAt])
  @@index([reporterHash, createdAt])
}

model Suspension {
  id              String          @id @default(uuid())
  merchantId      String
  kind            SuspensionKind
  state           SuspensionState
  reason          String
  startedAt       DateTime        @default(now())
  endedAt         DateTime?
  appealText      String?
  appealedAt      DateTime?
  decidedById     String?
  decisionNote    String?
  decidedAt       DateTime?
  hiddenListings  SuspendedListing[]
  reports         Report[]

  @@index([merchantId, state])
}

model SuspendedListing {
  suspensionId     String
  suspension       Suspension @relation(fields: [suspensionId], references: [id])
  listingId        String
  expiresAtBefore  DateTime

  @@id([suspensionId, listingId])
}
```

`reporterHash` = SHA-256 of IP address + user agent + a server secret. Raw IP addresses are never stored.

**Qualifying report** = reason `FAKE_OR_SCAM` or `ASKED_FOR_MONEY_UPFRONT`, with a valid Nigerian phone number (same check as IDN-022), not ignored by any spam rule (MOD-010 to MOD-016).

## Interfaces

**HTTP (API)**

| Method | Path                             | Who                | Purpose                                                   |
| ------ | -------------------------------- | ------------------ | --------------------------------------------------------- |
| POST   | `/public/listings/:id/reports`   | public (Turnstile) | Submit a report                                           |
| GET    | `/admin/reports`                 | admin              | Queue, grouped by listing                                 |
| POST   | `/admin/reports/:id/dismiss`     | admin              | Dismiss one report                                        |
| POST   | `/admin/listings/:id/remove`     | admin              | Remove listing; actions its open reports                  |
| POST   | `/admin/listings/:id/restore`    | admin              | Restore listing                                           |
| POST   | `/admin/users/:id/suspend`       | admin              | Manual suspension                                         |
| GET    | `/admin/suspensions`             | admin              | Suspensions under review, appeals first                   |
| GET    | `/admin/suspensions/:id`         | admin              | Case: merchant, reports, reporter phones, appeal, history |
| POST   | `/admin/suspensions/:id/clear`   | admin              | Clear merchant; make up lost days                         |
| POST   | `/admin/suspensions/:id/confirm` | admin              | Keep merchant suspended                                   |
| GET    | `/me/suspension`                 | merchant           | Current suspension, reason, appeal state                  |
| POST   | `/me/suspension/appeal`          | merchant           | Submit appeal                                             |
| GET    | `/admin/audit`                   | admin              | Audit log                                                 |

**Events emitted** (in-process, for notifications)

| Event                                        | When                                     |
| -------------------------------------------- | ---------------------------------------- |
| `listing.removed`, `listing.restored`        | MOD-021, MOD-023                         |
| `listing.takenReported`                      | MOD-017                                  |
| `merchant.suspended`                         | MOD-030 (manual)                         |
| `merchant.autoSuspended`                     | MOD-050 — emails every admin immediately |
| `suspension.appealed`                        | MOD-061 — emails every admin             |
| `suspension.cleared`, `suspension.confirmed` | MOD-071, MOD-073 — emails the merchant   |

**Web routes**

| Route                                     | Purpose                                         |
| ----------------------------------------- | ----------------------------------------------- |
| Report slot on `/listings/:id`            | "Report this listing" link opening a short form |
| `/dashboard` (suspended)                  | Banner with reason and Appeal button            |
| `/dashboard/appeal`                       | Appeal form and status                          |
| `/admin/reports`                          | Report queue                                    |
| `/admin/suspensions`                      | Cases under review                              |
| `/admin/suspensions/:id`                  | One case with everything needed to investigate  |
| `/admin/listings/:id`, `/admin/users/:id` | Listing or merchant detail with actions         |
| `/admin/audit`                            | Audit log                                       |

## Requirements

### Reporting

| Id      | Requirement                                                                                                                                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-001 | The detail page shall show a "Report this listing" link on every public listing, usable without an account (SYS-003).                                                                                                                                                                                       |
| MOD-002 | When a visitor submits a report, the API shall require one reason from `ReportReason`, accept optional details up to 500 characters (required, 10–500, for `OTHER`), and accept an optional phone number.                                                                                                   |
| MOD-003 | When a visitor picks `FAKE_OR_SCAM` or `ASKED_FOR_MONEY_UPFRONT`, the form shall ask for a phone number with the text: "Please leave a phone number so our team can follow up. We'll only use it to look into this report, and the merchant won't see it." The visitor shall be able to submit without one. |
| MOD-004 | When a report is accepted, the web app shall thank the visitor and shall not show whether other reports exist.                                                                                                                                                                                              |
| MOD-005 | The API shall accept reports only for listings that are currently public (LST-050), and respond 404 otherwise.                                                                                                                                                                                              |
| MOD-006 | The API shall show `reporterPhone` only to admins, never to the merchant, and never in any public response (SYS-012).                                                                                                                                                                                       |
| MOD-007 | When a report has a scam reason and a valid Nigerian phone number, the API shall store the number in E.164 form and mark the report `qualifying`.                                                                                                                                                           |

### Spam and bot protection

| Id      | Requirement                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-010 | The report form shall include a Cloudflare Turnstile check, and the API shall verify the token with Cloudflare before storing the report.                                                           |
| MOD-011 | If the Turnstile token is missing, expired or fails verification, then the API shall respond 400 and store nothing, and the web app shall ask the visitor to try again.                             |
| MOD-012 | If the same `reporterHash` reports the same listing again within 24 hours, then the API shall respond as if accepted and store nothing.                                                             |
| MOD-013 | If the same `reporterHash` submits more than 5 reports in an hour, then the API shall respond 429 for the rest of that hour.                                                                        |
| MOD-014 | If the form's hidden honeypot field is filled in, then the API shall respond as if accepted and store nothing.                                                                                      |
| MOD-015 | If a signed-in merchant reports their own listing, then the API shall ignore the report.                                                                                                            |
| MOD-016 | If the same reporter phone number has already filed a qualifying report against the same merchant, then the API shall store the new report but not mark it `qualifying`.                            |
| MOD-017 | When a listing receives `ALREADY_TAKEN` reports from 2 different reporters within 7 days, the API shall emit `listing.takenReported` so notifications can ask the merchant to confirm availability. |

### Report queue and listing actions

| Id      | Requirement                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOD-020 | When an admin opens `/admin/reports`, the web app shall list listings with open reports, sorted first by open qualifying reports, then other scam-reason reports, then number of open reports, then newest report. |
| MOD-021 | When an admin removes a listing, the API shall require a reason of 10–500 characters, call `ListingsService.remove`, set every open report on that listing to `ACTIONED`, and emit `listing.removed`.              |
| MOD-022 | When an admin dismisses a report, the API shall require a short resolution note, set it `DISMISSED`, and write an audit record.                                                                                    |
| MOD-023 | When an admin restores a removed listing, the API shall require a reason, call `ListingsService.restore`, and emit `listing.restored`.                                                                             |
| MOD-024 | The merchant dashboard shall show a removed listing with the admin's reason and the support contact, and the listing shall not be editable (LST-008).                                                              |
| MOD-025 | Removing a listing shall not return its slot (BIL-045).                                                                                                                                                            |

### Manual suspension

| Id      | Requirement                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOD-030 | When an admin suspends a merchant, the API shall require a reason, create a `MANUAL` suspension in state `CONFIRMED`, call `IdentityService.setStatus(SUSPENDED)`, and emit `merchant.suspended`.                                                                  |
| MOD-031 | While a merchant is suspended for any reason, all their listings shall be hidden from public view (LST-050), and their unused slots shall be kept.                                                                                                                 |
| MOD-032 | While a merchant has a `CONFIRMED` suspension, listing time shall keep running, and no lost days shall be made up if they are later reinstated.                                                                                                                    |
| MOD-033 | When an admin reinstates a merchant with a `CONFIRMED` suspension, the API shall require a reason, set the suspension `endedAt`, set status `ACTIVE`, and emit `merchant.reinstated`; listings whose `expiresAt` is still in the future shall become public again. |
| MOD-034 | If an admin tries to suspend another admin, then the API shall reject it; admin access must be revoked first (IDN-040).                                                                                                                                            |

### Automatic suspension

| Id      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-050 | When a merchant's listings receive qualifying reports from 3 different reporter phone numbers within 48 hours, the API shall, in one transaction, create an `AUTOMATIC` suspension in state `UNDER_REVIEW`, link those reports to it, record each currently `PUBLISHED` listing and its `expiresAt` in `SuspendedListing`, call `IdentityService.setStatus(SUSPENDED)` with actor `SYSTEM`, write an audit record, and emit `merchant.autoSuspended`. |
| MOD-051 | When a merchant is automatically suspended, the notifications module shall email every admin within 5 minutes with the merchant's name, the listings and the reports.                                                                                                                                                                                                                                                                                 |
| MOD-052 | If the merchant already has a suspension in `UNDER_REVIEW` or `CONFIRMED`, then new qualifying reports shall be linked to it and shall not create another.                                                                                                                                                                                                                                                                                            |
| MOD-053 | Qualifying reports created before a suspension was cleared shall never count toward a new automatic suspension.                                                                                                                                                                                                                                                                                                                                       |
| MOD-054 | While a merchant's suspension is `UNDER_REVIEW`, listing-expiry shall not archive any of their listings.                                                                                                                                                                                                                                                                                                                                              |
| MOD-055 | While a merchant's suspension is `UNDER_REVIEW`, their dashboard shall show "Your account is under review", the reason, and an Appeal button; it shall not show reporter phone numbers or report details that would identify a reporter.                                                                                                                                                                                                              |

### Appeals

| Id      | Requirement                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-060 | While a merchant's suspension is `UNDER_REVIEW` and has no appeal, the merchant shall be able to submit one appeal of 20–1,000 characters, plus an optional second phone number to reach them on. The appeal page shall say "We aim to review your appeal within 48 hours."  |
| MOD-061 | When an appeal is submitted, the API shall store it, write an audit record, and emit `suspension.appealed`.                                                                                                                                                                  |
| MOD-062 | If a merchant tries to appeal twice, or appeal a `CONFIRMED` or `CLEARED` suspension, then the API shall reject it.                                                                                                                                                          |
| MOD-063 | When an admin opens `/admin/suspensions`, the web app shall list `UNDER_REVIEW` cases, appealed ones first, then oldest first, with time since suspension, and shall highlight any case open longer than 36 hours so it is decided inside the 48-hour target.                |
| MOD-064 | When an admin opens a case, the web app shall show the merchant's profile and phone numbers, every linked report with reason, details, time and reporter phone, the appeal, the merchant's listings, past suspensions and payment history, so the admin can call both sides. |
| MOD-065 | Where an admin wants to record a call or finding, the case page shall let them add notes, each saved as an audit record.                                                                                                                                                     |

### Decision

| Id      | Requirement                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-070 | An admin shall be able to clear or confirm an `UNDER_REVIEW` suspension at any time, with or without an appeal, and shall give a decision note of 10–1,000 characters.                                                                                                                                                                                                                  |
| MOD-071 | When an admin clears a suspension, the API shall, in one transaction: set it `CLEARED` with `endedAt`; set the merchant `ACTIVE`; set its linked reports `DISMISSED`; and for each `SuspendedListing`, call `ListingsService.extendExpiry` by the whole days between `startedAt` and now, rounded up, so the listing gets back every day it was hidden; then emit `suspension.cleared`. |
| MOD-072 | Where a listing in `SuspendedListing` expired while hidden, clearing shall return it to `PUBLISHED` with `expiresAt` = its `expiresAtBefore` + the lost days (LST-057).                                                                                                                                                                                                                 |
| MOD-073 | When an admin confirms a suspension, the API shall set it `CONFIRMED`, set its linked reports `ACTIONED`, write an audit record, and emit `suspension.confirmed`; from then on MOD-032 and MOD-033 apply.                                                                                                                                                                               |
| MOD-074 | Clearing or confirming shall never change the merchant's paid or unused slots.                                                                                                                                                                                                                                                                                                          |

### Audit log viewer

| Id      | Requirement                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOD-080 | When an admin opens `/admin/audit`, the web app shall list audit records newest first with actor (`SYSTEM` shown as "Automatic"), action, target, reason and time in Africa/Lagos (SYS-008), filterable by actor, action, target and date range. |
| MOD-081 | The API shall offer no endpoint that edits or deletes audit records.                                                                                                                                                                             |

## Acceptance tests

- Scam report with phone number is `qualifying`; same reason without a phone is not (MOD-007).
- Report without a valid Turnstile token returns 400 and stores nothing (MOD-011).
- The same phone number reporting a merchant twice counts once (MOD-016).
- Three qualifying reports from three phone numbers within 48 hours: merchant `SUSPENDED`, every listing gone from search, one `AUTOMATIC` suspension, audit row with actor `SYSTEM`, admins emailed (MOD-050, MOD-051).
- Three reports spread over 72 hours, or three without phone numbers: no suspension, reports top the queue (MOD-050, MOD-020).
- Merchant sees "under review" and the Appeal button, but no reporter phone (MOD-055); second appeal rejected (MOD-062).
- Listing expiring during a 4-day review is not archived (MOD-054); after clearing it is `PUBLISHED` with 4 days added to its old expiry (MOD-071, MOD-072).
- A listing with 20 days left, cleared after a 2.5-day review, gets 3 days added (MOD-071).
- Confirming leaves the merchant suspended with slots untouched; a later reinstatement adds no days (MOD-073, MOD-032, MOD-074).
- After a cleared case, two new qualifying reports plus one from before clearance do not trigger suspension (MOD-053).
- Suspending an admin is rejected (MOD-034); public listing JSON never contains `reporterPhone` (MOD-006).

## Decisions (2026-10-23)

1. **Support contact:** deferred. The web app reads it from `SUPPORT_EMAIL` and `SUPPORT_WHATSAPP` environment variables, so it can be set before launch without a code change. Listed in the launch checklist in `SPEC.md`.
2. **Review target:** under 48 hours (MOD-060, MOD-063).
3. **Reporter follow-up:** admins call reporters themselves; no automatic SMS in v1.
