# Spec: billing

Status: APPROVED 2026-10-23
Module id: `billing` · Depends on: identity · Used by: listings (publish/renew), listing-expiry, moderation (admin views)
Project spec: `SPEC.md` · Listings contract: `EntitlementPort` in `specs/SPEC-listings.md`

## Objective

Let a merchant pay in naira for listing slots through Bachs, give them those slots only after MoveIn's server has confirmed the payment with Bachs, and let admins give free-trial slots to merchants they choose. Every naira received is traceable to a merchant, a plan and the listings it paid for.

## Scope

In: listing plans; orders; Bachs hosted checkout; Bachs webhook handling; entitlements (slot credits) and their consumption by listings; admin-granted free trials; merchant payment history; admin payments view and plan management.

Out: refunds (issued manually from the Bachs dashboard in v1); subscriptions; collecting rent; invoices beyond Bachs's own receipts; payouts.

## How Bachs is used (from docs.bachs.io)

- **Checkout:** `POST /v1/checkout-sessions` with a raw `pricing` amount in `NGN` (no Bachs product catalog), our order id as `reference` (unique for good on the Bachs account), `metadata.order_id`, the merchant's email and name as `customer`, and `success_url` / `cancel_url`. The response gives a `checkout_url` to redirect to. Sessions default to 60 minutes.
- **Payment methods:** restricted with `payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"]`.
- **Confirmation:** the webhook is the source of truth, never the `success_url` redirect. Bachs sends `checkout.completed` and `collection.succeeded`; either may arrive first, more than once, and out of order. A payment can still complete after `checkout.expired` (for example a late bank transfer).
- **Verification:** `webhooks.constructEvent(rawBody, headers, BACHS_WEBHOOK_SECRET)` from `@bachs/sdk` checks the `X-Bachs-Signature-V2` signature and timestamp against the raw body.
- **Retries:** Bachs retries on `5xx`, `408`, `429` and timeouts (>10 s), and stops on other `4xx`.
- **Environments:** `https://sandbox-api.bachs.io` with `sk_sandbox_…`; `https://api.bachs.io` with `sk_live_…` after Bachs verifies the account (usually within 48 hours). `success_url` must be a public URL, even in sandbox.

## Data model (Prisma)

```prisma
enum OrderStatus { PENDING PAID EXPIRED HELD_FOR_REVIEW }
enum GrantSource { PAID FREE_TRIAL }

model ListingPlan {
  id            String   @id
  name          String
  priceKobo     Int
  slots         Int
  durationDays  Int
  active        Boolean  @default(true)
  updatedAt     DateTime @updatedAt
}

model Order {
  id               String      @id @default(uuid())
  merchantId       String
  planId           String
  planName         String
  amountKobo       Int
  slots            Int
  durationDays     Int
  currency         String      @default("NGN")
  status           OrderStatus @default(PENDING)
  bachsCheckoutId  String?     @unique
  bachsChargeId    String?
  forListingId     String?
  paidAt           DateTime?
  heldReason       String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
}

model EntitlementGrant {
  id            String      @id @default(uuid())
  merchantId    String
  source        GrantSource
  orderId       String?     @unique
  grantedById   String?
  reason        String?
  slots         Int
  slotsUsed     Int         @default(0)
  durationDays  Int
  validUntil    DateTime
  createdAt     DateTime    @default(now())
  uses          EntitlementUse[]
}

model EntitlementUse {
  id          String           @id @default(uuid())
  grantId     String
  grant       EntitlementGrant @relation(fields: [grantId], references: [id])
  listingId   String
  startsAt    DateTime
  expiresAt   DateTime
  createdAt   DateTime         @default(now())
}

model BachsEvent {
  id          String   @id
  type        String
  receivedAt  DateTime @default(now())
}
```

`Order` copies the plan's name, price, slots and duration at purchase, so later plan edits never change past orders. Orders and grants are never deleted (SYS-010).

## Interfaces

**HTTP (API)**

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/plans` | public | Active plans |
| POST | `/orders` | merchant | Create order and Bachs checkout; returns `checkout_url` |
| GET | `/me/orders/:id` | merchant | Order status (polled by the return page) |
| GET | `/me/billing` | merchant | Slots left, grants with expiry, order history |
| POST | `/webhooks/bachs` | Bachs (signed) | Payment events |
| GET | `/admin/orders` | admin | All orders; filter by status, merchant, date |
| POST | `/admin/orders/:id/resolve` | admin | Release or reject a held order |
| GET, PUT | `/admin/plans`, `/admin/plans/:id` | admin | View and edit plans |
| POST | `/admin/users/:id/free-trial` | admin | Grant free-trial slots |

**Service** — implements `EntitlementPort` from listings:

```ts
interface BillingService extends EntitlementPort {
  consume(merchantId: string, listingId: string, startsAt: Date): Promise<{ expiresAt: Date } | { error: 'NO_ENTITLEMENT' }>;
  slotsAvailable(merchantId: string): Promise<number>;
}
```

**Web routes**

| Route | Purpose |
|---|---|
| `/dashboard/billing` | Slots left, expiry of unused slots, payment history |
| `/dashboard/billing/plans?listing=<id>` | Choose a plan; reached from a failed publish |
| `/dashboard/billing/orders/:id` | Return page after Bachs checkout |
| `/admin/orders` | Payments, held orders |
| `/admin/plans` | Plan prices and on/off |

## Requirements

### Plans

| Id | Requirement |
|---|---|
| BIL-001 | The API shall seed three plans: Single (₦2,000, 1 slot, 30 days), 5-pack (₦8,000, 5 slots, 30 days), 10-pack (₦15,000, 10 slots, 30 days). |
| BIL-002 | The API shall return only active plans from `GET /plans`. |
| BIL-003 | When an admin edits a plan's price, slots, duration or active flag, the API shall apply it to new orders only and write an audit record (SYS-009). |

### Checkout

| Id | Requirement |
|---|---|
| BIL-010 | When an active merchant chooses an active plan, the API shall save a `PENDING` order with the plan's price, slots and duration copied onto it, before calling Bachs. |
| BIL-011 | When the order is saved, the API shall create a Bachs checkout session with `pricing` `{ currency: "NGN", amount }` from the order, `reference` = order id, `metadata.order_id` = order id, the merchant's email and display name as `customer`, `payment_method_types` `NGN_CARD` and `NGN_BANK_TRANSFER`, and `success_url` = `/dashboard/billing/orders/<orderId>`, using the order id as the idempotency key. |
| BIL-012 | The API shall take the amount only from the stored plan, never from the request body. |
| BIL-013 | If creating the Bachs checkout fails or times out, then the API shall keep the order `PENDING`, show the merchant a retry message, and reuse the same order and idempotency key on retry. |
| BIL-014 | Where the merchant arrived from a failed publish, the API shall store `forListingId` on the order. |
| BIL-015 | When the merchant lands on `/dashboard/billing/orders/:id`, the web app shall show the order's status from the API and poll every 3 seconds for up to 2 minutes, and shall never treat the redirect itself as proof of payment. |
| BIL-016 | If a suspended or deleted merchant tries to create an order, then the API shall respond 403 `ACCOUNT_INACTIVE` (IDN-013). |

### Webhook

| Id | Requirement |
|---|---|
| BIL-020 | When a request reaches `/webhooks/bachs`, the API shall verify it with `webhooks.constructEvent` on the raw request body before parsing it. |
| BIL-021 | If the signature or timestamp check fails, then the API shall respond 400 and change nothing. |
| BIL-022 | If an event id is already in `BachsEvent`, then the API shall respond 200 and change nothing. |
| BIL-023 | When a `checkout.completed` or `collection.succeeded` event arrives for a `PENDING` or `EXPIRED` order, the API shall fetch the checkout from Bachs and continue only if its status is `completed`. |
| BIL-024 | If the fetched checkout is not yet `completed`, then the API shall respond 503 so Bachs retries. |
| BIL-025 | When the checkout is completed and its currency is `NGN` and its amount equals the order's `amountKobo`, the API shall, in one transaction, set the order `PAID` with `paidAt` and `bachsChargeId`, create one `PAID` entitlement grant for the order, and record the event id. |
| BIL-026 | If the completed checkout's currency or amount does not match the order, then the API shall set the order `HELD_FOR_REVIEW` with the reason, grant nothing, and show it on `/admin/orders`. |
| BIL-027 | When a `checkout.expired` event arrives for a `PENDING` order, the API shall set it `EXPIRED`, and shall still accept a later completed payment for it (BIL-023). |
| BIL-028 | If the API's own processing fails, then it shall respond 5xx so Bachs retries, and shall have committed nothing. |
| BIL-029 | The API shall respond to every webhook within 10 seconds. |
| BIL-030 | If an event refers to an order that does not exist, then the API shall log it, record the event id and respond 200. |
| BIL-031 | When an order becomes `PAID` and has a `forListingId` still in `DRAFT` or `EXPIRED` and complete, the API shall publish that listing using the new grant (LST-021 to LST-022). |

### Entitlements

| Id | Requirement |
|---|---|
| BIL-040 | Each grant shall be usable until `validUntil` = grant time + 90 days; unused slots after that are lost. |
| BIL-041 | When listings calls `consume` with a `startsAt`, the API shall take one slot from the merchant's grant with free slots and the earliest `validUntil` that has not passed, and return `expiresAt` = `startsAt` + that grant's `durationDays`. |
| BIL-042 | The API shall consume slots with a conditional update (`slotsUsed < slots`) inside the listings publish transaction, so two concurrent publishes can never use the same slot. |
| BIL-043 | If the merchant has no grant with a free slot that is still valid, then `consume` shall return `NO_ENTITLEMENT`. |
| BIL-044 | When a slot is consumed, the API shall record an `EntitlementUse` with grant, listing, `startsAt` (the value passed by listings, which may be in the future for early renewal) and `expiresAt`. |
| BIL-045 | The API shall never return a used slot, including when a listing is archived, removed or expires early. |

### Free trials

| Id | Requirement |
|---|---|
| BIL-050 | When an admin grants a free trial to an active merchant, the API shall create a `FREE_TRIAL` grant with the chosen slots (1–10), duration (7–90 days), the admin as `grantedById` and a reason, and write an audit record (SYS-009). |
| BIL-051 | The API shall never create an `Order` or payment record for a free-trial grant. |
| BIL-052 | The web app shall label free-trial slots as "Free trial" in the merchant's billing page and the admin's views, separate from paid slots. |
| BIL-053 | If an admin tries to grant a free trial to a user who is not an active merchant, then the API shall reject it. |

### History and admin views

| Id | Requirement |
|---|---|
| BIL-060 | When a merchant opens `/dashboard/billing`, the web app shall show slots available, each grant's source and `validUntil`, and every order with plan, amount, status and date. |
| BIL-061 | When an admin opens `/admin/orders`, the web app shall show every order with merchant, plan, amount, status, Bachs checkout id and dates, and a held-for-review filter. |
| BIL-062 | When an admin resolves a held order, the API shall either grant the order's slots (release) or leave it ungranted (reject), require a reason, and write an audit record. |
| BIL-063 | The API shall keep Bachs keys and the webhook secret only in server environment variables, and the web app shall never receive them. |

## Acceptance tests (sandbox)

- Buy Single with test card `4242 4242 4242 4242`: order turns `PAID`, one slot appears; the return page shows Paid only after the webhook (BIL-015, BIL-025).
- Declined card `4000 0000 0000 0002`: order stays `PENDING`, no slot (BIL-025).
- Replay the same `checkout.completed` twice, and send `collection.succeeded` too: exactly one grant (BIL-022, BIL-025).
- Forged signature or a stale timestamp: 400, nothing changes (BIL-021).
- Checkout fetched as not completed: 503 (BIL-024).
- Amount tampered in a test double: order `HELD_FOR_REVIEW`, no grant (BIL-026).
- `checkout.expired` then `checkout.completed`: order ends `PAID` (BIL-027).
- Request body sending `amount: 1`: ignored, plan price used (BIL-012).
- Two concurrent publishes with one slot: one succeeds, one gets `NO_ENTITLEMENT` (BIL-042).
- Grant past `validUntil` is not used (BIL-040).
- Admin free trial: `FREE_TRIAL` grant, no order row, audit row (BIL-050, BIL-051).
- Publish fails → buy plan with `forListingId` → listing publishes automatically after payment (BIL-031).

## Open questions

1. **Unused slot validity (BIL-040):** 90 days after purchase — or should unused slots never expire?
2. ~~Renewing before expiry~~ — resolved 2026-10-23: early renewal stacks on the current expiry (LST-025, BIL-041).
3. **Refunds:** OK to handle them by hand in the Bachs dashboard for v1, with no automatic slot removal?
4. **Bachs live account:** has your Bachs account been verified for live NGN card and bank transfer? Check the payment method support page in the Bachs dashboard to see which corridors are enabled.
