# Spec: identity

Status: APPROVED 2026-10-23
Module id: `identity` · Depends on: — · Used by: every other module
Project spec: `SPEC.md` (SYS-001 to SYS-013 apply)

## Objective

Let merchants and admins sign in with Clerk, keep the authoritative record of who they are and what role they hold in MoveIn's own database, and hold the merchant contact details that listings display. Students never sign in.

## Scope

In: Clerk sign-up/sign-in pages, API token verification, local user records synced from Clerk, roles (`merchant`, `admin`), admin management dashboard (list users, grant and revoke admin), merchant profile, account status (`active`, `suspended`, `deleted`), the service methods other modules use to check a user.

Out: the admin UI and endpoints for suspending merchants (owned by `moderation`, which calls this module's service); student accounts; verification badges; phone/SMS sign-in; merchant types (landlord, homeowner and agent are not distinguished).

## Decisions

1. Sign-in methods: email (code or password) and Google only. No phone/SMS sign-in.
2. The first admin is created by a one-time seed command. After that, admins grant and revoke admin access from the admin management dashboard.
3. One account = one merchant. Landlords, homeowners and agents are all just "merchants".

## Data model (Prisma)

```prisma
enum Role { MERCHANT ADMIN }
enum UserStatus { ACTIVE SUSPENDED DELETED }

model User {
  id           String     @id @default(uuid())
  clerkUserId  String     @unique
  email        String
  role         Role       @default(MERCHANT)
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  profile      MerchantProfile?
}

model MerchantProfile {
  userId        String       @id
  user          User         @relation(fields: [userId], references: [id])
  displayName   String
  phoneE164     String
  whatsappE164  String
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}
```

## Interfaces

**HTTP (API)**

| Method | Path                    | Who             | Purpose                                                              |
| ------ | ----------------------- | --------------- | -------------------------------------------------------------------- |
| GET    | `/me`                   | merchant, admin | Current user, role, status, profile, `profileComplete`               |
| PUT    | `/me/profile`           | merchant        | Create or update merchant profile                                    |
| POST   | `/webhooks/clerk`       | Clerk (signed)  | Sync `user.created`, `user.updated`, `user.deleted`                  |
| GET    | `/admin/users`          | admin           | List users (search by email or display name; filter by role, status) |
| PUT    | `/admin/users/:id/role` | admin           | Grant or revoke `ADMIN`                                              |

**Service (for other modules)**

```ts
interface IdentityService {
  getById(userId: string): Promise<User | null>;
  isActiveMerchant(userId: string): Promise<boolean>;
  isProfileComplete(userId: string): Promise<boolean>;
  setStatus(userId: string, status: UserStatus, actorId: string, reason: string): Promise<void>;
}
```

**Web routes**

| Route                  | Access                                                |
| ---------------------- | ----------------------------------------------------- |
| `/sign-in`, `/sign-up` | public (Clerk components)                             |
| `/dashboard/**`        | signed-in merchant                                    |
| `/dashboard/profile`   | signed-in merchant; shown first if profile incomplete |
| `/admin/**`            | signed-in admin                                       |
| `/admin/users`         | signed-in admin; admin management dashboard           |

## Requirements

### Sign-up and sync

| Id      | Requirement                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDN-001 | The web app shall offer sign-up and sign-in only to merchants and admins, through Clerk, using email and Google, and shall not offer phone/SMS sign-in.       |
| IDN-002 | When Clerk sends a `user.created` webhook, the API shall create a local user with role `MERCHANT` and status `ACTIVE`, if none exists for that Clerk user id. |
| IDN-003 | When an authenticated request arrives for a Clerk user id with no local user, the API shall create the local user as in IDN-002 before handling the request.  |
| IDN-004 | When Clerk sends a `user.updated` webhook, the API shall update the stored email.                                                                             |
| IDN-005 | When Clerk sends a `user.deleted` webhook, the API shall set the local user's status to `DELETED` and keep the record.                                        |
| IDN-006 | If a Clerk webhook has a missing or invalid signature, then the API shall respond 400 and make no change.                                                     |
| IDN-007 | When the same Clerk webhook event is received more than once, the API shall apply it only once.                                                               |

### Roles and access

| Id      | Requirement                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDN-010 | The API shall read a user's role only from its own database, never from the client or from Clerk metadata.                                           |
| IDN-011 | The API shall assign the `ADMIN` role only through the one-time seed command or the admin role endpoint (IDN-040).                                   |
| IDN-012 | If a user with role `MERCHANT` calls an admin endpoint, then the API shall respond 403.                                                              |
| IDN-013 | If a user with status `SUSPENDED` or `DELETED` calls any merchant write endpoint, then the API shall respond 403 with error code `ACCOUNT_INACTIVE`. |
| IDN-014 | While a user's status is `SUSPENDED`, the API shall still allow `GET /me` so the web app can explain the suspension.                                 |
| IDN-015 | If a signed-in user opens `/admin/**` and `GET /me` does not return role `ADMIN`, then the web app shall redirect them to `/dashboard`.              |
| IDN-016 | If a signed-out visitor opens `/dashboard/**` or `/admin/**`, then the web app shall redirect them to `/sign-in`.                                    |

### Merchant profile

| Id      | Requirement                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDN-020 | The API shall require display name (2–60 characters), phone number and WhatsApp number for a complete profile.                                                                                |
| IDN-021 | When a merchant saves a phone or WhatsApp number given as `0XXXXXXXXXX`, `234XXXXXXXXXX` or `+234XXXXXXXXXX`, the API shall store it in E.164 form (`+234` followed by 10 digits).            |
| IDN-022 | If a phone or WhatsApp number is not a valid Nigerian mobile number (10 digits after the country code, starting with 7, 8 or 9), then the API shall reject the save with a field-level error. |
| IDN-023 | Where the merchant ticks "WhatsApp is the same as my phone number", the web app shall send the phone number as the WhatsApp number.                                                           |
| IDN-024 | While a merchant's profile is incomplete, the web app shall send them to `/dashboard/profile` before any other dashboard page.                                                                |
| IDN-025 | The API shall return `profileComplete: true` from `GET /me` only when every IDN-020 field is valid.                                                                                           |
| IDN-026 | The API shall never include the user's email in any public (unauthenticated) response.                                                                                                        |

### Status changes (called by moderation)

| Id      | Requirement                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDN-030 | When `setStatus` is called, the API shall update the user's status and write an audit record (SYS-009).                                                                                      |
| IDN-031 | If `setStatus` is called with an actor who is not an `ADMIN`, then the API shall reject the change, except for the `SYSTEM` actor setting `SUSPENDED` during automatic suspension (MOD-050). |
| IDN-032 | If `setStatus` is asked to change a `DELETED` user, then the API shall reject the change.                                                                                                    |
| IDN-033 | `isActiveMerchant` shall return true only for role `MERCHANT` with status `ACTIVE`.                                                                                                          |

### Admin management

| Id      | Requirement                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDN-040 | When an admin grants or revokes the `ADMIN` role on `/admin/users`, the API shall update the role and write an audit record (SYS-009).                                                                     |
| IDN-041 | If the seed command is run while any `ADMIN` already exists, then the API shall refuse to create another admin and exit with an error.                                                                     |
| IDN-042 | If a role change would leave zero active admins, then the API shall reject it.                                                                                                                             |
| IDN-043 | If an admin tries to revoke their own `ADMIN` role, then the API shall reject it.                                                                                                                          |
| IDN-044 | If an admin tries to grant `ADMIN` to a user whose status is not `ACTIVE`, then the API shall reject it.                                                                                                   |
| IDN-045 | When an admin opens `/admin/users`, the web app shall list users with display name, email, role, status and sign-up date, searchable by email or display name and filterable by role and status.           |
| IDN-046 | When a user's role changes from `MERCHANT` to `ADMIN`, the API shall keep their merchant profile and listings stored but treat the listings as not public (IDN-033), until the role returns to `MERCHANT`. |

## Acceptance tests

- Valid Clerk `user.created` creates one local merchant; replaying it creates none (IDN-002, IDN-007).
- Forged Clerk webhook returns 400, database unchanged (IDN-006).
- First authenticated call without a prior webhook creates the user (IDN-003).
- Client-sent `role: "ADMIN"` in any body is ignored (IDN-010).
- Merchant calling an admin endpoint gets 403 (IDN-012); suspended merchant writing gets 403 `ACCOUNT_INACTIVE` (IDN-013) but `GET /me` works (IDN-014).
- `08031234567`, `2348031234567`, `+2348031234567` all store as `+2348031234567`; `0803123456` and `+2341031234567` are rejected (IDN-021, IDN-022).
- Dashboard redirects to profile until complete (IDN-024); public listing JSON contains no email (IDN-026).
- Seed creates the first admin; running it again fails (IDN-041).
- Admin grants admin to an active merchant, audit row written (IDN-040); revoking the last admin or one's own admin role is rejected (IDN-042, IDN-043).

## Open questions

None. Resolved 2026-10-23: admins cannot list properties; an admin's existing listings stay stored but are hidden (IDN-033, IDN-046).

## Amendments

| Id  | Date       | Change                                                                                             | Status   |
| --- | ---------- | -------------------------------------------------------------------------------------------------- | -------- |
| I1  | 2026-10-23 | Audit-log writer (`AuditLog` model, `AuditService.record`) lives in identity; every module uses it | Approved |
| I2  | 2026-10-23 | IDN-031 allows the `SYSTEM` actor for automatic suspension                                         | Approved |
| I3  | 2026-10-23 | `User.emailBouncedAt DateTime?` for bounced email handling (NTF-040 to NTF-042)                    | Approved |
