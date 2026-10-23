# Spec: discovery

Status: APPROVED 2026-10-23
Module id: `discovery` · Depends on: listings · Used by: contact-tracking (button placement), moderation (report link placement)
Project spec: `SPEC.md` · Listings: `specs/SPEC-listings.md` (uses LST-019 and the admin-managed locations, LST-060 to LST-068)

## Objective

Let a student, or a parent searching from outside Ilorin, find a free place near their campus at a price they can afford, on a cheap phone with a weak connection, without an account, and send a listing to someone else on WhatsApp.

## Scope

In: public home page, search results page, listing detail page, filters, sort, pagination, shareable URLs, link previews for WhatsApp, the public read API.

Out: call/WhatsApp buttons and their counts (`contact-tracking`, rendered in a slot on the detail page); the report form (`moderation`, rendered in a slot on the detail page); saved favourites; maps; student accounts.

## Interfaces

**HTTP (API)** — public, no auth.

| Method | Path | Purpose |
|---|---|---|
| GET | `/public/listings` | Search: `campus`, `area`, `type`, `minRent`, `maxRent`, `q`, `sort`, `page` |
| GET | `/public/listings/:id` | One public listing (`ListingsService.getPublicById`) |
| GET | `/public/listings/featured` | Up to 8 newest public, available listings for the home page |
| GET | `/public/locations` | Active campuses and their areas (LST-067) |

Campuses and areas come from the database via `/public/locations`; property types and amenities from `packages/shared` (SYS-013).

**Web routes** — server-rendered.

| Route | Purpose |
|---|---|
| `/` | Search box (campus, then area), featured listings, "List your property" link to `/sign-up` |
| `/listings` | Results; every filter in the query string |
| `/listings/:id` | Detail page |

## Requirements

### Search and filters

| Id | Requirement |
|---|---|
| DSC-001 | The API shall return only listings that pass `ListingsService.publicQuery()` (LST-050). |
| DSC-002 | The API shall return only listings with availability `AVAILABLE` from search and featured results. |
| DSC-003 | When a campus is chosen, the web app shall offer only the active areas linked to that campus (LST-067). |
| DSC-004 | The API shall filter by campus, area, one or more property types, and a minimum and maximum yearly rent using `annualRentKobo` (LST-019). |
| DSC-005 | Where a keyword `q` (2–60 characters) is given, the API shall match it case-insensitively against title, description and landmark. |
| DSC-006 | The API shall sort by newest (`publishedAt`, default), price low to high, price high to low, or most recently confirmed availability (`availabilityAt`). |
| DSC-007 | The API shall return 20 results per page with the total count. |
| DSC-008 | If a filter value is not an active campus or area slug, not in the shared lists, or not a valid number, then the API shall ignore that filter and the web app shall show the results without it. |
| DSC-011 | The web app shall use campus and area slugs, not database ids, in URLs. |
| DSC-009 | When a search returns no results, the web app shall say so and offer one-tap links that remove the area filter and then the price filter. |
| DSC-010 | The web app shall keep every filter, sort and page in the URL, so a copied link opens the same results. |

### Result cards

| Id | Requirement |
|---|---|
| DSC-020 | Each result card shall show the cover photo, title, property type, area and campus, rent with its period, the move-in total (LST-016), walk minutes if given, and "Confirmed available N days ago" from `availabilityAt`. |
| DSC-021 | Where rent period is not yearly, the result card shall also show the yearly equivalent. |

### Detail page

| Id | Requirement |
|---|---|
| DSC-030 | The detail page shall show all photos in a swipeable gallery, title, description, property type and bedrooms, bathroom and kitchen (private / shared / none), amenities, area, campus, landmark, walk minutes, merchant display name and "On MoveIn since <month year>". |
| DSC-031 | The detail page shall show rent with its period and each fee on its own line, show "None" for inspection, agency or caution fees the merchant set to none, mark refundable fees, and show the move-in total with a note that it excludes the inspection fee. |
| DSC-032 | The detail page shall show availability and when it was last confirmed. |
| DSC-033 | While a public listing's availability is `TAKEN` or `UNAVAILABLE`, the detail page shall show a clear "No longer available" banner above the gallery and a link to similar results (same campus and property type). |
| DSC-034 | The detail page shall provide a contact slot for contact-tracking and a report slot for moderation, and shall render nothing in those slots itself. |
| DSC-035 | If a listing id is not public, then the web app shall show a "This listing isn't available" page with a link to search, with HTTP status 404, and shall not reveal whether the listing exists. |
| DSC-036 | The detail page shall include Open Graph tags (title, rent, area, cover image) so a link pasted into WhatsApp shows a preview. |
| DSC-037 | The detail page shall offer a "Share" button that uses the device share sheet, or copies the link where that isn't supported. |

### Performance and access

| Id | Requirement |
|---|---|
| DSC-040 | The web app shall serve search and detail pages server-rendered, readable before client JavaScript loads. |
| DSC-041 | The web app shall load images through Cloudinary with automatic format and quality, sized to the layout, and lazy-load every image below the first screen (LST-035). |
| DSC-042 | Search and detail pages shall reach Largest Contentful Paint within 3 seconds on a simulated slow 4G mid-range Android profile. |
| DSC-043 | The web app shall work fully without sign-in, cookies consent prompts or pop-ups on public pages (SYS-003). |
| DSC-044 | If a single IP makes more than 120 public API requests in a minute, then the API shall respond 429 for the rest of that minute. |
| DSC-045 | Public pages shall meet WCAG 2.1 AA colour contrast and support keyboard and screen-reader navigation of filters and gallery. |

## Acceptance tests

- Draft, expired, removed, archived, suspended-merchant and admin-owned listings never appear in search, featured or detail (DSC-001, DSC-035).
- A Taken listing is absent from search but its link opens with the banner (DSC-002, DSC-033).
- ₦15,000 monthly and ₦180,000 yearly listings both match a ₦150,000–₦200,000 yearly filter (DSC-004, LST-019).
- Choosing a campus limits the area list (DSC-003); `?type=castle` is ignored (DSC-008).
- A copied results URL reproduces the same results and page (DSC-010).
- Inspection set to none shows "None"; move-in total excludes inspection (DSC-031).
- Unknown id and expired id both return the same 404 page (DSC-035).
- WhatsApp link preview shows title, rent and cover photo (DSC-036).
- Lighthouse mobile run under slow 4G: LCP ≤ 3 s on `/listings` and `/listings/:id` (DSC-042).

## Open questions

1. ~~Campuses and areas~~ — resolved 2026-10-23: admin-managed (LST-060 to LST-068); you enter the first set from `/admin/locations` before launch.
2. **Taken listings (DSC-002):** hide them from search entirely (as written), or show them at the bottom marked "Taken"?
3. **Featured listings:** newest first is the simplest. Later, featured placement could become a paid add-on; not in v1.
4. ~~Amendment A1~~ — approved 2026-10-23.
