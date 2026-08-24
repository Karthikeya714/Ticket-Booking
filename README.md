# Ticket Booking Platform

A full-stack ticket booking platform for movies/concerts with visual seat maps, TTL-based
seat holds, waitlist auto-assignment, and QR-code email tickets.

- `/backend` — Node.js + Express + TypeScript + Prisma (Postgres)
- `/frontend` — React + Vite + TypeScript + Tailwind CSS

Full setup instructions, API documentation, and an explanation of the seat-hold TTL and
waitlist mechanisms will be filled in as part of the documentation phase, once the whole
system is built and verified end-to-end. The DB schema is documented below since it's
finalized as of Phase 1.

## Database schema

Defined in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma). Postgres via Prisma.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | All accounts, one role each | `email` (unique), `password_hash`, `role` (`customer`\|`organiser`\|`admin`) |
| `venues` | A physical location | `created_by_admin_id` → `users` |
| `seats` | A physical seat at a venue, reusable across shows | `venue_id`, `row_label`, `seat_number`, `category`; unique on `(venue_id, row_label, seat_number)` |
| `events` | A movie or concert | `type` (`movie`\|`concert`), `organiser_id` → `users` |
| `shows` | One showtime instance of an event, at a venue | `event_id`, `venue_id`, `date_time`, `status` |
| `show_seat_pricing` | Price per seat category, per show | PK `(show_id, category)`, `price` |
| `show_seats` | The bookable unit — one row per seat per show; this is the row locked during hold/booking | `show_id`, `seat_id` (unique together), `status` (`available`\|`held`\|`booked`), `current_hold_id` → `holds` (nullable) |
| `holds` | A time-limited claim on a `show_seat` | `show_seat_id`, `customer_id`, `expires_at`, `status` (`active`\|`expired`\|`converted`) |
| `bookings` | A confirmed purchase | `customer_id`, `show_id`, `booking_reference` (unique), `status` (`confirmed`\|`cancelled`), `total_price` |
| `booking_seats` | Join table: which `show_seats` belong to a booking | PK `(booking_id, show_seat_id)` |
| `waitlist_entries` | FIFO queue per show+category | `show_id`, `category`, `customer_id`, `status` (`waiting`\|`offered`\|`expired`\|`fulfilled`), `joined_at` |
| `waitlist_offers` | A time-limited offer of a specific freed seat to the head of the queue | `waitlist_entry_id`, `show_seat_id`, `offer_expires_at`, `status` (`pending`\|`accepted`\|`expired`), `token` (unique, signed link) |

Notes:
- `show_seats` is deliberately the row that gets locked for concurrency control (Phase 3) — it's per-show, so the same physical `seat` can be `available` on one show and `booked` on another.
- `holds.show_seat_id` records every hold ever created for a seat (audit trail); `show_seats.current_hold_id` is a single nullable pointer to whichever hold is *currently* active for that seat, so a lookup doesn't need to scan history.
- Seed data (`backend/prisma/seed.ts`, re-runnable — it clears venue/event/show/seat/booking data first, then rebuilds, while upserting users so accounts are stable): 1 admin, 1 organiser, 2 customers; 2 venues (Grand Cinema Hall — 120 seats, STANDARD rows A–C / PREMIUM rows D–I; Riverside Arena — 110 seats, VIP rows A–B / GENERAL rows C–G); 3 events (2 movies, 1 concert — the concert exercises the seat map's STAGE rendering rather than SCREEN); and 6 upcoming shows spread across different days so the date filter has something to filter, each with per-category pricing and all `show_seats` initialized to `available`.
- Rows render nearest-screen-first (row A closest, since the SCREEN arc sits above the seat map). The cinema's pricing follows real-world convention: STANDARD (cheaper) up front in rows A–C, PREMIUM (pricier) further back in rows D–I — a customer can't see this from the code, only by comparing seat prices row by row, so it's called out here explicitly. The concert venue is intentionally the opposite: VIP (pricier) is nearest the stage in rows A–B, matching how concert tickets are actually priced. Pricing is per-category, set at show-creation time (`POST /api/organiser/events/:eventId/shows`) — an organiser can assign any category to any row when a venue is created, this seed data is just one convention, not an enforced rule.

### Multi-seat booking

`booking_seats` was built as a proper junction table from the start specifically so one booking
can cover several seats. The customer flow: hold each seat individually
(`POST /api/shows/:showId/seats/:seatId/hold`, one call per seat — this is the same
concurrency-safe per-seat locking as a single-seat hold, unchanged), then confirm them all at
once via `POST /api/holds/confirm` with `{ holdIds: string[] }`. That endpoint locks every
underlying `show_seats` row in a **fixed order (sorted by id, not hold order)** so two concurrent
multi-seat confirms can never deadlock waiting on each other, and is all-or-nothing — if even one
hold in the batch has expired, none of the seats convert to `booked` (though the lazy-expiry
write for that specific expired hold still commits, same integrity guarantee as everywhere else
in this codebase — see the `Outcome` comment in `backend/src/services/booking.ts`). The original
single-hold `POST /api/holds/:holdId/confirm` endpoint is unchanged and still works for a
single seat.

## Quick start (local dev)

Backend:

```
cd backend
cp .env.example .env   # then edit DATABASE_URL etc.
npm install
npx prisma migrate dev
npm run seed
npm run dev             # http://localhost:4000
```

Frontend:

```
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:5173
```

## Waitlist & time-limited offers

When a seat category is sold out, customers queue up; when a booking is cancelled, the freed
seat is handed down that queue automatically.

- **Joining** (`POST /api/shows/:showId/waitlist`) is rejected while any seat in the category is
  still bookable — including a seat sitting in `held` whose hold has already lapsed but that the
  cron hasn't reclaimed yet, so nobody is queued for a category that isn't genuinely full.
- **On cancellation** (`POST /api/bookings/:bookingId/cancel`) the seats are freed, then for each
  freed category the longest-waiting entry is matched with a free seat: a `waitlist_offers` row is
  created with its own TTL (`WAITLIST_OFFER_TTL_MINUTES`, default 30), the entry becomes
  `offered`, and the seat is reserved. The waitlist pass runs *after* the cancel transaction
  commits, so seat locks stay short and an offering problem can never roll back a cancellation.
- **Reserved-for-offer seats** are stored as `status='held'` with `current_hold_id = NULL`. That
  distinguishes them from ordinary checkout holds: the lazy-expiry path deliberately skips them,
  so an expired offer's seat passes to the next person in the queue rather than being grabbed by
  whoever clicks first — which would break FIFO fairness.
- **Accepting** (`POST /api/waitlist-offers/:offerId/accept`) converts the offer to a booking in
  one locked transaction, marking the offer `accepted` and the entry `fulfilled`. The emailed link
  carries an unguessable 32-byte token that the frontend resolves via
  `GET /api/waitlist-offers/by-token/:token`.
- **Unclaimed offers** are expired by the same cron that sweeps holds. Expiring an offer releases
  its seat and immediately re-offers it to the next waiting entry, looping until someone accepts
  or the queue empties. The accept path applies the same lazy check, so a customer clicking a
  stale link gets a clean `409 OFFER_EXPIRED` and the seat cascades on without waiting for cron.

Assumption made here (not specified in the brief): a customer may hold only one active waitlist
entry per show+category — a second join returns `409`.

## QR codes & email delivery

- On booking confirmation — via direct checkout (`POST /api/holds/:holdId/confirm`) or waitlist
  offer acceptance (`POST /api/waitlist-offers/:offerId/accept`) — a QR PNG is generated
  server-side (`qrcode`) encoding **only** the `booking_reference`, never seat/customer/price
  details, and embedded inline in a confirmation email via Nodemailer.
- Waitlist offer emails carry a distinct time-limited link (`{FRONTEND_URL}/waitlist-offer/:token`)
  instead of a QR — there's nothing to scan yet, since accepting the offer is what creates the
  booking (and therefore the QR) in the first place.
- Email sending is fire-and-forget from the caller's perspective and **never throws** — a booking
  or offer that already committed can't be undone by an SMTP failure. Without `SMTP_USER` /
  `SMTP_APP_PASSWORD` set, sends fall back to a console log (`[email:stub] ...`) instead of
  erroring, so the whole booking/waitlist flow stays testable without real credentials.
- Nodemailer is configured for Gmail SMTP (`service: "gmail"`) using an
  [App Password](https://support.google.com/accounts/answer/185833) — a regular account password
  won't work with 2FA enabled. To swap in Resend/SendGrid instead: replace the
  `nodemailer.createTransport(...)` call in `backend/src/services/mailer.ts` with that provider's
  transport config; nothing else in the codebase needs to change since callers only see
  `sendBookingConfirmationEmail` / `sendWaitlistOfferEmail`.

### Inbox vs. spam

No sender can *guarantee* inbox placement — that's the receiving provider's spam filter, based on
sender reputation, authentication alignment, and content it evaluates on the fly. What this
codebase does to stay on the right side of that:

- **`EMAIL_FROM` defaults to the `SMTP_USER` address itself** (`backend/src/env.ts`) rather than
  an arbitrary display address, unless you override it. This matters more than it sounds: Gmail's
  SMTP relay expects the `From` header to match the authenticated account (or a verified "Send
  mail as" alias configured on it) — a mismatch gets rewritten or flagged, and breaks SPF/DKIM
  alignment at the receiving end, which is one of the most common spam triggers. If you set
  `EMAIL_FROM` yourself, keep it as either the same Gmail address or an alias you've verified
  in that account's Gmail settings.
- Every email is sent as **`multipart/alternative`** (both `text` and `html` bodies) — HTML-only
  mail is itself a spam-score signal, since legitimate transactional email almost always includes
  a plain-text part.
- Using `smtp.gmail.com` directly (rather than an unauthenticated/unknown relay) inherits Gmail's
  own sender reputation, which is one of the more reliable options for low-volume transactional
  mail like this without owning a domain and setting up your own SPF/DKIM/DMARC records.

For a real deployment sending any real volume, a dedicated transactional provider (Resend,
SendGrid, Postmark) with your own verified sending domain is the more robust choice — Gmail SMTP
is documented above specifically because it's the simplest thing that works for a one-day build.

## Real-time seat map (Socket.IO)

- `GET /api/shows/:showId/seats` returns the full seat map for a show (seat id, row/number,
  category, price, live status). Public — no auth required, so anyone browsing can see seat
  availability before logging in.
- The frontend joins a Socket.IO room per show (`socket.emit("join-show", showId)` on entering
  the seat map, `"leave-show"` on leaving) — this happens client-side in Phase 8, once that page
  exists.
- Every mutation that changes a seat's status broadcasts `seat_status_changed: { seatId, status }`
  to that show's room, *after* its transaction has committed (never from inside one — a rollback
  must never be followed by a broadcast of state that didn't actually happen). This covers every
  path that touches `show_seats.status`: hold, release, confirm, cancellation, the cron's hold
  sweep, a waitlist offer being created, an offer being accepted, and the cron's offer-expiry
  cascade.
- `backend/src/realtime.ts` holds a module-level Socket.IO server reference that's `null` until
  `initSocketIO()` runs (only called from `index.ts`, not from `createApp()`) — so broadcasts are
  a safe no-op during tests, which exercise the HTTP/service layer directly without a live socket
  server.

## Running tests

The integration test suite (currently: seat hold concurrency + hold lifecycle) runs against a
**separate** `ticketing_test` database, never against your seeded dev database — `vitest.setup.ts`
loads `backend/.env.test` (checked into the repo with sane local defaults — no secrets in it)
before Prisma initializes, so `npm run dev`'s data is untouched no matter how many times you run
tests. Create the test database once, matching whatever `DATABASE_URL` is set in `.env.test`:

```
cd backend
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE ticketing_test;"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ticketing_test?schema=public" npx prisma migrate deploy
npm test
```

Edit `.env.test` first if your local Postgres uses a different port/user/password.

## Roles & registration

- `POST /api/auth/register` lets the caller choose `role: "customer"` or `"organiser"`
  (defaults to `"customer"` if omitted) — the frontend's Register page has a picker for this.
  `"admin"` is **not** an accepted value here; zod rejects it outright (400), it can't be
  silently downgraded. Admin is a provisioned-only role: an existing admin creates one via
  `POST /api/admin/users` (`requireRole("admin")`).
- Google Sign-In accepts the same `role: "customer" | "organiser"` as `/api/auth/register` when
  it creates a brand-new account (see below); it only ever applies to account *creation* — if
  the Google identity links to an existing account, that account's role always wins.
- Login never assigns or changes a role; it just returns whatever role is already stored on
  the account.

## Google Sign-In setup (customers and organisers)

Admin is a provisioned-only role and always uses email+password. Customers and organisers can
additionally register or sign in with Google, picking their role the same way as on the
Register page. This requires a Google OAuth Client ID — without one, email+password still
works everywhere and `/api/auth/google` just returns a clean 400.

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a project if you don't have one already.
3. **Create Credentials → OAuth client ID**. If prompted, configure the OAuth consent screen
   first (External user type is fine for testing; add your own email as a test user).
4. Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (local dev)
   - your deployed frontend URL once it exists (e.g. `https://your-app.vercel.app`)
   - Leave **Authorized redirect URIs** empty — the frontend uses Google Identity Services'
     token (One Tap / button) flow, which doesn't redirect through the backend.
6. Copy the generated **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).
7. Paste it into **both**:
   - `backend/.env` → `GOOGLE_CLIENT_ID`
   - `frontend/.env.local` → `VITE_GOOGLE_CLIENT_ID`
8. Restart both dev servers.

How it works: the frontend renders Google's Sign-In button, which returns a signed ID token
directly to the browser (no backend involvement). The frontend POSTs that token, along with the
selected role, to `POST /api/auth/google`; the backend verifies the token's signature and
audience against `GOOGLE_CLIENT_ID` using `google-auth-library`, then finds-or-creates a user by
Google account ID with the requested `customer`/`organiser` role (linking by verified email if
an email+password account already exists — that account's existing role wins, the requested
role is ignored in that case), and issues our own JWT exactly like `/api/auth/login` does. If an
email already belongs to an `admin` account, the Google login is rejected — admin can't be
hijacked via a self-service Google signup.

## Show bookability

A show stops accepting new activity once it's `cancelled` or its start time has passed
(`services/showGuard.ts`). This is enforced in three places that must agree, or the UI would
offer actions the API rejects:

- `holdSeat` and `joinWaitlist` return `SHOW_NOT_BOOKABLE` (409) — otherwise last week's seat
  map stays fully interactive and sellable.
- `cancelBooking` refuses too. Cancelling frees seats and cascades a waitlist *offer email* to
  the next person in line; doing that for a finished show would invite someone to an event
  that's already over.
- The public catalog (`listEvents`, `getEventWithShows`) only ever returns upcoming shows, so an
  event with no upcoming shows — newly created, or entirely in the past — doesn't appear on
  browse as a dead-end link. The organiser dashboard uses separate queries and still shows
  everything they own.

The frontend mirrors the same rule (a banner plus disabled seats on a started/cancelled show,
and no Cancel button on a past booking) rather than letting every click fail with a 409.

## Organiser & admin dashboards

- **Admin** (`/admin`, `POST /api/venues`, `GET /api/venues`): creates a venue and its seat
  layout in one call — a list of `{ rowLabel, category, seatCount }` rows, expanded server-side
  into individual `seats`. `GET /api/venues` is also readable by organisers (`requireRole("organiser", "admin")`),
  since picking a venue is how they schedule a show.
- **Organiser** (`/organiser`, `POST /api/organiser/events`, `GET /api/organiser/events`,
  `GET /api/organiser/events/:eventId`, `POST /api/organiser/events/:eventId/shows`): creates
  events, then schedules shows against an existing venue with per-category pricing. Creating a
  show snapshots every one of the venue's seats into `show_seats` (all `available`) and pricing
  into `show_seat_pricing` — the same shapes the public catalog/booking code already expects, so
  a new show needs no special-casing to appear on the public events list and be bookable
  immediately. Every organiser route enforces ownership (`event.organiserId === req.user.sub`);
  the dashboard also shows tickets-sold and revenue per event/show, computed from confirmed
  bookings and `booked` `show_seats`, not stored redundantly.
