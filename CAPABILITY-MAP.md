# Capability Map: MoveIn v1

Status: APPROVED 23 October 2026 (moderation changed same day: no pre-publication review)
Source of intent: `docs/intent/movein-v1.md`
Each module gets its own EARS spec: `specs/SPEC-<module-id>.md`.

| Module id        | Responsibility                                                                                                                                                                                                                                                                             | Depends on                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| identity         | Clerk sign-in for merchants and admins; backend token verification; roles stored in the backend; merchant profile (display name, phone, WhatsApp); account suspension flag; the shared audit-log writer used by every module (SYS-009)                                                     | —                                |
| listings         | Merchant creates, edits, publishes and renews listings; photos; admin-managed campuses and areas; location (campus, area); price, payment period and itemised fees (inspection, agency, legal, caution, service); availability (Available / Taken / Unavailable); listing status lifecycle | identity                         |
| billing          | Listing plans; Bachs checkout; server-side payment confirmation via webhook; listing entitlements (slots, duration); admin-granted free trials; payment history                                                                                                                            | identity                         |
| moderation       | Post-publication control: admin removes and restores listings; anonymous reports with spam limits; admin report queue; merchant suspension and reinstatement; admin audit-log viewer                                                                                                       | identity, listings               |
| discovery        | Public home, search results and listing detail pages; filters (campus, area, room type, price, availability)                                                                                                                                                                               | listings                         |
| contact-tracking | Call (`tel:`) and WhatsApp (`wa.me`) buttons; anonymous tap counting; per-listing counts on merchant dashboard; totals for admin                                                                                                                                                           | discovery, listings              |
| notifications    | Transactional email to merchants (payment receipt, listing removed, expiry reminder, archived notice)                                                                                                                                                                                      | identity                         |
| listing-expiry   | Scheduled job: reminder before expiry, auto-hide on expiry, archive (soft delete) after grace period; renewal re-activates via billing                                                                                                                                                     | listings, billing, notifications |

## Build order

1. identity
2. listings
3. billing, discovery (parallel)
4. moderation, contact-tracking (parallel)
5. notifications
6. listing-expiry

## Publication gate (cross-module contract)

There is no pre-publication review. A listing is publicly visible only when all of these hold:

- the merchant has published it and its required fields are complete (`listings`)
- `billing` reports an active entitlement for it (paid or free trial)
- `identity` reports its merchant is active (not suspended or deleted)
- `moderation` has not removed it
- `listing-expiry` has not expired or archived it

`listings` owns the status field; the other modules change it only through the listings service, never by writing the column directly.
