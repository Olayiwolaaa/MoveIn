# Spec: contact-tracking

Status: APPROVED 2026-10-23
Module id: `contact-tracking` · Depends on: discovery, listings · Used by: merchant dashboard, admin dashboard
Project spec: `SPEC.md` · Renders in the contact slot on `/listings/:id` (DSC-034)

## Objective

Make it one tap for a student to call or WhatsApp a merchant, and count those taps reliably. These counts are MoveIn's proof to merchants that paying to list gets them real leads, and the signal for whether the pilot is working.

## Scope

In: Call and WhatsApp buttons; giving out the merchant's number only when a button is tapped; counting views and contact taps; filtering out self-taps and bots; merchant and admin stats.

Out: in-app chat; call recording or confirming that a call connected; SMS; lead forms.

## Design decisions

- **The number is fetched when a button is tapped.** The detail page does not contain the merchant's phone number. Tapping Call or WhatsApp asks the API for it, and the API records the tap at the same moment. Counts can't be skipped by copying the number off the page, and scrapers can't collect numbers in bulk.
- **WhatsApp opens with a pre-filled message** naming MoveIn and the listing link, so merchants can see which leads came from MoveIn.
- **Visitors are counted without accounts or cookies**, using a hash of IP address, user agent and a daily-rotating secret. It can't be reversed to an IP, and it resets each day.

## Data model (Prisma)

```prisma
enum ContactChannel { CALL WHATSAPP }
enum EventKind { VIEW CALL WHATSAPP }

model ListingEvent {
  id           String    @id @default(uuid())
  listingId    String
  kind         EventKind
  visitorHash  String
  createdAt    DateTime  @default(now())

  @@index([listingId, kind, createdAt])
  @@index([visitorHash, listingId, kind, createdAt])
}

model ListingDailyStats {
  listingId        String
  day              DateTime @db.Date
  views            Int      @default(0)
  uniqueViews      Int      @default(0)
  calls            Int      @default(0)
  whatsapps        Int      @default(0)
  uniqueContacts   Int      @default(0)

  @@id([listingId, day])
}
```

## Interfaces

**HTTP (API)** — public.

| Method | Path                           | Purpose                                                                    |
| ------ | ------------------------------ | -------------------------------------------------------------------------- |
| POST   | `/public/listings/:id/view`    | Record a view (sent from the browser after the page loads)                 |
| POST   | `/public/listings/:id/contact` | Body `{ channel }`; records the tap and returns the `tel:` or `wa.me` link |

**HTTP (API)** — merchant and admin.

| Method | Path                     | Who      | Purpose                                                 |
| ------ | ------------------------ | -------- | ------------------------------------------------------- |
| GET    | `/me/listings/stats`     | merchant | Per-listing counts for 7 days, 30 days, all time        |
| GET    | `/me/listings/:id/stats` | merchant | Daily counts for one listing, last 30 days              |
| GET    | `/admin/stats`           | admin    | Totals by day and campus, top listings, quiet merchants |

**Web**

- Contact slot on `/listings/:id`: Call and WhatsApp buttons
- `/dashboard/listings`: views, calls, WhatsApps per listing
- `/dashboard/listings/:id/stats`: daily chart, last 30 days
- `/admin/stats`: marketplace numbers

## Requirements

### Buttons

| Id      | Requirement                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTR-001 | While a public listing's availability is `AVAILABLE`, the detail page shall show a Call button and a WhatsApp button in the contact slot.                                                                                                         |
| CTR-002 | While a public listing's availability is `TAKEN` or `UNAVAILABLE`, the contact slot shall show no buttons and no number (DSC-033).                                                                                                                |
| CTR-003 | The detail page HTML shall not contain the merchant's phone or WhatsApp number.                                                                                                                                                                   |
| CTR-004 | When a visitor taps Call or WhatsApp, the web app shall get a Cloudflare Turnstile token, send it with `POST /public/listings/:id/contact`, and open the returned link within the same tap.                                                       |
| CTR-005 | When the channel is `CALL`, the API shall return `tel:` followed by the merchant's E.164 phone number (IDN-021); on screens where `tel:` links don't work (desktop), the web app shall also show the number with a copy button.                   |
| CTR-006 | When the channel is `WHATSAPP`, the API shall return `https://wa.me/<number without +>?text=<message>`, where the message is always in English and reads: "Hi, I found your listing \"<title>\" on MoveIn: <listing URL>. Is it still available?" |
| CTR-007 | If the contact request fails, then the web app shall show "Couldn't load the number, tap to try again" and shall not show a stale number.                                                                                                         |
| CTR-008 | If the listing is no longer public when the contact request arrives, then the API shall respond 404 and the web app shall reload the page.                                                                                                        |
| CTR-009 | If the Turnstile token is missing, expired or fails verification with Cloudflare, then the API shall respond 400, return no number and record no event, and the web app shall run the check again.                                                |

### Counting

| Id      | Requirement                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTR-010 | When a public listing's detail page has loaded in the browser, the web app shall send one view event; server rendering, link previews and prefetching shall not count as views. |
| CTR-011 | When the API returns a contact link, it shall record a `CALL` or `WHATSAPP` event in the same request.                                                                          |
| CTR-012 | The API shall compute `visitorHash` as SHA-256 of IP address + user agent + a secret that rotates daily, and shall never store raw IP addresses.                                |
| CTR-013 | If the request comes from a signed-in user who owns the listing or is an admin, then the API shall return the link but record no event.                                         |
| CTR-014 | If the user agent matches a known bot or link-preview fetcher (including WhatsApp, Facebook, Twitter and search crawlers), then the API shall record no event.                  |
| CTR-015 | If one `visitorHash` sends more than 30 contact or view requests in a minute, then the API shall respond 429 and record nothing further that minute.                            |
| CTR-016 | The API shall count a visitor's repeated taps on the same listing and channel within 24 hours in the total, but only once in unique contacts.                                   |

### Stats

| Id      | Requirement                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTR-020 | A scheduled job shall roll events up into `ListingDailyStats` every hour, by Africa/Lagos day (SYS-008).                                                                                                                                                                                                |
| CTR-021 | The API shall keep raw `ListingEvent` rows for 180 days and daily stats for as long as the listing exists.                                                                                                                                                                                              |
| CTR-022 | When a merchant opens `/dashboard/listings`, the web app shall show each listing's views, calls and WhatsApps for the last 7 days, last 30 days and all time.                                                                                                                                           |
| CTR-023 | When a merchant opens `/dashboard/listings/:id/stats`, the web app shall show daily views and contacts for the last 30 days.                                                                                                                                                                            |
| CTR-024 | The merchant dashboard shall label the counts as taps on the buttons, not confirmed calls or messages.                                                                                                                                                                                                  |
| CTR-025 | When an admin opens `/admin/stats`, the web app shall show for a chosen date range: public listings, active merchants, views, calls, WhatsApps and unique contacts, by day and by campus; the 10 listings with the most contacts; and merchants with live listings but no contacts in the last 14 days. |
| CTR-026 | The API shall return stats only for listings the merchant owns (LST-004).                                                                                                                                                                                                                               |

## Acceptance tests

- Detail page HTML for an available listing contains no phone number (CTR-003).
- Tapping WhatsApp opens `wa.me/2348031234567?text=…` containing the listing title and URL, and stores one `WHATSAPP` event (CTR-006, CTR-011).
- A Taken listing shows no buttons; a contact request for an archived listing returns 404 (CTR-002, CTR-008).
- The merchant tapping their own listing's button gets the link and adds no event (CTR-013).
- A WhatsApp link-preview fetch of the listing URL adds no view (CTR-010, CTR-014).
- The same visitor tapping Call three times in an hour shows as 3 calls and 1 unique contact (CTR-016).
- Contact request without a valid Turnstile token returns 400 with no number and no event (CTR-009).
- Merchant B can't read merchant A's stats (CTR-026).
- After the hourly rollup, dashboard 7-day counts match the raw events (CTR-020, CTR-022).

## Decisions (2026-10-23)

1. Desktop visitors see the number with a copy button after tapping Call (CTR-005).
2. WhatsApp message wording approved; always English (CTR-006).
3. Cloudflare Turnstile protects the contact buttons (CTR-004, CTR-009).

## Open questions

1. **Merchant comparison:** merchants see their own counts only. Should they also see how their listing compares with the average in their area? Not in v1 unless you want it.
