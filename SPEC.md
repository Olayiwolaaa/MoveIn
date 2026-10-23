# Spec: MoveIn v1 (project level)

Status: DRAFT — awaiting approval
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
| Backend | NestJS + TypeScript |
| Auth | Clerk (merchants and admins only) |
| Payments | Bachs (hosted checkout + webhooks) |
| Database | PostgreSQL + Prisma |
| Images | Cloudinary |
| Email | Resend |

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
| SYS-013 | Where the area/campus list is used, the system shall read it from one shared source in `packages/shared`. |

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

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-23 | Repo starts empty; Bun workspaces monorepo. |
| 2026-10-23 | Prisma, Cloudinary, Resend accepted. |
| 2026-10-23 | No pre-publication review; listings go live once paid; admins remove afterwards. |

## Open questions

1. **Bun as API runtime:** run NestJS on Bun in production, or use Bun only for installs and scripts and run the API on Node? (Proposal: Node runtime for the API until Nest + Prisma are tested on Bun.)
2. **Expiry timing:** reminder at day 25, hide at day 30, archive after 14 more days? (Proposal.)
3. **Plans and prices:** keep ₦2,000 single / ₦8,000 five-pack / ₦15,000 ten-pack, all 30 days?
4. **Areas and campuses** for filters: UNILORIN, KWASU, Kwara Poly — which at launch, and which neighbourhoods (Tanke, Oke-Odo, Fate, …)?
5. **Bachs account:** confirmed live access for one-off NGN payments?
6. **Hosting:** where will web, API and Postgres run?
