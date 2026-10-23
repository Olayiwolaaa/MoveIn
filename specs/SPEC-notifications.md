# Spec: notifications

Status: APPROVED 2026-10-23
Module id: `notifications` · Depends on: identity · Listens to events from: billing, moderation, listing-expiry
Project spec: `SPEC.md` · Email provider: Resend

## Objective

Tell merchants and admins, by email, about the things they need to act on: a payment went through, a listing is about to expire, a listing was removed, an account is under review. Let a merchant confirm whether a room is still available in one tap from the email, without signing in, because rooms listed as free when they're already taken are the main thing students complain about.

## Scope

In: transactional email to merchants and admins through Resend; an outbox so no email is lost or sent twice; email templates; one-tap "still available / now taken" links; handling bounced addresses.

Out: email to students or reporters; SMS; WhatsApp messages from MoveIn; push notifications; marketing email or newsletters.

## How it works

1. A module changes something (for example billing marks an order paid) and, **in the same database transaction**, writes a row to the `Notification` outbox. If the change rolls back, the email is never queued.
2. A worker picks up pending rows every 30 seconds and sends them through Resend, using the row id as the Resend idempotency key.
3. Failures retry with backoff, then show up for admins.

## Data model (Prisma)

```prisma
enum NotificationStatus { PENDING SENT FAILED SKIPPED }

model Notification {
  id            String             @id @default(uuid())
  type          String
  dedupeKey     String             @unique
  recipientId   String?
  toEmail       String
  payload       Json
  status        NotificationStatus @default(PENDING)
  attempts      Int                @default(0)
  nextAttemptAt DateTime           @default(now())
  lastError     String?
  providerId    String?
  sentAt        DateTime?
  createdAt     DateTime           @default(now())

  @@index([status, nextAttemptAt])
}

model ActionToken {
  id          String    @id @default(uuid())
  listingId   String
  merchantId  String
  expiresAt   DateTime
  usedAt      DateTime?
  usedAction  String?
  createdAt   DateTime  @default(now())
}
```

Identity gets one field: `User.emailBouncedAt DateTime?` (Amendment I3).

## Interfaces

**Service (called by other modules inside their transactions)**

```ts
interface NotificationsService {
  enqueue(
    tx: Prisma.TransactionClient,
    n: {
      type: NotificationType;
      dedupeKey: string;
      recipientId?: string;
      toAdmins?: boolean;
      payload: Record<string, unknown>;
    },
  ): Promise<void>;
}
```

**HTTP (API)**

| Method | Path                          | Who                  | Purpose                                                 |
| ------ | ----------------------------- | -------------------- | ------------------------------------------------------- |
| GET    | `/public/availability/:token` | anyone with the link | Show listing title and the two buttons; changes nothing |
| POST   | `/public/availability/:token` | anyone with the link | Body `{ action: "available" \| "taken" }`               |
| POST   | `/webhooks/resend`            | Resend (signed)      | Bounce and complaint events                             |
| GET    | `/admin/notifications`        | admin                | Failed and recent emails; resend a failed one           |

**Web routes**

| Route                  | Purpose                             |
| ---------------------- | ----------------------------------- |
| `/availability/:token` | One-tap confirmation page           |
| `/admin/notifications` | Failed emails, with a Resend button |

## Email catalogue

All emails are in English, plain and short, with one main button. Times are in Africa/Lagos (SYS-008).

| Type                           | To       | Sent when                                                         | Main button                       |
| ------------------------------ | -------- | ----------------------------------------------------------------- | --------------------------------- |
| `merchant.welcome`             | merchant | Local user created (IDN-002, IDN-003)                             | Complete your profile             |
| `payment.received`             | merchant | Order `PAID` (BIL-025)                                            | View slots                        |
| `payment.held`                 | merchant | Order `HELD_FOR_REVIEW` (BIL-026)                                 | — ("We're checking your payment") |
| `payment.held.admin`           | admins   | Order `HELD_FOR_REVIEW`                                           | Open order                        |
| `trial.granted`                | merchant | Free trial granted (BIL-050)                                      | Create a listing                  |
| `listing.published`            | merchant | Listing first goes `PUBLISHED` (LST-022)                          | View listing                      |
| `listing.expiringSoon`         | merchant | 5 days before expiry (EXP-010)                                    | Renew                             |
| `listing.expiringTomorrow`     | merchant | 1 day before expiry (EXP-011)                                     | Renew                             |
| `listing.expired`              | merchant | Listing `EXPIRED` (EXP-001)                                       | Renew                             |
| `listing.archived`             | merchant | Listing archived after grace (EXP-020)                            | Copy to new draft                 |
| `listing.removed`              | merchant | Admin removes listing (MOD-021)                                   | — (reason and support contact)    |
| `listing.restored`             | merchant | Admin restores listing (MOD-023)                                  | View listing                      |
| `listing.checkAvailability`    | merchant | `listing.takenReported` (MOD-017) or stale availability (EXP-030) | Still available / Now taken       |
| `merchant.suspended`           | merchant | Manual suspension (MOD-030)                                       | — (reason and support contact)    |
| `merchant.underReview`         | merchant | Automatic suspension (MOD-050)                                    | Appeal                            |
| `merchant.autoSuspended.admin` | admins   | Automatic suspension (MOD-050, MOD-051)                           | Open case                         |
| `suspension.appealed.admin`    | admins   | Appeal submitted (MOD-061)                                        | Open case                         |
| `suspension.cleared`           | merchant | Case cleared (MOD-071)                                            | View listings                     |
| `suspension.confirmed`         | merchant | Case confirmed (MOD-073)                                          | — (support contact)               |
| `merchant.reinstated`          | merchant | Reinstated (MOD-033)                                              | View listings                     |

## Requirements

### Delivery

| Id      | Requirement                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NTF-001 | When a module calls `enqueue`, the API shall write the `Notification` row in the caller's transaction, so the email is queued only if the change commits.      |
| NTF-002 | If `enqueue` is called with a `dedupeKey` that already exists, then the API shall skip it without error.                                                       |
| NTF-003 | Every 30 seconds, the worker shall send up to 50 `PENDING` rows whose `nextAttemptAt` has passed, through Resend, with the row id as the idempotency key.      |
| NTF-004 | When Resend accepts an email, the API shall set the row `SENT` with `sentAt` and `providerId`.                                                                 |
| NTF-005 | If sending fails, then the API shall retry after 1 minute, 5 minutes, 30 minutes and 2 hours, and after the fifth failure set the row `FAILED` with the error. |
| NTF-006 | Where `toAdmins` is set, the API shall create one row per user with role `ADMIN` and status `ACTIVE`.                                                          |
| NTF-007 | The API shall send merchant emails to the email stored on the local user (IDN-004), and admin emails to each admin's email.                                    |
| NTF-008 | `merchant.autoSuspended.admin` shall be sent within 5 minutes of the suspension (MOD-051).                                                                     |
| NTF-009 | The worker shall take a Postgres advisory lock before each run, so only one API instance sends at a time.                                                      |
| NTF-010 | The API shall send from `MAIL_FROM` and read the support contact from `SUPPORT_EMAIL` / `SUPPORT_WHATSAPP`, all set in environment variables.                  |

### Content

| Id      | Requirement                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NTF-020 | Each email shall have a plain-text version as well as HTML, and shall read clearly on a small phone screen.                                                                                                                                                                                |
| NTF-021 | Emails shall never contain a reporter's phone number, report details that identify a reporter, payment card details, or any secret.                                                                                                                                                        |
| NTF-022 | Links in emails shall go to MoveIn pages that require sign-in, except one-tap availability links (NTF-030).                                                                                                                                                                                |
| NTF-023 | Where a listing's availability is `TAKEN` or `UNAVAILABLE`, the expiry reminder shall say no action is needed unless the room is free again.                                                                                                                                               |
| NTF-024 | When a local merchant user is created, the API shall queue `merchant.welcome` once (dedupe key `welcome:<userId>`), explaining in three short steps: complete your profile, buy a plan or use a free trial, publish a listing; it shall not be sent to users seeded or promoted as admins. |

### One-tap availability links

| Id      | Requirement                                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NTF-030 | When `listing.checkAvailability` is queued, the API shall create an `ActionToken` for that listing and merchant, valid for 7 days, and put `/availability/<token id>` in the email.                                                       |
| NTF-031 | When someone opens `/availability/:token`, the web app shall show the listing title and two buttons, "Still available" and "Now taken", and shall change nothing on page load, so email scanners that open links don't trigger an action. |
| NTF-032 | When a button is pressed with a valid, unused, unexpired token, the API shall set availability (LST-040), set `availabilityAt` to now, mark the token used, and show a thank-you page with a link to the dashboard.                       |
| NTF-033 | If the token is expired, already used, or its listing is no longer `PUBLISHED`, then the API shall change nothing and the page shall ask the merchant to sign in and update the listing from the dashboard.                               |
| NTF-034 | A token shall allow only setting availability on its one listing, and nothing else.                                                                                                                                                       |
| NTF-035 | If the merchant has been suspended or deleted since the token was created, then the API shall reject the action.                                                                                                                          |

### Bounces

| Id      | Requirement                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NTF-040 | When Resend reports a hard bounce or spam complaint for an address, the API shall set `User.emailBouncedAt` and mark that user's pending emails `SKIPPED`.                                       |
| NTF-041 | While a merchant's `emailBouncedAt` is set, the API shall skip new emails to them, and the merchant dashboard shall show "We can't reach your email. Please update it in your account settings." |
| NTF-042 | When the merchant's email changes (IDN-004), the API shall clear `emailBouncedAt`.                                                                                                               |
| NTF-043 | If a Resend webhook has an invalid signature, then the API shall respond 400 and change nothing.                                                                                                 |

### Admin view

| Id      | Requirement                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NTF-050 | When an admin opens `/admin/notifications`, the web app shall list `FAILED` and `SKIPPED` emails with type, recipient, error and time, and the last 100 sent emails. |
| NTF-051 | When an admin presses Resend on a failed email, the API shall set it back to `PENDING` with attempts reset and write an audit record (SYS-009).                      |

## Acceptance tests

- Billing transaction rolls back after `enqueue`: no notification row (NTF-001).
- Same `dedupeKey` enqueued twice: one email (NTF-002).
- Resend returns 500 four times then 200: email sent once, `attempts` = 5 (NTF-005).
- Resend down for 3 hours: row `FAILED`, shown on `/admin/notifications`; Resend button sends it (NTF-005, NTF-051).
- Automatic suspension: every active admin emailed within 5 minutes (NTF-006, NTF-008).
- Opening an availability link changes nothing; pressing "Now taken" sets `TAKEN`; pressing again shows the "sign in" page (NTF-031 to NTF-033).
- Token for listing A can't change listing B (NTF-034).
- Hard bounce: dashboard banner shown, later emails skipped; email change clears it (NTF-040 to NTF-042).
- Two API instances running: each email sent once (NTF-009).
- No email body contains a reporter phone number (NTF-021).

## Decisions (2026-10-23)

1. **Sending domain:** set before launch through `MAIL_FROM` (launch checklist in `SPEC.md`).
2. **Welcome email:** included (NTF-024).
