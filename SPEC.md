# Spec: MoveIn v1 (project level)

Status: APPROVED 2026-10-23
Intent: `docs/intent/movein-v1.md` · Modules: `CAPABILITY-MAP.md` (approved) · Module specs: `specs/SPEC-<module-id>.md`

## How requirements are written (EARS)

Every requirement uses one of five EARS patterns and has a stable id (`<MODULE>-<NNN>`, e.g. `LST-004`). Ids are never reused.

| Pattern | Template |
|---|---|
| Ubiquitous | The `<system>` shall `<response>`. |
| Event-driven | When `<trigger>`, the `<system>` shall `<response>`. |
| State-driven | While `<state>`, the `<system>` shall `<response>`. |
| Unwanted behaviour | If `<unwanted condition>`, then the `<system>` shall `<response>`. |
| Optional feature | Where `<feature is included>`, the `<system>` shall `<response>`. |

Systems named in requirements: **the API** (NestJS backend), **the web app** (Next.js), **the system** (both together).

Each requirement maps to at least one automated test; test names include the requirement id.

## Objective

Connect Ilorin merchants (landlords, homeowners, agents) with off-campus students. Merchants pay to list; students browse without an account and contact merchants directly by call or WhatsApp. MoveIn never handles rent.

Success: merchants pay or renew because tap counts show real student contact. Target 30–50 live listings near UNILORIN.

## Tech stack

| Layer | Choice |
|---|---|
| Package manager / workspaces | Bun workspaces |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeScript, running on Node (Bun runtime deferred until Nest + Prisma are tested on it) |
| Auth | Clerk (merchants and admins only) |
| Payments | Bachs (hosted checkout + webhooks) |
| Database | PostgreSQL + Prisma |
| Images | Cloudinary |
| Email | Resend |
| Bot check | Cloudflare Turnstile (report form, contact buttons) |

Versions are pinned at scaffold time and recorded here.

## Commands

Proposed; finalised when the repo is scaffolded.

```
bun install
bun run --filter web dev
bun run --filter api start:dev
bun run build
bun run lint
bun run test
bun run test:e2e
bunx prisma migrate dev
```

## Project structure

```
apps/web/                    Next.js app (public site, merchant dashboard, admin)
apps/api/                    NestJS API
apps/api/src/<module-id>/    one Nest module per capability-map id
apps/api/prisma/             Prisma schema and migrations
packages/shared/             shared TypeScript types and constants (areas, campuses, enums)
docs/intent/                 confirmed intent
specs/                       SPEC-<module-id>.md
```

## Code style

- TypeScript strict mode in both apps.
- Nest modules named by capability-map id; controllers thin, logic in services.
- Money stored as integer kobo; never floats.
- Request bodies validated with DTOs; no unvalidated input reaches a service.

```ts
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post(':id/publish')
  @UseGuards(MerchantGuard)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listings.publish(id, user.id);
  }
}
```

## Testing strategy

- API: Jest unit tests per service; integration tests against a real test Postgres for each module's EARS requirements.
- Webhooks (Clerk, Bachs): tests with valid, unsigned and forged payloads.
- Web: Playwright e2e for the four core journeys — browse and contact, merchant create-pay-publish, admin remove after report, expiry.
- Test names carry requirement ids so spec coverage can be checked by grep.

## System-wide requirements

| Id | Requirement |
|---|---|
| SYS-001 | The API shall be the sole authority for roles, payment confirmation, entitlements and listing publication. |
| SYS-002 | The web app shall not grant any role, entitlement or listing status on its own. |
| SYS-003 | The system shall allow browsing, searching, viewing listing details, contacting merchants and reporting listings without an account. |
| SYS-004 | When a request reaches a merchant or admin endpoint, the API shall verify the Clerk session token before processing it. |
| SYS-005 | If a merchant or admin request has a missing, expired or invalid token, then the API shall respond 401 and make no change. |
| SYS-006 | If an authenticated user calls an endpoint their role does not permit, then the API shall respond 403 and make no change. |
| SYS-007 | The system shall store all amounts in Nigerian naira as integer kobo. |
| SYS-008 | The system shall store timestamps in UTC and display them in Africa/Lagos time. |
| SYS-009 | When an admin removes or restores a listing, grants a free trial, resolves a report, or suspends or reinstates a merchant, the API shall write an audit record with actor, action, target, reason and timestamp. |
| SYS-010 | The API shall retain payment records even if the related listing is archived or deleted. |
| SYS-011 | The web app shall render all public and merchant pages usably at viewport widths from 360px up. |
| SYS-012 | The system shall never display a merchant's Clerk account email or any private document publicly. |
| SYS-013 | The system shall read campuses and areas only from the admin-managed database tables (LST-060 to LST-068), and property types and amenities only from `packages/shared`. |

## Boundaries

- **Always:** validate input with DTOs; confirm payments server-side via signed webhook; write audit records for admin actions; tag tests with requirement ids; update the spec before changing behaviour.
- **Ask first:** database schema changes outside the module being built; adding a dependency; changing the publication gate; changing prices or plan rules.
- **Never:** activate a listing from a browser payment-success redirect; commit secrets or API keys; store card details; expose admin endpoints without role checks; delete payment records.

## Success criteria (v1 launch)

- Every EARS requirement in the approved module specs has a passing test.
- The four Playwright journeys pass on mobile (360px) and desktop viewports.
- A listing cannot reach public view without an active entitlement and an active merchant (verified by tests on every path).
- A forged or unsigned Bachs or Clerk webhook changes nothing.
- An expired listing disappears from public search without manual action.

## Hosting and deployment

Managed platform for the pilot (decided 2026-10-23). Provider: **Railway**, in its EU region. Check current pricing before signing up.

| Piece | Choice |
|---|---|
| Website | Railway service: `apps/web` (Next.js), built from its Dockerfile |
| API | Railway service: `apps/api` (NestJS on Node), built from its Dockerfile, always on, runs the scheduled jobs in-process |
| Database | Railway PostgreSQL, with Railway's volume backups switched on where the plan offers them, plus the weekly export (SYS-023) |
| HTTPS and domains | Provided by the platform; custom domain added before launch |
| DNS, CDN, protection | Cloudflare in front (same account as Turnstile) |
| Images | Cloudinary |
| Deploys | Automatic on push to `main`; a GitHub Actions check (lint, tests) must pass first |
| Secrets | Platform environment variables only; never in the repo |
| Local webhooks | Cloudflare Tunnel (or the Bachs CLI `bachs listen`) to receive Bachs and Clerk webhooks on a laptop |

The Docker images keep the app portable, so moving to a VPS later means copying the images and restoring the database.

| Id | Requirement |
|---|---|
| SYS-020 | The system shall serve every public, merchant, admin and webhook route over HTTPS only, and redirect HTTP to HTTPS. |
| SYS-021 | The database shall accept connections only from the platform's private network and from admin IPs explicitly allowed for maintenance. |
| SYS-022 | The API and web services shall be built from Dockerfiles in the repo, so the same images can run on another host. |
| SYS-023 | Once a week, a GitHub Actions job shall export a `pg_dump` of the production database to separate object storage (for example Cloudflare R2), keeping 4 weeks; platform backups, where enabled, are an extra layer, not the only one. |
| SYS-024 | Before launch, a backup shall be restored into a fresh database and the app run against it, to prove backups work. |
| SYS-025 | The API shall run as one always-on instance for the scheduled jobs; if more instances are added later, the advisory locks (NTF-009) keep each job single-running. |
| SYS-026 | The API shall expose `GET /health` that checks the database connection, used by the platform's health checks and by an external uptime monitor that alerts the admin email after 2 minutes of failure. |
| SYS-027 | If a deploy fails its health check, then the platform shall keep the previous version running. |
| SYS-028 | Database schema changes shall run as a pre-deploy step (`prisma migrate deploy`), and a failed migration shall stop the deploy. |

## Launch checklist (set before going live)

- [ ] `SUPPORT_EMAIL` and/or `SUPPORT_WHATSAPP` set (moderation decision 1)
- [ ] First campuses and areas entered at `/admin/locations` (LST-068)
- [ ] First admin created with the seed command (IDN-041)
- [ ] Bachs live keys and webhook secret set; live NGN card and bank transfer confirmed
- [ ] Turnstile site key and secret set
- [ ] Sending domain verified in Resend and `MAIL_FROM` set; Resend webhook secret set
- [ ] Custom domain on the website and API; Cloudflare in front
- [ ] Backup restore test done (SYS-024); uptime monitor alerting (SYS-026)

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-23 | Repo starts empty; Bun workspaces monorepo. |
| 2026-10-23 | Prisma, Cloudinary, Resend accepted. |
| 2026-10-23 | No pre-publication review; listings go live once paid; admins remove afterwards. |
| 2026-10-23 | Bun for installs and scripts; NestJS runs on Node until Nest + Prisma are tested on Bun. |
| 2026-10-23 | No phone sign-in; admin management dashboard; no merchant types. |
| 2026-10-23 | Campuses and areas are admin-managed in the database, not hard-coded. |
| 2026-10-23 | Early renewal stacks the new period on the current expiry date. |
| 2026-10-23 | Cloudflare Turnstile added as a dependency. |
| 2026-10-23 | 3 scam reports with phone numbers from different people in 48 hours automatically suspend a merchant; appeal, admin investigation, lost days made up if cleared. |
| 2026-10-23 | Managed platform (Railway) for the pilot instead of a VPS; Docker images keep a later move possible. |
| 2026-10-23 | TypeScript pinned to 5.9 across the workspace. TypeScript 7 removed `moduleResolution: node`, and tools that use the TypeScript JavaScript API (Nest CLI, ts-jest) may not support it yet; revisit once they do. Module resolution uses `NodeNext` (API, shared) and `Bundler` (web). |

## Open questions

None. All specs approved 2026-10-23.

Resolved: hosting (Railway), expiry timings (moved to `SPEC-listing-expiry.md`), plans and prices (BIL-001), campuses and areas (LST-060 to LST-068, launch checklist), Bachs live access (launch checklist).
