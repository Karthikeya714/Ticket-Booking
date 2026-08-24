# Ticket Booking Platform — Phase-Wise Implementation Plan

Use this alongside the main build prompt. Work through phases in order. Do not start a
phase until the previous one's "Definition of Done" is met. After each phase, report
back what was built and how it was verified before proceeding.

---

## Phase 0 — Project Scaffolding (~20 min)

**Goal:** A runnable skeleton exists for both apps, with the DB connected.

**Tasks:**
- Create monorepo structure: `/backend`, `/frontend`, root `README.md`
- Backend: Express + TypeScript project, Prisma initialized, `.env` + `.env.example`
- Frontend: Vite + React + TypeScript + Tailwind initialized
- Provision Postgres (local Docker or a free Render/Neon instance) and confirm Prisma can connect
- Set up `node-cron` dependency (used later) and `socket.io` + `socket.io-client` dependencies now

**Definition of Done:**
- `npm run dev` starts backend and returns 200 on a `/health` route
- `npm run dev` starts frontend and shows a blank page with no console errors
- `npx prisma studio` (or equivalent) connects to the DB successfully

---

## Phase 1 — Data Model & Migrations (~30 min)

**Goal:** The full schema exists in Postgres via Prisma, plus a seed script with realistic test data.

**Tasks:**
- Implement all models: `users`, `venues`, `seats`, `events`, `shows`, `show_seat_pricing`,
  `show_seats`, `holds`, `bookings`, `booking_seats`, `waitlist_entries`, `waitlist_offers`
- Add appropriate unique constraints (e.g. one `show_seats` row per `show_id`+`seat_id`) and
  foreign keys
- Write a seed script producing: 1 admin, 1 organiser, 2 customers, 1 venue with ~30 seats
  across 2 categories (Premium/Standard), 1 event, 1 show, pricing per category, and all
  `show_seats` initialized to `available`

**Definition of Done:**
- `npx prisma migrate dev` runs clean
- Seed script populates the DB and it's inspectable in Prisma Studio
- Schema matches what's documented in the README's DB section (write that section now, not later)

---

## Phase 2 — Auth & Role Middleware (~30 min)

**Goal:** All three roles can register/login and get a JWT; protected routes enforce role.

**Tasks:**
- `POST /auth/register`, `POST /auth/login` (bcrypt password hashing, JWT issuance)
- Middleware: `requireAuth`, `requireRole(role)`
- A protected test route per role to confirm middleware works

**Definition of Done:**
- Can register+login as each role via curl/Postman and get a valid JWT
- A customer token hitting an organiser-only route returns 403
- An expired/invalid token returns 401

---

## Phase 3 — Seat Hold + Concurrency-Safe Booking (CORE — ~90 min)

**Goal:** The single most important mechanic in the whole system. Backend-only, no
frontend needed yet. This must be provably race-safe before anything else is built on
top of it.

**Tasks:**
- `POST /shows/:id/seats/:seatId/hold` — inside a DB transaction: `SELECT ... FOR UPDATE`
  the `show_seats` row, verify status is `available`, create a `holds` row with
  `expires_at = now() + HOLD_TTL_MINUTES` (env-configurable), set seat status to `held`,
  commit
- `POST /holds/:id/confirm` — inside a transaction: verify the hold belongs to the
  requesting customer and hasn't expired, create `bookings` + `booking_seats`, set seat
  status to `booked`, mark hold `converted`, generate `booking_reference`
- `POST /holds/:id/release` (explicit cancel-before-checkout) — free the seat, mark hold
  `expired`
- Return a clean, specific error (e.g. `409 SEAT_UNAVAILABLE`) if a hold/booking attempt
  loses the race — never a generic 500

**Definition of Done:**
- Write an integration test that fires N concurrent hold requests at the *same seat* and
  asserts exactly 1 succeeds and the rest get `409`
- Manually verify: holding an already-held seat fails; confirming an expired hold fails;
  confirming someone else's hold fails
- This test must be shown passing before Phase 4 starts

---

## Phase 4 — Hold Expiry (Cron + Lazy Checks) (~30 min)

**Goal:** Abandoned holds actually free up seats, both proactively and on-demand.

**Tasks:**
- `node-cron` job every 15s: find `holds` where `status = 'active'` and `expires_at < now()`,
  free the seat (`available`), mark hold `expired`
- Lazy-expiry guard: any endpoint that reads/acts on a hold first checks
  `expires_at < now()` and treats it as expired immediately, regardless of cron timing
- Expose remaining TTL on the hold (for the frontend countdown later)

**Definition of Done:**
- Create a hold with a short TTL (e.g. 10s, via env override in test), wait past it, confirm
  the seat auto-flips to `available` in the DB without any other action
- Confirm that trying to `confirm` an expired hold fails immediately, even before the cron
  has run

---

## Phase 5 — Waitlist & Time-Limited Offers (~60 min)

**Goal:** Sold-out categories can queue customers, and cancellations auto-cascade offers
down the queue correctly.

**Tasks:**
- `POST /shows/:id/waitlist` (category) — reject if seats are actually available in that
  category; otherwise create a FIFO `waitlist_entries` row
- On booking cancellation (`POST /bookings/:id/cancel`): free the seat(s), then for each
  freed category check the oldest `waiting` entry; if found, create a `waitlist_offers`
  row with its own TTL, set seat to `held` (reserved), mark entry `offered`, and (for now)
  log/queue the email
- `POST /waitlist-offers/:id/accept` — same transactional pattern as Phase 3's confirm:
  verify not expired, convert to booking
- Extend the cron job (or add a second one) to expire unclaimed offers and automatically
  cascade to the next waiting entry — this must loop until either someone accepts or the
  queue is empty

**Definition of Done:**
- Simulate: fill a category, join 3 customers on the waitlist, cancel a booking, confirm
  the oldest waitlisted customer gets an offer
- Let that offer expire (short TTL in test) and confirm the seat cascades to the 2nd
  customer automatically, without manual intervention
- Confirm accepting an offer converts it to a real booking correctly

---

## Phase 6 — QR Code + Email Delivery (~30 min)

**Goal:** Confirmed bookings and waitlist offers actually reach the customer's inbox.

**Tasks:**
- On booking confirmation: generate a QR (via `qrcode`) encoding only the
  `booking_reference`, embed as inline image in a Nodemailer email with booking details
- On waitlist offer creation: send a separate email with the time-limited accept link/token
- Wrap email sending so a failure doesn't roll back the booking transaction (log and
  retry/report separately — booking success shouldn't depend on SMTP being up)

**Definition of Done:**
- A real test booking produces a real email in an inbox with a scannable QR code
- A real waitlist offer produces a real email with a working accept link

---

## Phase 7 — Real-Time Seat Map (Socket.IO) (~30 min)

**Goal:** Seat status changes are pushed live to everyone viewing that show.

**Tasks:**
- Client joins a room per `show_id` on entering the seat map page
- Server emits `seat_status_changed` (seatId, newStatus) on every hold/release/book/cancel
  mutation from Phases 3–5
- Frontend seat map subscribes and updates the grid without a page refresh

**Definition of Done:**
- Two browser sessions on the same show: holding a seat in one instantly greys it out in
  the other

---

## Phase 8 — Frontend: Customer Flow (~90 min)

**Goal:** A customer can go end-to-end through the UI: browse → seat map → hold → checkout
→ confirmation → history → cancel → waitlist.

**Tasks:**
- Login/register pages
- Event list with filters (type, date)
- Seat map grid (color-coded: available/held/booked), seat selection, visible hold
  countdown timer
- Checkout screen, confirmation screen showing booking reference
- Booking history page with cancel action
- Waitlist join UI when a category is sold out; offer-acceptance page from the emailed link

**Definition of Done:**
- Full customer journey completed manually in the browser without touching the API directly

---

## Phase 9 — Frontend: Organiser & Admin Dashboards (~45 min)

**Goal:** Organisers and admins can manage their side without touching the DB directly.

**Tasks:**
- Admin: create venue, build seat layout (simple grid-entry form is fine — no drag/drop needed)
- Organiser: create event, create show (venue/date/time + per-category pricing), view
  booking summary + revenue per event

**Definition of Done:**
- A full new venue → event → show can be created through the UI and immediately appears
  bookable to customers

---

## Phase 10 — Deployment (~45–60 min, protect this time, don't skip it)

**Goal:** A live URL exists and works end-to-end for a stranger.

**Tasks:**
- Backend + Postgres → Render (or Railway)
- Frontend → Vercel, pointed at the deployed backend URL
- All env vars set on the hosts (DB url, JWT secret, SMTP creds, hold/offer TTL values)
- CORS configured for the deployed frontend origin
- Re-run the seed script against the production DB

**Definition of Done:**
- Visiting the live URL cold, a new customer can register, book a seat, and receive a
  real email with a QR code

---

## Phase 11 — Documentation (~30 min)

**Goal:** README and system design write-up are complete and accurate to what was built.

**Tasks:**
- `README.md`: setup guide, `.env.example` for both apps, API endpoint docs, DB schema,
  explanation of hold/TTL and waitlist logic, any assumptions made along the way
- `SYSTEM_DESIGN.md` (max 800 words): seat hold/TTL mechanism, concurrency prevention,
  waitlist auto-assignment flow, time-limited offer handling

**Definition of Done:**
- A new developer could clone the repo, follow the README, and get it running locally
  with zero prior context

---

## Reporting protocol

After each phase, state: what was implemented, what was tested and how, and any
assumption made in place of asking a clarifying question. If a phase's Definition of
Done can't be met, stop and flag it rather than moving on with a broken foundation —
Phase 3 in particular should not be papered over.