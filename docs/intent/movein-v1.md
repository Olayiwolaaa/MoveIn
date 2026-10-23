# Intent: MoveIn v1

Confirmed: 23 October 2026

- **Outcome:** A website where Ilorin merchants (landlords, homeowners, agents) list places, and students browse, pick one, and call or WhatsApp the merchant directly. MoveIn never handles rent.
- **Users:** Off-campus students, UNILORIN first, no account needed. Merchants are the paying side and the only users who sign up.
- **Why now:** Students lose money to inspection fees, rooms that are already taken, and misleading listings.
- **Success:** Merchants keep paying to list, or renew after a free trial, because tap counts and their own experience show real calls from students. Target: 30–50 live listings near campus.
- **Constraint:** Time. Solo builder, live in about 4–6 weeks.
- **Stack:** Next.js frontend, NestJS backend, Clerk for sign-in, Bachs for payments.

## In scope

- Merchant sign-up and listings with photos
- All fees shown upfront, including inspection fees
- Filters for campus, area, room type, price and availability
- Call and WhatsApp buttons, with tap counts
- Merchants mark a listing Available, Taken or Unavailable
- Anonymous reports; admin screen to approve and remove listings
- Paid listing plans through Bachs (live from day one, confirmed server-side), plus admin-granted free trials
- Expiry: reminder to the merchant, then automatic hide and archive

## Out of scope

Verification badges, other cities, saved favourites, in-app chat, collecting rent, mobile apps, student/renter accounts.
