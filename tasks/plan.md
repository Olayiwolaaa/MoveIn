# Implementation plan: MoveIn v1

Status: APPROVED 2026-10-23 — launch at ~6 weeks with [L] tasks; [F] tasks in weeks 7–8
Inputs: `SPEC.md` and `specs/SPEC-*.md` (all approved 2026-10-23) · Task list: `tasks/todo.md`

## The honest timeline

The approved scope is 40 tasks (T01–T39, with T34 split in two). At roughly one focused task per working day for one person, that is **7–8 weeks**, not 4–6. The scope grew during specification (automatic suspension and appeals, admin-managed locations, availability nudges, stats).

To protect the 6-week target, every task is tagged:

- **[L] Launch-critical** — must be done before real merchants pay.
- **[F] Follow-up** — can ship in the first 2 weeks after launch without breaking anything students or merchants rely on.

The [F] tasks total about 7 days. Cutting them gives a realistic **~6-week launch**, with the follow-ups in weeks 7–8.

| [F] task                     | Why it can wait                                                          |
| ---------------------------- | ------------------------------------------------------------------------ |
| T23 Performance budget in CI | Check speed by hand before launch instead                                |
| T25 Admin stats page         | Merchant stats ship at launch; you can query the database meanwhile      |
| T29 Audit-log viewer         | Audit records are still written from day one; only the viewer waits      |
| T33 Bounce handling          | Low volume at launch; failed emails still show on `/admin/notifications` |
| T34b Availability nudges     | Expiry and reminders ship; the 14-day nudge follows                      |
| T39 Copy to new draft        | No listing reaches archive until day 44                                  |

## Start these outside the code now

These have waiting times that could block launch, so start them in week 1:

1. **Bachs live verification** — sign up and submit for go-live (Bachs says reviews usually take up to 48 hours, but plan for longer). Confirm NGN card and bank transfer are enabled.
2. **Merchant outreach in Ilorin** — the code is not the biggest risk; empty search results are. Line up the first 10–20 merchants for free trials while you build.
3. **Domain** — pick and buy it; Resend needs it verified for email (launch checklist).

## Build order and dependencies

```
Phase 0  Foundation            T01 → T02 → T03 → T04 → T05
                                                   │
Phase 1  identity              T06 → T07 → T08 → T09 → T10 → T11
                                                   │      ◆ Checkpoint A
Phase 2  listings              T12 → T13 → T14 → T15 → T16
                                          │                 │
Phase 3  billing  ║ discovery  T17 → T18 → T19 → T20   T21 → T22 → T23[F]
                                          ◆ Checkpoint B         ◆ Checkpoint C
Phase 4  contact  ║ moderation T24 → T25[F]          T26 → T27 → T28 → T29[F]
                                                                  ◆ Checkpoint D
Phase 5  notifications, expiry T30 → T31 → T32 → T33[F] ; T34a → T34b[F]
Phase 6  hardening, launch     T35 → T36 → T37 → T38            ◆ Launch
Post     follow-ups            T39[F]
```

`║` = the two tracks can be done in either order or interleaved. Notifications (T30) can start earlier if you want emails from the start; T31 then wires each email in as its module lands.

## Weekly view (launch-critical path)

| Week | Tasks            | You can demo                                                                |
| ---- | ---------------- | --------------------------------------------------------------------------- |
| 1    | T01–T07          | Monorepo deploying to Railway; sign-in guarded API                          |
| 2    | T08–T13          | Merchant signs up, completes profile; admin manages locations; drafts saved |
| 3    | T14–T19          | Photos upload; sandbox payment publishes a listing                          |
| 4    | T20–T22, T24     | Students search, open a listing and tap Call/WhatsApp                       |
| 5    | T26–T28, T30–T32 | Reports, auto-suspension and appeals; emails sending                        |
| 6    | T34a, T35–T38    | Expiry running; end-to-end tests; production live                           |

## Checkpoints

| Checkpoint         | Proves                   | Must pass before continuing                                                                                              |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A (after T11)      | Auth and roles are right | Forged Clerk webhook rejected; merchant → admin endpoint 403; suspended merchant can't write                             |
| B (after T19)      | Money is safe            | Sandbox card publishes a listing; declined card and forged webhook change nothing; two concurrent publishes use one slot |
| C (after T22)      | Students can find places | Only public, available listings in search; detail page has no phone number; works at 360px                               |
| D (after T28)      | Trust tools work         | Three qualifying reports suspend a merchant; clearing gives the lost days back                                           |
| Launch (after T38) | Ready for real merchants | Every [L] requirement has a passing test; launch checklist in `SPEC.md` complete                                         |

## Risks

| Risk                                                                              | Impact                              | Mitigation                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Bachs live approval slow, or NGN corridors not enabled                            | Can't take payments at launch       | Apply in week 1; launch on free trials if live access is late (admins can grant them, BIL-050) |
| Bachs SDK or API differs from the docs read during spec                           | Billing rework                      | T17 starts with a sandbox spike against the real SDK before building on it                     |
| Clerk token verification in NestJS                                                | Auth delays                         | T07 is early and small; use Clerk's official backend SDK                                       |
| Railway region or features differ from assumptions (backups, pre-deploy commands) | Deploy rework                       | T04 deploys a hello-world end to end in week 1                                                 |
| Empty marketplace at launch                                                       | Students leave, merchants won't pay | Merchant outreach in parallel; free trials                                                     |
| Running behind                                                                    | Missed season                       | Cut [F] tasks first; never cut payment verification or authorization tests                     |

## How each task is done

1. Read the requirement ids in the task.
2. Write failing tests named with those ids.
3. Implement until they pass.
4. Run `bun run lint && bun run test` before committing.
5. Commit with the task id: `T13: listing create/edit with content rules (LST-001..019)`.
6. Tick the task in `tasks/todo.md`.
