# Spec: listings

Status: APPROVED 2026-10-23
Module id: `listings` · Depends on: identity · Used by: billing, discovery, moderation, contact-tracking, listing-expiry
Project spec: `SPEC.md` (SYS-001 to SYS-013 apply) · Identity: `specs/SPEC-identity.md`

## Objective

Let a merchant describe a place well enough that a student can decide whether to call: what it is, where it is, every naira it costs to move in, photos, and whether it's still free. Own the listing's status so every other module changes it through one place.

## Scope

In: create, edit and delete listings; photos via Cloudinary; location (campus + area); rent and itemised fees; property details and amenities; availability (Available / Taken / Unavailable); the listing status lifecycle; the publish action (which asks billing for an entitlement); the public-visibility check other modules use.

Out: payment and plans (`billing`); public search pages (`discovery`); call/WhatsApp buttons and counts (`contact-tracking`); reports and removal UI (`moderation`); expiry scheduling (`listing-expiry`). Contact details come from the merchant profile (`identity`), not the listing.

## Decisions carried in

- No pre-publication review: a listing goes live as soon as publish succeeds.
- Only role `MERCHANT` with status `ACTIVE` can create or publish listings (IDN-033).

## Status lifecycle

Two separate fields:

- **status** (who controls whether it can be public): `DRAFT`, `PUBLISHED`, `EXPIRED`, `REMOVED`, `ARCHIVED`
- **availability** (merchant's statement about the room): `AVAILABLE`, `TAKEN`, `UNAVAILABLE`

| From                      | To        | Triggered by                                                             |
| ------------------------- | --------- | ------------------------------------------------------------------------ |
| —                         | DRAFT     | merchant creates                                                         |
| DRAFT                     | PUBLISHED | merchant publishes and billing grants entitlement                        |
| PUBLISHED                 | EXPIRED   | listing-expiry                                                           |
| EXPIRED                   | PUBLISHED | merchant renews and billing grants entitlement                           |
| PUBLISHED, EXPIRED        | REMOVED   | moderation (admin)                                                       |
| REMOVED                   | PUBLISHED | moderation restore, only if `expiresAt` is in the future                 |
| REMOVED                   | EXPIRED   | moderation restore, if `expiresAt` has passed                            |
| EXPIRED                   | PUBLISHED | moderation `extendExpiry` after a cleared automatic suspension (LST-057) |
| DRAFT, PUBLISHED, EXPIRED | ARCHIVED  | merchant deletes, or listing-expiry grace period ends                    |
| REMOVED                   | ARCHIVED  | listing-expiry grace period ends                                         |

Any transition not in this table is rejected.

**Public** = status `PUBLISHED` **and** `expiresAt` in the future **and** merchant is active (`isActiveMerchant`). Availability does not affect whether a listing is public; discovery decides how Taken/Unavailable listings are shown.

## Data model (Prisma)

```prisma
enum ListingStatus { DRAFT PUBLISHED EXPIRED REMOVED ARCHIVED }
enum Availability { AVAILABLE TAKEN UNAVAILABLE }
enum PropertyType { SINGLE_ROOM SELF_CONTAIN ROOM_AND_PARLOUR MINI_FLAT FLAT HOSTEL_ROOM }
enum RentPeriod { YEARLY SIX_MONTHS MONTHLY }
enum Facility { PRIVATE SHARED NONE }
enum FeeType { INSPECTION AGENCY LEGAL CAUTION SERVICE OTHER }

model Listing {
  id               String        @id @default(uuid())
  merchantId       String
  merchant         User          @relation(fields: [merchantId], references: [id])
  status           ListingStatus @default(DRAFT)
  availability     Availability  @default(AVAILABLE)

  title            String
  description      String
  propertyType     PropertyType
  bedrooms         Int?
  bathroom         Facility
  kitchen          Facility
  amenities        String[]

  campusId         String
  campus           Campus        @relation(fields: [campusId], references: [id])
  areaId           String
  area             Area          @relation(fields: [areaId], references: [id])
  landmark         String?
  walkMinutes      Int?

  rentKobo         Int
  rentPeriod       RentPeriod
  annualRentKobo   Int
  fees             ListingFee[]
  photos           ListingPhoto[]

  publishedAt      DateTime?
  expiresAt        DateTime?
  removedReason    String?
  archivedAt       DateTime?
  availabilityAt   DateTime      @default(now())
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([status, campusId, areaId, propertyType, annualRentKobo])
}

model ListingFee {
  id          String   @id @default(uuid())
  listingId   String
  listing     Listing  @relation(fields: [listingId], references: [id])
  type        FeeType
  label       String?
  amountKobo  Int
  refundable  Boolean  @default(false)
}

model ListingPhoto {
  id                 String   @id @default(uuid())
  listingId          String
  listing            Listing  @relation(fields: [listingId], references: [id])
  cloudinaryPublicId String   @unique
  width              Int
  height             Int
  position           Int
  createdAt          DateTime @default(now())
}
model Campus {
  id        String       @id @default(uuid())
  name      String       @unique
  slug      String       @unique
  active    Boolean      @default(true)
  position  Int          @default(0)
  areas     CampusArea[]
  listings  Listing[]
}

model Area {
  id        String       @id @default(uuid())
  name      String       @unique
  slug      String       @unique
  active    Boolean      @default(true)
  campuses  CampusArea[]
  listings  Listing[]
}

model CampusArea {
  campusId  String
  campus    Campus @relation(fields: [campusId], references: [id])
  areaId    String
  area      Area   @relation(fields: [areaId], references: [id])

  @@id([campusId, areaId])
}
```

Campuses and areas are managed by admins in the database (LST-060 to LST-068). An area can belong to more than one campus. Property types and amenities stay fixed in `packages/shared` (SYS-013).

## Interfaces

**HTTP (API)** — all require role `MERCHANT`, status `ACTIVE` (IDN-013), and ownership of the listing.

| Method | Path                             | Purpose                                               |
| ------ | -------------------------------- | ----------------------------------------------------- |
| POST   | `/listings`                      | Create draft                                          |
| GET    | `/me/listings`                   | Merchant's listings with status, availability, expiry |
| GET    | `/me/listings/:id`               | One listing, full detail                              |
| PATCH  | `/listings/:id`                  | Edit fields                                           |
| POST   | `/listings/:id/photos/signature` | Signed Cloudinary upload params                       |
| POST   | `/listings/:id/photos`           | Register an uploaded photo                            |
| DELETE | `/listings/:id/photos/:photoId`  | Remove a photo                                        |
| PUT    | `/listings/:id/photos/order`     | Reorder photos (first = cover)                        |
| POST   | `/listings/:id/publish`          | Publish or renew (asks billing for entitlement)       |
| PUT    | `/listings/:id/availability`     | Set Available / Taken / Unavailable                   |
| DELETE | `/listings/:id`                  | Archive                                               |

**Service (for other modules)**

```ts
interface ListingsService {
  isPublic(listingId: string): Promise<boolean>;
  getPublicById(listingId: string): Promise<PublicListing | null>;
  publicQuery(): Prisma.ListingWhereInput;
  markExpired(listingId: string): Promise<void>;
  remove(listingId: string, actorId: string, reason: string): Promise<void>;
  restore(listingId: string, actorId: string, reason: string): Promise<void>;
  archive(listingId: string, reason: 'MERCHANT_DELETED' | 'GRACE_ENDED'): Promise<void>;
}
```

**Billing contract (provided by billing, consumed here)**

```ts
interface EntitlementPort {
  consume(
    merchantId: string,
    listingId: string,
    startsAt: Date,
  ): Promise<{ expiresAt: Date } | { error: 'NO_ENTITLEMENT' }>;
}
```

**Web routes**

| Route                             | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `/dashboard/listings`             | List with status, availability, expiry date |
| `/dashboard/listings/new`         | Create form                                 |
| `/dashboard/listings/:id/edit`    | Edit form, photos, preview                  |
| `/dashboard/listings/:id/preview` | Shows exactly what students will see        |

## Requirements

### Create and edit

| Id      | Requirement                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| LST-001 | When an active merchant with a complete profile creates a listing, the API shall save it with status `DRAFT` and availability `AVAILABLE`. |
| LST-002 | If a merchant whose profile is incomplete tries to create a listing, then the API shall respond 409 with error code `PROFILE_INCOMPLETE`.  |
| LST-003 | If a merchant already has 20 listings in `DRAFT`, then the API shall reject a new draft with error code `DRAFT_LIMIT`.                     |
| LST-004 | The API shall let a merchant read, edit or delete only listings they own, and shall respond 404 for any other listing id.                  |
| LST-005 | The API shall save drafts with missing fields, and shall check completeness only at publish (LST-020).                                     |
| LST-006 | While a listing is `PUBLISHED`, the API shall reject changes to `propertyType`, `campusId` and `areaId` with error code `FIELD_LOCKED`.    |
| LST-007 | When a merchant edits a `PUBLISHED` listing, the API shall apply the change immediately and shall not change `expiresAt`.                  |
| LST-008 | If a merchant edits a listing in `REMOVED` or `ARCHIVED`, then the API shall reject the change.                                            |

### Content rules

| Id      | Requirement                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-010 | The API shall require title 10–80 characters and description 30–2,000 characters.                                                                                                                                      |
| LST-011 | The API shall require `bedrooms` between 1 and 6 when property type is `FLAT`, and shall ignore it otherwise.                                                                                                          |
| LST-012 | The API shall accept a `campusId` only for an active campus, an `areaId` only for an active area linked to that campus (LST-060 to LST-068), and amenity values only from `packages/shared` (SYS-013).                 |
| LST-013 | The API shall require rent as a whole naira amount between ₦10,000 and ₦10,000,000, stored in kobo (SYS-007).                                                                                                          |
| LST-014 | The API shall require the merchant to state an amount or "none" for each of `INSPECTION`, `AGENCY` and `CAUTION` fees before publish.                                                                                  |
| LST-015 | Where the merchant adds a `LEGAL`, `SERVICE` or `OTHER` fee, the API shall require an amount, and for `OTHER` a label of 3–40 characters.                                                                              |
| LST-016 | The API shall compute `moveInTotalKobo` as rent plus every non-inspection fee, and return it with the listing.                                                                                                         |
| LST-017 | If the title or description contains a phone number, email address or URL, then the API shall reject it with a field-level error, so all contact goes through the tracked buttons.                                     |
| LST-018 | `walkMinutes`, when given, shall be between 1 and 120.                                                                                                                                                                 |
| LST-019 | When rent or rent period is saved, the API shall store `annualRentKobo` = rent × 1 (yearly), × 2 (six months) or × 12 (monthly), so listings with different rent periods can be filtered and sorted by price together. |

### Photos

| Id      | Requirement                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-030 | When a merchant requests an upload signature, the API shall return signed Cloudinary parameters limited to the folder `listings/<listingId>`, JPEG/PNG/WebP, and 5 MB. |
| LST-031 | If a merchant registers a photo whose Cloudinary public id is outside `listings/<listingId>/`, then the API shall reject it.                                           |
| LST-032 | The API shall allow at most 10 photos per listing.                                                                                                                     |
| LST-033 | The API shall treat the photo at position 0 as the cover photo.                                                                                                        |
| LST-034 | If a merchant deletes the last photo of a `PUBLISHED` listing, then the API shall reject it with error code `PHOTO_REQUIRED`.                                          |
| LST-035 | The web app shall request Cloudinary-transformed images sized for the viewport, not the original upload.                                                               |

### Publish and renew

| Id      | Requirement                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-020 | When a merchant publishes a `DRAFT` or `EXPIRED` listing, the API shall check that every required field is valid and at least one photo exists, and shall respond 422 listing every missing field if not.                                                               |
| LST-021 | When the completeness check passes, the API shall ask billing to consume an entitlement for the listing, passing `startsAt` = now for a `DRAFT` or `EXPIRED` listing.                                                                                                   |
| LST-022 | When billing returns an `expiresAt`, the API shall set status `PUBLISHED`, `publishedAt` to now and `expiresAt` to the returned value, in one transaction with the entitlement consumption.                                                                             |
| LST-023 | If billing returns `NO_ENTITLEMENT`, then the API shall leave the listing unchanged and respond 402 with error code `NO_ENTITLEMENT`, and the web app shall send the merchant to the plans page with the listing id.                                                    |
| LST-024 | If the same publish request is sent twice, then the API shall consume at most one entitlement.                                                                                                                                                                          |
| LST-025 | When a merchant renews a listing that is still `PUBLISHED`, the API shall ask billing to consume an entitlement with `startsAt` = the listing's current `expiresAt`, and set `expiresAt` to the returned value, keeping status `PUBLISHED` and `publishedAt` unchanged. |
| LST-026 | If a merchant renews a `PUBLISHED` listing that already has a future renewal queued beyond its current period, then the API shall still allow it, stacking each new period on the latest `expiresAt`, up to a maximum of 180 days from now.                             |
| LST-027 | If an early renewal would push `expiresAt` more than 180 days from now, then the API shall reject it with error code `RENEWAL_LIMIT` and consume nothing.                                                                                                               |

### Availability

| Id      | Requirement                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-040 | When a merchant sets availability on a listing in `DRAFT`, `PUBLISHED` or `EXPIRED`, the API shall save it and set `availabilityAt` to now. |
| LST-041 | The API shall return `availabilityAt` with every listing so students can see when availability was last confirmed.                          |
| LST-042 | The web app shall let a merchant change availability in one tap from `/dashboard/listings`.                                                 |
| LST-043 | Changing availability shall not change status, `expiresAt` or entitlement.                                                                  |

### Visibility and status changes (used by other modules)

| Id      | Requirement                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-050 | `isPublic`, `getPublicById` and `publicQuery` shall apply the same rule: status `PUBLISHED`, `expiresAt` in the future, merchant role `MERCHANT` and status `ACTIVE`.                              |
| LST-051 | `getPublicById` shall return only public fields: no merchant email, no Clerk id, no internal timestamps other than `publishedAt` and `availabilityAt`.                                             |
| LST-052 | If any status change is requested that is not in the lifecycle table, then the API shall reject it and change nothing.                                                                             |
| LST-053 | When `remove` or `restore` is called, the API shall require an admin actor and a reason, and shall write an audit record (SYS-009).                                                                |
| LST-054 | When a listing is archived, the API shall keep the listing, its fees and photo records, and shall stop returning it from `/me/listings` unless the merchant filters for archived.                  |
| LST-055 | When a merchant deletes a `PUBLISHED` listing, the API shall archive it and shall not return the used entitlement.                                                                                 |
| LST-056 | When moderation calls `extendExpiry` after clearing an automatic suspension, the API shall add the given days to `expiresAt`, ignore the 180-day renewal cap (LST-027), and write an audit record. |
| LST-057 | Where `extendExpiry` is called on an `EXPIRED` listing, the API shall set `expiresAt` = previous `expiresAt` + the given days and, if that is in the future, set status `PUBLISHED`.               |

### Campuses and areas (admin-managed)

| Id      | Requirement                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LST-060 | When an admin creates a campus or area on `/admin/locations`, the API shall save it with a unique name and a URL slug generated from the name, and write an audit record (SYS-009). |
| LST-061 | When an admin links or unlinks an area and a campus, the API shall update `CampusArea` and write an audit record.                                                                   |
| LST-062 | When an admin renames a campus or area, the API shall keep its id and slug, so existing listings and shared links keep working.                                                     |
| LST-063 | The API shall not delete a campus or area; admins deactivate it instead.                                                                                                            |
| LST-064 | While a campus or area is inactive, the API shall reject it for new or edited listings, and the web app shall hide it from search filters.                                          |
| LST-065 | While a campus or area is inactive, the API shall keep existing published listings that use it public until they expire, and shall show their campus and area names as normal.      |
| LST-066 | If an admin unlinks an area from a campus while published listings use that pair, then the API shall reject the change and show how many listings use it.                           |
| LST-067 | The API shall return active campuses (ordered by `position`) with their active areas from `GET /public/locations`, cacheable for 5 minutes.                                         |
| LST-068 | While no active campus exists, the web app shall show merchants a message that listing is not open yet, and the API shall reject new drafts with error code `NO_LOCATIONS`.         |

HTTP additions:

| Method           | Path                                     | Who    | Purpose                          |
| ---------------- | ---------------------------------------- | ------ | -------------------------------- |
| GET              | `/public/locations`                      | public | Active campuses with their areas |
| GET, POST, PATCH | `/admin/campuses`, `/admin/campuses/:id` | admin  | Manage campuses                  |
| GET, POST, PATCH | `/admin/areas`, `/admin/areas/:id`       | admin  | Manage areas                     |
| PUT              | `/admin/campuses/:id/areas`              | admin  | Set which areas link to a campus |

Web route: `/admin/locations` — campuses, areas and their links.

## Acceptance tests

- Draft created with missing fields saves (LST-005); publish returns 422 naming each missing field (LST-020).
- Merchant B gets 404 for merchant A's listing on every endpoint (LST-004).
- Publish with a slot sets PUBLISHED and `expiresAt`; publish without a slot returns 402 and the listing stays DRAFT (LST-022, LST-023).
- Two concurrent publish requests consume one entitlement (LST-024).
- Renewing a published listing expiring 5 Nov with a 30-day slot sets `expiresAt` to 5 Dec; a renewal that would pass 180 days from now is rejected with `RENEWAL_LIMIT` and uses no slot (LST-025, LST-027).
- A deactivated area disappears from filters and new listings, but a published listing in it stays public (LST-064, LST-065).
- Unlinking an area from a campus with live listings in that pair is rejected (LST-066).
- Changing area on a published listing returns `FIELD_LOCKED`; changing price works and leaves `expiresAt` unchanged (LST-006, LST-007).
- Description containing `08031234567` or `wa.me/…` is rejected (LST-017).
- Photo registered from another listing's folder is rejected; 11th photo rejected; deleting last photo of a published listing rejected (LST-031, LST-032, LST-034).
- Inspection/agency/caution unanswered blocks publish; `moveInTotalKobo` excludes inspection (LST-014, LST-016).
- Suspended merchant's published listing is not returned by `publicQuery` (LST-050).
- `REMOVED → PUBLISHED` restore fails once `expiresAt` has passed and lands in EXPIRED instead (lifecycle table).

## Decisions (approved 2026-10-23, proposals accepted as written)

1. Property types: Single room, Self-contain, Room and parlour, Mini flat, Flat (1–6 bedrooms), Hostel room.
2. Rent periods: yearly, six months, monthly.
3. Amenities (`packages/shared`): prepaid meter, borehole/running water, fenced/gated, security, tiled floors, wardrobe, POP ceiling, generator or solar, parking, Wi-Fi.
4. Area, campus and property type lock once published (LST-006).
5. No phone numbers, emails or links in title or description (LST-017).
6. Rent bounds ₦10,000 to ₦10,000,000 (LST-013).

## Amendments

| Id  | Date       | Change                                                                                                                              | Status                      |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A1  | 2026-10-23 | `annualRentKobo` added (LST-019) for price filtering across rent periods                                                            | Approved                    |
| A2  | 2026-10-23 | Early renewal stacks the new period on the current expiry (LST-021, LST-025 to LST-027); `EntitlementPort.consume` takes `startsAt` | Approved (180-day cap kept) |
| A3  | 2026-10-23 | Campuses and areas moved from `packages/shared` to admin-managed database tables (LST-012, LST-060 to LST-068)                      | Approved                    |
| A4  | 2026-10-23 | `extendExpiry` for making up days lost to a cleared automatic suspension; `EXPIRED → PUBLISHED` step (LST-056, LST-057)             | Approved                    |
| A5  | 2026-10-23 | Copy an archived or expired listing into a new draft (`POST /listings/:id/copy`, EXP-040 to EXP-042)                                | Approved                    |
