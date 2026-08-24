# 🎟️ Ticket Booking Platform

A full-stack ticket booking platform for movies and concerts — visual seat maps that update in
real time, TTL-based seat holds with race-safe locking, automatic waitlist offers when a seat
frees up, and QR-code tickets delivered by email.

**[Live demo →](https://ticket-booking-gamma-gold.vercel.app)** &nbsp;·&nbsp;
**[Backend health check →](https://ticketing-backend-8to9.onrender.com/health)**

> The backend runs on Render's free tier, which sleeps after ~15 minutes idle — the first
> request after that can take up to a minute to wake it back up. The app shows a loading screen
> during that wait so it doesn't look broken.

---

## Screenshots

| | |
|---|---|
| ![Landing page](docs/screenshots/landing.png) | ![Browse events](docs/screenshots/browse-events.png) |
| **Landing page** | **Browse events** |
| ![Seat map](docs/screenshots/seat-map.png) | ![Booking confirmation](docs/screenshots/booking-confirmation.png) |
| **Live seat map** | **Booking confirmation** |
| ![Organiser dashboard](docs/screenshots/organiser-dashboard.png) | |
| **Organiser dashboard** | |

<sub>See [docs/screenshots/README.md](docs/screenshots/README.md) for exactly which pages these are.</sub>

---

## Features

- 🔍 **Browse & filter** movies and concerts by type, title, and date
- 💺 **Interactive seat maps**, colour-coded by category and live status, updated in real time
  for every viewer via Socket.IO
- ⏱️ **Time-limited seat holds** — a seat is locked to one customer for a few minutes while they
  check out, then automatically released if they don't confirm
- 🎫 **Multi-seat booking** in a single, all-or-nothing transaction
- 📬 **Waitlist with automatic offers** — join a sold-out category, get first dibs by email the
  moment a seat is cancelled, on a first-come-first-served timer
- 📩 **QR-code tickets by email**, sent the moment a booking is confirmed
- 🔐 **Email/password + Google Sign-In**, with separate customer / organiser / admin roles
- 📊 **Organiser dashboard** — create events, schedule shows with per-category pricing, see
  tickets sold and revenue
- 🛠️ **Admin dashboard** — create venues and seat layouts

## Tech stack

| | |
|---|---|
| **Frontend** | React · TypeScript · Vite · Tailwind CSS · React Router |
| **Backend** | Node.js · Express · TypeScript · Prisma · PostgreSQL · Socket.IO |
| **Auth** | JWT (email/password) + Google Identity Services |
| **Email** | [Brevo](https://www.brevo.com) transactional API |
| **Hosting** | Vercel (frontend) · Render (backend + Postgres) |
| **Testing** | Vitest |

---

## Getting started (local dev)

**Backend**

```bash
cd backend
cp .env.example .env   # then edit DATABASE_URL etc.
npm install
npx prisma migrate dev
npm run seed
npm run dev             # http://localhost:4000
```

**Frontend**

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:5173
```

Seeded accounts (after `npm run seed`): 1 admin, 1 organiser, 2 customers, 3 events (2 movies, 1
concert) with 6 upcoming shows across 2 venues. See `backend/prisma/seed.ts` for exact
credentials.

## Running tests

```bash
cd backend
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE ticketing_test;"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ticketing_test?schema=public" npx prisma migrate deploy
npm test
```

Tests run against a separate `ticketing_test` database (`backend/.env.test`, no secrets, checked
into the repo) so `npm run dev`'s seeded data is never touched.

## Deployment (Render + Vercel)

`render.yaml` (repo root) and `frontend/vercel.json` are already set up — Render auto-detects the
blueprint, and the Vercel rewrite makes client-side routes work on a hard refresh.

<details>
<summary><strong>Full deployment walkthrough</strong></summary>

**1. Backend + Postgres on Render**
1. [Render dashboard](https://dashboard.render.com) → **New → Blueprint** → connect this repo.
   Render reads `render.yaml` and proposes a Postgres database (`ticketing-db`) plus a web
   service (`ticketing-backend`) — accept it.
2. Before the first deploy succeeds, fill in the env vars marked `sync: false` under the
   `ticketing-backend` service's **Environment** tab:
   - `JWT_SECRET` — generate a fresh one for production:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `GOOGLE_CLIENT_ID`, `BREVO_API_KEY`, `EMAIL_FROM` — same values as local `backend/.env`
     (see "QR codes & email delivery" below for how to get a Brevo key).
   - `CORS_ORIGIN` and `FRONTEND_URL` — leave blank for now, set in step 3 once the Vercel URL
     exists.
3. `DATABASE_URL` is wired automatically from the `ticketing-db` database. The build command
   runs `prisma migrate deploy`, applying the committed migrations to that fresh database.
4. Deploy. Note the resulting URL (e.g. `https://ticketing-backend.onrender.com`).

**2. Frontend on Vercel**
1. [Vercel dashboard](https://vercel.com/new) → import the same repo.
2. Set **Root Directory** to `frontend`.
3. Add env vars: `VITE_API_URL` = the Render backend URL from step 1.4; `VITE_GOOGLE_CLIENT_ID`
   = same value as `frontend/.env.local`.
4. Deploy. Note the resulting URL (e.g. `https://ticket-booking.vercel.app`).

**3. Wire the two together**
1. Back on Render, set `CORS_ORIGIN` and `FRONTEND_URL` (both) to the Vercel URL from step 2.4,
   then trigger a redeploy (Render doesn't restart automatically for an env var change made after
   the first deploy).
2. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) →
   your OAuth client → add the Vercel URL to **Authorized JavaScript origins** (alongside
   `http://localhost:5173`).

**4. Seed the production database**
Render's free plan doesn't reliably offer a shell, so run the seed script locally against the
production database — copy the **External Database URL** from the `ticketing-db` page:

```bash
cd backend
DATABASE_URL="<external connection string from Render>" npx tsx prisma/seed.ts
```

**Known free-tier limitation**: Render's free web services spin down after ~15 minutes idle and
cold-start on the next request. The in-process cron sweep (`cron/expireHolds.ts`) only runs while
the service is awake, so an abandoned hold on a sleeping instance won't expire exactly on
schedule — but the lazy-expiry check (`expireIfNeeded` in `services/seatLock.ts`) still catches
it correctly the moment anyone next touches that seat, so this never causes a stuck or
double-bookable seat, just delayed cleanup. Fine for a demo; a paid always-on plan removes this
entirely.

</details>

---

## Architecture notes

<details>
<summary><strong>Database schema</strong></summary>

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
- `show_seats` is deliberately the row that gets locked for concurrency control — it's per-show,
  so the same physical `seat` can be `available` on one show and `booked` on another.
- `holds.show_seat_id` records every hold ever created for a seat (audit trail);
  `show_seats.current_hold_id` is a single nullable pointer to whichever hold is *currently*
  active for that seat, so a lookup doesn't need to scan history.
- Seed data (`backend/prisma/seed.ts`, re-runnable): 1 admin, 1 organiser, 2 customers; 2 venues
  (Grand Cinema Hall — 120 seats, STANDARD rows A–C / PREMIUM rows D–I; Riverside Arena — 110
  seats, VIP rows A–B / GENERAL rows C–G); 3 events (2 movies, 1 concert); 6 upcoming shows with
  per-category pricing, all `show_seats` initialized to `available`.
- Rows render nearest-screen-first. The cinema's pricing follows real-world convention: STANDARD
  (cheaper) up front in rows A–C, PREMIUM (pricier) further back in rows D–I. The concert venue is
  the opposite: VIP (pricier) is nearest the stage in rows A–B, matching how concert tickets are
  actually priced. Pricing is per-category, set at show-creation time — an organiser can assign
  any category to any row when a venue is created; this seed data is just one convention, not an
  enforced rule.

### Multi-seat booking

`booking_seats` is a proper junction table from the start specifically so one booking can cover
several seats. The customer flow: hold each seat individually
(`POST /api/shows/:showId/seats/:seatId/hold`, one call per seat — the same concurrency-safe
per-seat locking as a single-seat hold), then confirm them all at once via
`POST /api/holds/confirm` with `{ holdIds: string[] }`. That endpoint locks every underlying
`show_seats` row in a **fixed order (sorted by id, not hold order)** so two concurrent multi-seat
confirms can never deadlock waiting on each other, and is all-or-nothing — if even one hold in the
batch has expired, none of the seats convert to `booked`. The original single-hold
`POST /api/holds/:holdId/confirm` endpoint is unchanged and still works for a single seat.

</details>

<details>
<summary><strong>Waitlist & time-limited offers</strong></summary>

When a seat category is sold out, customers queue up; when a booking is cancelled, the freed seat
is handed down that queue automatically.

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

</details>

<details>
<summary><strong>QR codes & email delivery</strong></summary>

- On booking confirmation — via direct checkout (`POST /api/holds/:holdId/confirm`) or waitlist
  offer acceptance (`POST /api/waitlist-offers/:offerId/accept`) — a QR PNG is generated
  server-side (`qrcode`) encoding **only** the `booking_reference`, never seat/customer/price
  details. It's served from a dedicated public endpoint
  (`GET /api/tickets/:bookingReference/qr.png`) that the email's `<img>` tag points at, and also
  attached to the email as a real file.
  - Why not embed it directly? Two dead ends first: a `cid:`-referenced inline attachment doesn't
    work because Brevo's transactional API doesn't support inline `cid:` images at all (confirmed
    via their community forum); a base64 `data:` URI doesn't work either because Gmail strips
    `data:` URIs out of HTML email entirely. A real hosted image URL is the only approach that
    actually renders. The endpoint is intentionally unauthenticated — email clients' image
    proxies never send an Authorization header — which is safe since the QR only ever encodes the
    booking reference, already shown in plain text right next to it.
- Waitlist offer emails carry a distinct time-limited link (`{FRONTEND_URL}/waitlist-offer/:token`)
  instead of a QR — there's nothing to scan yet, since accepting the offer is what creates the
  booking (and therefore the QR) in the first place.
- Email sending is fire-and-forget from the caller's perspective and **never throws** — a booking
  or offer that already committed can't be undone by a mail-provider failure. Without
  `BREVO_API_KEY` set, sends fall back to a console log (`[email:stub] ...`) instead of erroring,
  so the whole booking/waitlist flow stays testable without a real API key.
- **Sends go through [Brevo](https://www.brevo.com)'s transactional email API, not raw SMTP**
  (`backend/src/services/mailer.ts`) — a single `fetch()` call, no library needed. This was
  deliberate: most free-tier PaaS hosts (Render included, as of September 2025) block all
  outbound traffic on SMTP ports 25/465/587, so Nodemailer-over-Gmail can never work there
  regardless of how correct the credentials are. An HTTP-based provider sends over port 443
  instead, which isn't affected, and behaves identically in local dev and production.
  - Setup: sign up free at brevo.com, verify your sending address under **Senders** (a
    confirmation-email click, not full domain/DNS setup), then generate a key under
    **Settings → SMTP & API → API Keys**.
  - To swap providers again (Resend, SendGrid, Postmark, ...): only `sendEmail()` in `mailer.ts`
    needs to change — nothing else in the codebase talks to the mail provider directly, callers
    only see `sendBookingConfirmationEmail` / `sendWaitlistOfferEmail`.

**Inbox vs. spam** — no sender can guarantee inbox placement, but this codebase: requires
`EMAIL_FROM` to be a Brevo-verified sender (Brevo rejects unverified senders outright), sends
every email as both a `text` and `html` body (HTML-only mail is itself a spam signal), and relies
on Brevo's own established sending reputation rather than a self-managed domain.

</details>

<details>
<summary><strong>Real-time seat map (Socket.IO)</strong></summary>

- `GET /api/shows/:showId/seats` returns the full seat map for a show (seat id, row/number,
  category, price, live status). Public — no auth required, so anyone browsing can see seat
  availability before logging in.
- The frontend joins a Socket.IO room per show (`socket.emit("join-show", showId)` on entering the
  seat map, `"leave-show"` on leaving).
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

</details>

<details>
<summary><strong>Roles, registration & Google Sign-In</strong></summary>

- `POST /api/auth/register` lets the caller choose `role: "customer"` or `"organiser"` (defaults
  to `"customer"` if omitted). `"admin"` is **not** an accepted value here — zod rejects it
  outright (400). Admin is a provisioned-only role: an existing admin creates one via
  `POST /api/admin/users` (`requireRole("admin")`).
- Google Sign-In accepts the same `role: "customer" | "organiser"` when it creates a brand-new
  account; it only applies to account *creation* — if the Google identity links to an existing
  account, that account's role always wins. If an email already belongs to an `admin` account, the
  Google login is rejected outright.
- Login never assigns or changes a role; it just returns whatever role is already stored on the
  account.

Google OAuth setup: create a **Web application** OAuth client in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials), add
`http://localhost:5173` and your deployed frontend URL under **Authorized JavaScript origins**
(no redirect URIs needed — this uses Google Identity Services' token flow, not a redirect), then
paste the Client ID into `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env.local`
(`VITE_GOOGLE_CLIENT_ID`). Without a client ID configured, email+password still works everywhere
and `/api/auth/google` just returns a clean 400.

</details>

<details>
<summary><strong>Show bookability & dashboards</strong></summary>

A show stops accepting new activity once it's `cancelled` or its start time has passed
(`services/showGuard.ts`), enforced in three places that must agree:

- `holdSeat` and `joinWaitlist` return `SHOW_NOT_BOOKABLE` (409).
- `cancelBooking` refuses too — cancelling frees seats and cascades a waitlist offer email to the
  next person in line, which shouldn't happen for a show that's already over.
- The public catalog only ever returns upcoming shows. The organiser dashboard uses separate
  queries and still shows everything they own.

The frontend mirrors the same rule (a banner plus disabled seats on a started/cancelled show, no
Cancel button on a past booking) rather than letting every click fail with a 409.

**Admin** (`/admin`): creates a venue and its seat layout in one call — a list of
`{ rowLabel, category, seatCount }` rows, expanded server-side into individual `seats`.

**Organiser** (`/organiser`): creates events, then schedules shows against an existing venue with
per-category pricing. Creating a show snapshots every one of the venue's seats into `show_seats`
(all `available`) and pricing into `show_seat_pricing`, so a new show needs no special-casing to
appear on the public events list and be bookable immediately. Every organiser route enforces
ownership (`event.organiserId === req.user.sub`); the dashboard shows tickets-sold and revenue per
event/show, computed from confirmed bookings, not stored redundantly.

</details>

---

- `/backend` — Node.js + Express + TypeScript + Prisma (Postgres)
- `/frontend` — React + Vite + TypeScript + Tailwind CSS
