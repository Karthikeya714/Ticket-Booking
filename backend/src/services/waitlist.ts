import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { env } from "../env";
import { type Outcome, raise } from "./outcome";
import { withRetryOnce } from "./tx";
import { lockShowSeatById } from "./seatLock";
import { generateBookingReference } from "./reference";
import { sendBookingConfirmationEmail, sendWaitlistOfferEmail } from "./notifications";
import { broadcastSeatStatusChanged } from "../realtime";

// Counts seats a customer could actually book right now. A seat sitting in `held` whose hold
// has already lapsed counts as available even if the cron sweep hasn't reclaimed it yet —
// otherwise a customer could be pushed onto a waitlist for a category that isn't really full.
async function countBookableSeats(tx: Prisma.TransactionClient, showId: string, category: string): Promise<number> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM show_seats ss
    JOIN seats s ON s.id = ss.seat_id
    LEFT JOIN holds h ON h.id = ss.current_hold_id
    WHERE ss.show_id = ${showId}
      AND s.category = ${category}
      AND (
        ss.status = 'available'
        OR (ss.status = 'held' AND h.status = 'active' AND h.expires_at < now())
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function joinWaitlist(showId: string, category: string, customerId: string) {
  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<{ waitlistEntryId: string; position: number }>> => {
      const show = await tx.show.findUnique({ where: { id: showId } });
      if (!show) return { ok: false, code: "NOT_FOUND", message: "Show not found" };

      const pricing = await tx.showSeatPricing.findUnique({
        where: { showId_category: { showId, category } },
      });
      if (!pricing) return { ok: false, code: "NOT_FOUND", message: "Unknown seat category for this show" };

      const bookable = await countBookableSeats(tx, showId, category);
      if (bookable > 0) return { ok: false, code: "SEATS_AVAILABLE" };

      const existing = await tx.waitlistEntry.findFirst({
        where: { showId, category, customerId, status: { in: ["waiting", "offered"] } },
      });
      if (existing) return { ok: false, code: "ALREADY_WAITING" };

      const entry = await tx.waitlistEntry.create({
        data: { showId, category, customerId, status: "waiting" },
      });

      const position = await tx.waitlistEntry.count({
        where: { showId, category, status: "waiting", joinedAt: { lte: entry.joinedAt } },
      });

      return { ok: true, value: { waitlistEntryId: entry.id, position } };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);
  return outcome.value;
}

interface PendingEmail {
  to: string;
  customerName: string;
  eventTitle: string;
  seatLabel: string;
  offerExpiresAt: Date;
  token: string;
}

// Matches one free seat in a category with the longest-waiting customer, and reserves it for
// them. Both the seat row and the waitlist entry are locked with SKIP LOCKED so parallel callers
// (a cancellation and the offer-expiry cron, say) grab different seats and different entries
// instead of blocking each other or double-assigning one seat.
async function offerNextSeatInCategory(showId: string, category: string): Promise<PendingEmail | null> {
  let broadcast: { seatId: string } | undefined;

  const result = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<PendingEmail | null> => {
      const entries = await tx.$queryRaw<{ id: string; customer_id: string }[]>`
        SELECT id, customer_id
        FROM waitlist_entries
        WHERE show_id = ${showId} AND category = ${category} AND status = 'waiting'
        ORDER BY joined_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const entry = entries[0];
      if (!entry) return null;

      const seats = await tx.$queryRaw<{ id: string; seat_id: string }[]>`
        SELECT ss.id, ss.seat_id
        FROM show_seats ss
        JOIN seats s ON s.id = ss.seat_id
        WHERE ss.show_id = ${showId} AND s.category = ${category} AND ss.status = 'available'
        ORDER BY s.row_label ASC, s.seat_number ASC
        LIMIT 1
        FOR UPDATE OF ss SKIP LOCKED
      `;
      const showSeat = seats[0];
      if (!showSeat) return null;

      const token = crypto.randomBytes(32).toString("hex");
      const offerExpiresAt = new Date(Date.now() + env.waitlistOfferTtlMinutes * 60_000);

      await tx.waitlistOffer.create({
        data: { waitlistEntryId: entry.id, showSeatId: showSeat.id, offerExpiresAt, status: "pending", token },
      });
      // status='held' with current_hold_id=NULL marks a seat reserved for a waitlist offer
      // rather than for a normal checkout hold. See the note in seatLock.ts.
      await tx.showSeat.update({
        where: { id: showSeat.id },
        data: { status: "held", currentHoldId: null },
      });
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "offered" } });

      const customer = await tx.user.findUniqueOrThrow({ where: { id: entry.customer_id } });
      const seat = await tx.seat.findUniqueOrThrow({ where: { id: showSeat.seat_id } });
      const show = await tx.show.findUniqueOrThrow({ where: { id: showId }, include: { event: true } });

      broadcast = { seatId: showSeat.seat_id };

      return {
        to: customer.email,
        customerName: customer.name,
        eventTitle: show.event.title,
        seatLabel: `${seat.rowLabel}${seat.seatNumber}`,
        offerExpiresAt,
        token,
      };
    })
  );

  if (broadcast) broadcastSeatStatusChanged(showId, broadcast.seatId, "held");
  return result;
}

// Keeps handing out seats in this category until either the queue empties or the free seats run
// out. Emails are sent after each transaction commits so a slow/failing mail step can never roll
// back an offer that's already reserved a seat.
export async function fillWaitlistForCategory(showId: string, category: string): Promise<number> {
  let offersMade = 0;

  // Bounded by the number of seats in the category, so a bug in the loop can't spin forever.
  const seatCount = await prisma.showSeat.count({
    where: { showId, seat: { category } },
  });

  for (let i = 0; i < seatCount; i++) {
    const pending = await offerNextSeatInCategory(showId, category);
    if (!pending) break;
    offersMade++;
    await sendWaitlistOfferEmail(pending);
  }

  return offersMade;
}

export async function getOfferByToken(customerId: string, token: string) {
  const offer = await prisma.waitlistOffer.findUnique({
    where: { token },
    include: {
      waitlistEntry: true,
      showSeat: { include: { seat: true, show: { include: { event: true, venue: true } } } },
    },
  });
  if (!offer) raise("NOT_FOUND", "Offer not found");
  if (offer.waitlistEntry.customerId !== customerId) raise("FORBIDDEN", "This offer does not belong to you");

  const expired = offer.status === "expired" || (offer.status === "pending" && offer.offerExpiresAt.getTime() < Date.now());

  return {
    id: offer.id,
    status: expired && offer.status === "pending" ? ("expired" as const) : offer.status,
    offerExpiresAt: offer.offerExpiresAt,
    remainingSeconds: expired ? 0 : Math.max(0, Math.ceil((offer.offerExpiresAt.getTime() - Date.now()) / 1000)),
    seatLabel: `${offer.showSeat.seat.rowLabel}${offer.showSeat.seat.seatNumber}`,
    category: offer.showSeat.seat.category,
    eventTitle: offer.showSeat.show.event.title,
    venueName: offer.showSeat.show.venue.name,
    dateTime: offer.showSeat.show.dateTime,
  };
}

// Expires one offer and releases its seat. Shared by the accept path's lazy check and the cron
// sweep so both leave identical state behind. Returns the freed seat's (showId, seatId) so the
// caller can broadcast after its transaction commits — or null if the seat wasn't actually
// reserved-for-offer (e.g. already reassigned by a concurrent transaction), in which case there's
// nothing to broadcast.
async function expireOfferInTx(
  tx: Prisma.TransactionClient,
  offerId: string,
  waitlistEntryId: string,
  showSeatId: string
): Promise<{ showId: string; seatId: string } | null> {
  await tx.waitlistOffer.update({ where: { id: offerId }, data: { status: "expired" } });
  await tx.waitlistEntry.update({ where: { id: waitlistEntryId }, data: { status: "expired" } });

  const showSeat = await lockShowSeatById(tx, showSeatId);
  if (showSeat && showSeat.status === "held" && showSeat.current_hold_id === null) {
    await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "available", currentHoldId: null } });
    return { showId: showSeat.show_id, seatId: showSeat.seat_id };
  }
  return null;
}

export async function acceptOffer(customerId: string, offerId: string) {
  let bookedSeat: { showId: string; seatId: string } | undefined;
  let expiredSeat: { showId: string; seatId: string } | undefined;

  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<{ booking: { id: string; bookingReference: string; totalPrice: unknown } }>> => {
      const offer = await tx.waitlistOffer.findUnique({
        where: { id: offerId },
        include: { waitlistEntry: true },
      });
      if (!offer) return { ok: false, code: "NOT_FOUND", message: "Offer not found" };
      if (offer.waitlistEntry.customerId !== customerId) {
        return { ok: false, code: "FORBIDDEN", message: "This offer does not belong to you" };
      }
      if (offer.status !== "pending") return { ok: false, code: "OFFER_EXPIRED" };

      // Lazy expiry: don't wait for the cron to notice this offer has lapsed.
      if (offer.offerExpiresAt.getTime() < Date.now()) {
        expiredSeat = (await expireOfferInTx(tx, offer.id, offer.waitlistEntryId, offer.showSeatId)) ?? undefined;
        return { ok: false, code: "OFFER_EXPIRED" };
      }

      const locked = await lockShowSeatById(tx, offer.showSeatId);
      if (!locked || locked.status !== "held" || locked.current_hold_id !== null) {
        return { ok: false, code: "SEAT_UNAVAILABLE" };
      }

      const seat = await tx.seat.findUniqueOrThrow({ where: { id: locked.seat_id } });
      const pricing = await tx.showSeatPricing.findUnique({
        where: { showId_category: { showId: locked.show_id, category: seat.category } },
      });
      if (!pricing) return { ok: false, code: "NOT_FOUND", message: "No pricing configured for this category" };

      const booking = await tx.booking.create({
        data: {
          customerId,
          showId: locked.show_id,
          bookingReference: generateBookingReference(),
          status: "confirmed",
          totalPrice: pricing.price,
        },
      });
      await tx.bookingSeat.create({ data: { bookingId: booking.id, showSeatId: locked.id } });
      await tx.showSeat.update({ where: { id: locked.id }, data: { status: "booked", currentHoldId: null } });
      await tx.waitlistOffer.update({ where: { id: offer.id }, data: { status: "accepted" } });
      await tx.waitlistEntry.update({ where: { id: offer.waitlistEntryId }, data: { status: "fulfilled" } });

      bookedSeat = { showId: locked.show_id, seatId: locked.seat_id };
      return { ok: true, value: { booking } };
    })
  );

  if (!outcome.ok) {
    if (outcome.code === "OFFER_EXPIRED") {
      if (expiredSeat) broadcastSeatStatusChanged(expiredSeat.showId, expiredSeat.seatId, "available");
      // The lazy expiry above freed a seat, so pass it down the queue before reporting failure —
      // otherwise it would sit idle until someone else happened to trigger a sweep.
      await cascadeAfterExpiredOffer(offerId);
    }
    raise(outcome.code, outcome.message);
  }

  if (bookedSeat) broadcastSeatStatusChanged(bookedSeat.showId, bookedSeat.seatId, "booked");
  void sendBookingConfirmationEmail(outcome.value.booking.id);

  return outcome.value;
}

async function cascadeAfterExpiredOffer(offerId: string) {
  const offer = await prisma.waitlistOffer.findUnique({
    where: { id: offerId },
    include: { waitlistEntry: true },
  });
  if (!offer) return;
  await fillWaitlistForCategory(offer.waitlistEntry.showId, offer.waitlistEntry.category);
}

// Cron entry point: expires unclaimed offers, then cascades each affected queue to the next
// waiting customer. Called every EXPIRY_SWEEP_INTERVAL_SECONDS alongside the hold sweep.
export async function sweepExpiredOffers(): Promise<number> {
  const candidates = await prisma.waitlistOffer.findMany({
    where: { status: "pending", offerExpiresAt: { lt: new Date() } },
    select: { id: true, waitlistEntryId: true, showSeatId: true },
  });

  const affected = new Map<string, { showId: string; category: string }>();

  for (const candidate of candidates) {
    const expiredEntry = await withRetryOnce(() =>
      prisma.$transaction(async (tx) => {
        const offer = await tx.waitlistOffer.findUnique({
          where: { id: candidate.id },
          include: { waitlistEntry: true },
        });
        if (!offer || offer.status !== "pending" || offer.offerExpiresAt.getTime() >= Date.now()) return null;

        const freedSeat = await expireOfferInTx(tx, offer.id, offer.waitlistEntryId, offer.showSeatId);
        return { showId: offer.waitlistEntry.showId, category: offer.waitlistEntry.category, freedSeat };
      })
    );

    if (expiredEntry) {
      affected.set(`${expiredEntry.showId}:${expiredEntry.category}`, expiredEntry);
      if (expiredEntry.freedSeat) {
        broadcastSeatStatusChanged(expiredEntry.freedSeat.showId, expiredEntry.freedSeat.seatId, "available");
      }
    }
  }

  for (const { showId, category } of affected.values()) {
    await fillWaitlistForCategory(showId, category);
  }

  return candidates.length === 0 ? 0 : affected.size;
}
