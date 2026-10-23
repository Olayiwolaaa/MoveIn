# Tasks: MoveIn v1

Plan: `tasks/plan.md` · [L] launch-critical · [F] follow-up

## Phase 0 — Foundation

- [x] **T01 [L] Scaffold the monorepo**
  - Acceptance: Bun workspaces with `apps/web` (Next.js App Router, TypeScript strict, Tailwind), `apps/api` (NestJS, TypeScript strict, runs on Node), `packages/shared`; root scripts `dev`, `build`, `lint`, `test`.
  - Verify: `bun install && bun run build` succeeds; web on :3000 and API on :4000 both start.
  - Files: `package.json`, `apps/web/*`, `apps/api/*`, `packages/shared/*`, `tsconfig.base.json`
  - Reqs: SPEC project structure, code style

- [ ] **T02 [L] Tooling and CI**
  - Acceptance: ESLint + Prettier; Vitest + SWC in the API; Playwright in web; GitHub Actions runs lint, test, build on every push and PR.
  - Verify: a failing test makes CI red; fixing it makes CI green.
  - Files: `.github/workflows/ci.yml`, lint/test configs

- [ ] **T03 [L] Database and health check**
  - Acceptance: Prisma in `apps/api/prisma`; local Postgres via `docker compose` (local only); separate test database; `GET /health` checks the DB.
  - Verify: `bunx prisma migrate dev` runs; `/health` returns 200, and 503 with the DB stopped.
  - Files: `apps/api/prisma/schema.prisma`, `docker-compose.dev.yml`, `apps/api/src/health/*`
  - Reqs: SYS-026

- [ ] **T04 [L] Railway deploy, end to end**
  - Acceptance: Dockerfiles for web and API; Railway project with web, API and Postgres services; pre-deploy `prisma migrate deploy`; health check on `/health`; a staging environment that deploys on push to `main` after CI passes.
  - Verify: push a change, see it live on Railway URLs over HTTPS; break the health check and confirm the old version stays up.
  - Files: `apps/web/Dockerfile`, `apps/api/Dockerfile`, `railway.json` (or per-service config)
  - Reqs: SYS-020, SYS-021, SYS-022, SYS-025, SYS-027, SYS-028

- [ ] **T05 [L] Shared API building blocks**
  - Acceptance: global DTO validation; one error response shape with error codes; kobo money helpers; UTC storage + Africa/Lagos formatting; rate-limit guard; Turnstile verification service; Nigerian phone normaliser in `packages/shared`.
  - Verify: unit tests for money, time, phone (`08031234567` → `+2348031234567`) and Turnstile (mocked Cloudflare).
  - Files: `apps/api/src/common/*`, `packages/shared/src/phone.ts`
  - Reqs: SYS-007, SYS-008, IDN-021, IDN-022, MOD-010, CTR-009

## Phase 1 — identity

- [ ] **T06 [L] User, profile and audit models**
  - Acceptance: `User`, `MerchantProfile` (with `emailBouncedAt` on User), `AuditLog`; `AuditService.record` used by later modules.
  - Verify: migration runs; audit service test writes and reads a record.
  - Files: `schema.prisma`, `apps/api/src/identity/audit.service.ts`
  - Reqs: identity data model, I1, I3, SYS-009

- [ ] **T07 [L] Clerk auth guard and roles**
  - Acceptance: guard verifies Clerk session tokens; creates the local user on first call; `MerchantGuard`, `AdminGuard`; status check returns `ACCOUNT_INACTIVE`; role read only from DB.
  - Verify: tests for no token (401), bad token (401), merchant on admin route (403), suspended merchant writing (403), suspended merchant on `GET /me` (200), client-sent role ignored.
  - Files: `apps/api/src/identity/auth/*`
  - Reqs: SYS-004–006, IDN-003, IDN-010, IDN-012–014

- [ ] **T08 [L] Clerk webhook sync**
  - Acceptance: `/webhooks/clerk` verifies signature, handles created / updated / deleted, idempotent.
  - Verify: valid event creates one user; replay creates none; forged signature → 400.
  - Files: `apps/api/src/identity/clerk-webhook.controller.ts`
  - Reqs: IDN-002, IDN-004–007

- [ ] **T09 [L] `/me` and merchant profile**
  - Acceptance: `GET /me` with `profileComplete`; `PUT /me/profile` with validation and phone normalising; email never in public responses.
  - Verify: tests for valid and invalid numbers, completeness flag.
  - Files: `apps/api/src/identity/me.controller.ts`, DTOs
  - Reqs: IDN-020–026

- [ ] **T10 [L] Web sign-in, dashboard shell and profile**
  - Acceptance: Clerk sign-in/up with email and Google only; middleware redirects for `/dashboard/**` and `/admin/**`; dashboard layout; profile onboarding page shown first until complete; "WhatsApp same as phone" tick box.
  - Verify: Playwright: sign up → profile page → complete → dashboard; signed-out visit to `/dashboard` redirects.
  - Files: `apps/web/app/(auth)/*`, `apps/web/app/dashboard/*`, `apps/web/middleware.ts`
  - Reqs: IDN-001, IDN-015, IDN-016, IDN-023, IDN-024

- [ ] **T11 [L] Admin seed and admin management**
  - Acceptance: one-time `seed:admin <clerkUserId>`; `/admin/users` list with search and filters; grant/revoke admin with all safety rules; welcome email hook point left for T31.
  - Verify: seed twice fails the second time; revoking last admin or self rejected; audit rows written.
  - Files: `apps/api/src/identity/admin-users.*`, `apps/api/scripts/seed-admin.ts`, `apps/web/app/admin/users/*`
  - Reqs: IDN-011, IDN-030–033, IDN-040–046

**◆ Checkpoint A** — see `tasks/plan.md`.

## Phase 2 — listings

- [ ] **T12 [L] Campuses and areas**
  - Acceptance: `Campus`, `Area`, `CampusArea`; admin create, rename, deactivate, link/unlink with safety rules; `GET /public/locations` cached 5 min; `/admin/locations` page.
  - Verify: tests for slug kept on rename, unlink blocked with live listings, inactive hidden from public list.
  - Files: `apps/api/src/listings/locations/*`, `apps/web/app/admin/locations/*`
  - Reqs: LST-060–068, SYS-013

- [ ] **T13 [L] Listing create and edit**
  - Acceptance: `Listing`, `ListingFee` models; create draft, edit, read own, delete (archive); all content rules including fee declarations, contact-detail blocking, `annualRentKobo`, field locks when published.
  - Verify: tests per requirement; merchant B gets 404 on merchant A's listing everywhere.
  - Files: `apps/api/src/listings/*`
  - Reqs: LST-001–019, LST-054, LST-055

- [ ] **T14 [L] Photos via Cloudinary**
  - Acceptance: signed upload params scoped to `listings/<id>`; register, delete, reorder; limits; web uploader with progress.
  - Verify: tests for folder scope, 11th photo, deleting last photo of a published listing.
  - Files: `apps/api/src/listings/photos/*`, `apps/web/components/photo-uploader.tsx`
  - Reqs: LST-030–035

- [ ] **T15 [L] Lifecycle and visibility**
  - Acceptance: one state-machine function enforcing the lifecycle table; `isPublic`, `publicQuery`, `getPublicById` share one rule; availability endpoint; `markExpired`, `remove`, `restore`, `archive`, `extendExpiry`.
  - Verify: table-driven test of every allowed and disallowed transition; visibility tests for each hidden case.
  - Files: `apps/api/src/listings/lifecycle.ts`, `listings.service.ts`
  - Reqs: LST-040–043, LST-050–057

- [ ] **T16 [L] Merchant listing pages**
  - Acceptance: `/dashboard/listings` with status, availability one-tap toggle, expiry; create/edit form with fee section; preview matches the public page.
  - Verify: Playwright: create a draft with photos and fees, preview it, toggle availability.
  - Files: `apps/web/app/dashboard/listings/*`
  - Reqs: LST-042, listings web routes

## Phase 3 — billing ║ discovery

- [ ] **T17 [L] Plans, orders and Bachs checkout**
  - Acceptance: start with a 1-hour sandbox spike using `@bachs/sdk`; then plans seed, `GET /plans`, `POST /orders` saving the order first and creating an NGN checkout with reference, metadata, customer and payment methods; retry reuses the order.
  - Verify: sandbox: order created and `checkout_url` opens; client-sent amount ignored.
  - Files: `apps/api/src/billing/*`
  - Reqs: BIL-001–016, BIL-063

- [ ] **T18 [L] Bachs webhook and grants**
  - Acceptance: raw-body route; `constructEvent` verification; event dedupe; fetch checkout and check status, currency and amount; paid → order + grant in one transaction; held for review on mismatch; expired then paid handled; 5xx on own failures.
  - Verify: tests from the billing acceptance list, using `bachs listen` in sandbox and recorded payloads in CI.
  - Files: `apps/api/src/billing/bachs-webhook.controller.ts`
  - Reqs: BIL-020–031

- [ ] **T19 [L] Publish and renew with entitlements**
  - Acceptance: `consume(merchantId, listingId, startsAt)` with conditional update inside the publish transaction; earliest-expiring grant first; 90-day validity; publish, early renewal stacking, 180-day cap; auto-publish after payment via `forListingId`.
  - Verify: concurrency test (two publishes, one slot); renewal date maths; cap rejection uses no slot.
  - Files: `apps/api/src/billing/entitlements.service.ts`, `apps/api/src/listings/publish.service.ts`
  - Reqs: LST-020–027, BIL-031, BIL-040–045

**◆ Checkpoint B**

- [ ] **T20 [L] Billing pages and admin billing**
  - Acceptance: plans page (with `?listing=`), return page polling every 3 s for 2 min, `/dashboard/billing`; `/admin/orders` with held filter and resolve; `/admin/plans`; free-trial grant on `/admin/users/:id`.
  - Verify: Playwright sandbox purchase shows "Paid" only after webhook; free trial creates no order row.
  - Files: `apps/web/app/dashboard/billing/*`, `apps/web/app/admin/orders/*`, `apps/web/app/admin/plans/*`
  - Reqs: BIL-015, BIL-050–062

- [ ] **T21 [L] Public search API**
  - Acceptance: `GET /public/listings` with campus/area slugs, types, yearly price range, keyword, sort, 20 per page; featured; invalid filters ignored; 120/min rate limit.
  - Verify: tests from the discovery acceptance list.
  - Files: `apps/api/src/discovery/*`
  - Reqs: DSC-001–011, DSC-044

- [ ] **T22 [L] Public pages**
  - Acceptance: server-rendered home, results and detail pages; result cards; fee breakdown with "None"; taken banner; 404 page; Open Graph tags; share button; contact and report slots.
  - Verify: Playwright at 360px and desktop; WhatsApp link preview checked by hand.
  - Files: `apps/web/app/(public)/*`
  - Reqs: DSC-020–037, DSC-040, DSC-043, DSC-045

**◆ Checkpoint C**

- [ ] **T23 [F] Performance budget**
  - Acceptance: Cloudinary transforms everywhere; lazy loading below the fold; Lighthouse CI on `/listings` and `/listings/:id` with slow-4G mobile profile.
  - Verify: LCP ≤ 3 s in CI.
  - Reqs: DSC-041, DSC-042

## Phase 4 — contact-tracking ║ moderation

- [ ] **T24 [L] Contact buttons and counting**
  - Acceptance: Turnstile on tap; `POST /public/listings/:id/contact` returns `tel:` or `wa.me` with the English message and records the event; desktop shows number with copy; view beacon; self, admin and bot exclusion; dedupe and rate limit.
  - Verify: tests from the contact-tracking acceptance list; page HTML contains no number.
  - Files: `apps/api/src/contact/*`, `apps/web/components/contact-buttons.tsx`
  - Reqs: CTR-001–016

- [ ] **T25 [F] Stats rollup and stats pages**
  - Acceptance: hourly rollup by Lagos day; 180-day raw retention; merchant stats on `/dashboard/listings` and per-listing page ship at launch as a minimal version; full `/admin/stats` is the follow-up.
  - Verify: rollup totals equal raw events.
  - Reqs: CTR-020–026

- [ ] **T26 [L] Reports**
  - Acceptance: report form with Turnstile, honeypot, phone prompt for scam reasons; spam rules; qualifying flag; taken-report event.
  - Verify: tests from the moderation acceptance list for MOD-001–017.
  - Files: `apps/api/src/moderation/reports/*`, `apps/web/components/report-form.tsx`
  - Reqs: MOD-001–017

- [ ] **T27 [L] Admin queue and manual actions**
  - Acceptance: `/admin/reports` ordering; remove, restore, dismiss; manual suspend and reinstate; merchant sees reasons and the support contact from env.
  - Verify: tests for MOD-020–035.
  - Files: `apps/api/src/moderation/admin/*`, `apps/web/app/admin/reports/*`, `apps/web/app/admin/listings/*`
  - Reqs: MOD-020–035

- [ ] **T28 [L] Automatic suspension and appeals**
  - Acceptance: 3 qualifying reports / 3 phone numbers / 48 h trigger in one transaction; `SuspendedListing` snapshot; merchant "under review" page and one appeal; `/admin/suspensions` with 36-hour highlight; case page with notes; clear (lost days back via `extendExpiry`) and confirm.
  - Verify: tests for MOD-050–074, including the 2.5-day → 3 days and expired-while-hidden cases.
  - Files: `apps/api/src/moderation/suspensions/*`, `apps/web/app/admin/suspensions/*`, `apps/web/app/dashboard/appeal/*`
  - Reqs: MOD-050–074, LST-056, LST-057, IDN-031 (I2)

**◆ Checkpoint D**

- [ ] **T29 [F] Audit-log viewer**
  - Acceptance: `/admin/audit` with filters; "Automatic" for `SYSTEM`; no edit/delete endpoints.
  - Reqs: MOD-080, MOD-081

## Phase 5 — notifications, listing-expiry

- [ ] **T30 [L] Outbox and email worker**
  - Acceptance: `Notification` table; `enqueue(tx, …)`; 30-second worker with advisory lock, Resend idempotency key, retries; admin fan-out; `/admin/notifications` with Resend button.
  - Verify: tests for NTF-001–010, NTF-050–051 with Resend mocked.
  - Files: `apps/api/src/notifications/*`
  - Reqs: NTF-001–010, NTF-050, NTF-051

- [ ] **T31 [L] Email templates and wiring**
  - Acceptance: every type in the catalogue (including welcome), HTML + plain text, short English copy; `enqueue` calls added in billing, moderation, listings and identity transactions.
  - Verify: snapshot test per template; no template contains a reporter phone field.
  - Files: `apps/api/src/notifications/templates/*`
  - Reqs: NTF-020–024, email catalogue, MOD-051

- [ ] **T32 [L] One-tap availability links**
  - Acceptance: `ActionToken`; GET shows buttons and changes nothing; POST applies once; expired/used/suspended handled.
  - Verify: tests for NTF-030–035.
  - Files: `apps/api/src/notifications/availability/*`, `apps/web/app/availability/[token]/*`
  - Reqs: NTF-030–035

- [ ] **T33 [F] Bounce handling**
  - Acceptance: Resend webhook with signature check; `emailBouncedAt`; skip and dashboard banner; cleared on email change.
  - Reqs: NTF-040–043

- [ ] **T34a [L] Expiry, reminders and archiving**
  - Acceptance: expire job (15 min, batched), reminder job (hourly, grouped per merchant, short-trial rule), archive job (daily, skips under-review merchants, never drafts); timings from env.
  - Verify: tests from the listing-expiry acceptance list using a fake clock.
  - Files: `apps/api/src/listing-expiry/*`
  - Reqs: EXP-001–023

- [ ] **T34b [F] Availability nudges**
  - Acceptance: daily nudge job with the 14-day rule and skips.
  - Reqs: EXP-030–033

## Phase 6 — Hardening and launch

- [ ] **T35 [L] End-to-end journeys**
  - Acceptance: Playwright, at 360px and desktop: (1) browse and contact, (2) merchant create → pay (sandbox) → publish, (3) report → admin remove, (4) expiry with a fake clock.
  - Verify: all four green in CI.
  - Reqs: SPEC success criteria

- [ ] **T36 [L] Security pass**
  - Acceptance: an authorization matrix test hitting every endpoint as anonymous, merchant, other merchant, suspended merchant and admin; forged-webhook tests for Clerk, Bachs, Resend; a test that public JSON never contains email, phone (outside the contact endpoint), reporter data or Clerk ids.
  - Verify: matrix test green; any new endpoint without a matrix row fails the test.
  - Reqs: SYS-001–006, SYS-012, IDN-026, MOD-006, CTR-003

- [ ] **T37 [L] Backups and monitoring**
  - Acceptance: weekly GitHub Actions `pg_dump` to R2 keeping 4 weeks; one full restore into a fresh database with the app running against it; external uptime monitor on `/health` alerting the admin email.
  - Verify: restore test documented in `docs/runbooks/restore.md`; uptime alert fires when the API is stopped.
  - Reqs: SYS-023, SYS-024, SYS-026

- [ ] **T38 [L] Production and launch checklist**
  - Acceptance: production Railway environment; custom domain behind Cloudflare; every item in the `SPEC.md` launch checklist ticked; first admin seeded; first campuses and areas entered.
  - Verify: one real ₦2,000 payment end to end in production, then refund it by hand in Bachs.

## Post-launch follow-ups

- [ ] **T39 [F] Copy to new draft**
  - Acceptance: `POST /listings/:id/copy` for archived or expired listings; deactivated location fields left empty.
  - Reqs: EXP-040–042 (A5)
