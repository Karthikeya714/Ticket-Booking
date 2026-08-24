import { type Booking } from "@prisma/client";
import { prisma } from "../prisma";
import { env } from "../env";
import { forbidden, notFound } from "../errors";
import { type Outcome, raise } from "./outcome";
import { withRetryOnce } from "./tx";
import { expireIfNeeded, lockShowSeatById, lockShowSeatByShowAndSeat } from "./seatLock";
import { generateBookingReference } from "./reference";
import { fillWaitlistForCategory } from "./waitlist";
import { sendBookingConfirmationEmail } from "./notifications";
import { broadcastSeatStatusChanged } from "../realtime";

export interface HoldResult {
  holdId: string;
  showSeatId: string;
  expiresAt: Date;
}

export async function holdSeat(showId: string, seatId: string, customerId: string): Promise<HoldResult> {
  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<HoldResult>> => {
      const locked = await lockShowSeatByShowAndSeat(tx, showId, seatId);
      if (!locked) return { ok: false, code: "NOT_FOUND" };

      const showSeat = await expireIfNeeded(tx, locked);
      if (showSeat.status !== "available") return { ok: false, code: "SEAT_UNAVAILABLE" };

      const expiresAt = new Date(Date.now() + env.holdTtlMinutes * 60_000);
      const hold = await tx.hold.create({
        data: { showSeatId: showSeat.id, customerId, expiresAt, status: "active" },
      });
      await tx.showSeat.update({
        where: { id: showSeat.id },
        data: { status: "held", currentHoldId: hold.id },
      });

      return { ok: true, value: { holdId: hold.id, showSeatId: showSeat.id, expiresAt } };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);
  broadcastSeatStatusChanged(showId, seatId, "held");
  return outcome.value;
}

export async function releaseHold(customerId: string, holdId: string): Promise<{ released: boolean }> {
  let broadcast: { showId: string; seatId: string } | undefined;

  const result = await withRetryOnce(() =>
    prisma.$transaction(async (tx) => {
      const hold = await tx.hold.findUnique({ where: { id: holdId } });
      if (!hold) throw notFound("Hold not found");
      if (hold.customerId !== customerId) throw forbidden("This hold does not belong to you");

      if (hold.status === "active") {
        const showSeat = await lockShowSeatById(tx, hold.showSeatId);
        await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
        if (showSeat && showSeat.current_hold_id === hold.id) {
          await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "available", currentHoldId: null } });
          broadcast = { showId: showSeat.show_id, seatId: showSeat.seat_id };
        }
      }

      return { released: true };
    })
  );

  if (broadcast) broadcastSeatStatusChanged(broadcast.showId, broadcast.seatId, "available");
  return result;
}

export interface HoldStatusResult {
  holdId: string;
  showSeatId: string;
  status: "active" | "expired" | "converted";
  expiresAt: Date;
  remainingSeconds: number;
}

// Lets the frontend poll/reconcile a countdown timer against the server's clock (avoiding
// client/server clock skew) rather than trusting a client-side timer alone. Per the lazy-expiry
// rule, even this read-only check frees the seat immediately if the hold has actually expired,
// instead of waiting for the cron sweep to get around to it.
export async function getHoldStatus(customerId: string, holdId: string): Promise<HoldStatusResult> {
  let broadcast: { showId: string; seatId: string } | undefined;

  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<HoldStatusResult>> => {
      const hold = await tx.hold.findUnique({ where: { id: holdId } });
      if (!hold) return { ok: false, code: "NOT_FOUND" };
      if (hold.customerId !== customerId) return { ok: false, code: "FORBIDDEN", message: "This hold does not belong to you" };

      let status = hold.status;
      if (status === "active" && hold.expiresAt.getTime() < Date.now()) {
        const showSeat = await lockShowSeatById(tx, hold.showSeatId);
        await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
        if (showSeat && showSeat.current_hold_id === hold.id) {
          await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "available", currentHoldId: null } });
          broadcast = { showId: showSeat.show_id, seatId: showSeat.seat_id };
        }
        status = "expired";
      }

      const remainingSeconds = status === "active" ? Math.max(0, Math.ceil((hold.expiresAt.getTime() - Date.now()) / 1000)) : 0;

      return {
        ok: true,
        value: { holdId: hold.id, showSeatId: hold.showSeatId, status, expiresAt: hold.expiresAt, remainingSeconds },
      };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);
  if (broadcast) broadcastSeatStatusChanged(broadcast.showId, broadcast.seatId, "available");
  return outcome.value;
}

export async function confirmHold(customerId: string, holdId: string) {
  let broadcast: { showId: string; seatId: string } | undefined;

  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<Booking>> => {
      const hold = await tx.hold.findUnique({ where: { id: holdId } });
      if (!hold) return { ok: false, code: "NOT_FOUND" };
      if (hold.customerId !== customerId) return { ok: false, code: "FORBIDDEN", message: "This hold does not belong to you" };

      const locked = await lockShowSeatById(tx, hold.showSeatId);
      if (!locked) return { ok: false, code: "NOT_FOUND" };
      const showSeat = await expireIfNeeded(tx, locked);

      const stillActive = hold.status === "active" && hold.expiresAt.getTime() >= Date.now();
      if (!stillActive || showSeat.current_hold_id !== hold.id) {
        if (hold.status === "active" && showSeat.current_hold_id === hold.id) {
          // Covers the (normally unreachable) case where expireIfNeeded didn't already
          // catch this — keep the hold record consistent with the seat either way.
          await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
        }
        return { ok: false, code: "HOLD_EXPIRED" };
      }

      const seat = await tx.seat.findUniqueOrThrow({ where: { id: showSeat.seat_id } });
      const pricing = await tx.showSeatPricing.findUnique({
        where: { showId_category: { showId: showSeat.show_id, category: seat.category } },
      });
      if (!pricing) return { ok: false, code: "NOT_FOUND" };

      const bookingReference = generateBookingReference();

      const booking = await tx.booking.create({
        data: {
          customerId,
          showId: showSeat.show_id,
          bookingReference,
          status: "confirmed",
          totalPrice: pricing.price,
        },
      });
      await tx.bookingSeat.create({ data: { bookingId: booking.id, showSeatId: showSeat.id } });
      await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "booked", currentHoldId: null } });
      await tx.hold.update({ where: { id: hold.id }, data: { status: "converted" } });

      broadcast = { showId: showSeat.show_id, seatId: showSeat.seat_id };
      return { ok: true, value: booking };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);
  if (broadcast) broadcastSeatStatusChanged(broadcast.showId, broadcast.seatId, "booked");

  // Fire-and-forget, deliberately not awaited: the booking already committed, and email
  // delivery (real SMTP round-trip) shouldn't add latency to the customer's response, nor can
  // its failure undo a booking that already succeeded (sendBookingConfirmationEmail never throws).
  void sendBookingConfirmationEmail(outcome.value.id);

  return outcome.value;
}

interface ConfirmedSeat {
  showSeatId: string;
  showId: string;
  seatId: string;
  category: string;
}

// Converts several active holds into ONE booking with one booking_seats row per seat — the
// multi-seat counterpart to confirmHold. All-or-nothing: if any hold has expired or been taken,
// none of them convert (though a lazy-expiry write for the specific expired one still commits,
// same integrity guarantee as every other function here — see the Outcome comment above).
export async function confirmHolds(customerId: string, holdIds: string[]) {
  const uniqueHoldIds = [...new Set(holdIds)];
  let broadcasts: { showId: string; seatId: string }[] = [];

  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<Booking>> => {
      broadcasts = [];

      const holds = await tx.hold.findMany({ where: { id: { in: uniqueHoldIds } } });
      if (holds.length !== uniqueHoldIds.length) return { ok: false, code: "NOT_FOUND", message: "One or more holds not found" };
      for (const hold of holds) {
        if (hold.customerId !== customerId) {
          return { ok: false, code: "FORBIDDEN", message: "One or more holds do not belong to you" };
        }
      }

      // Lock every seat in a fixed order (by show_seat id, not hold order) so two concurrent
      // multi-seat confirms can never deadlock waiting on each other's locks.
      const sortedHolds = [...holds].sort((a, b) => a.showSeatId.localeCompare(b.showSeatId));

      const confirmedSeats: ConfirmedSeat[] = [];
      for (const hold of sortedHolds) {
        const locked = await lockShowSeatById(tx, hold.showSeatId);
        if (!locked) return { ok: false, code: "NOT_FOUND" };
        const showSeat = await expireIfNeeded(tx, locked);

        const stillActive = hold.status === "active" && hold.expiresAt.getTime() >= Date.now();
        if (!stillActive || showSeat.current_hold_id !== hold.id) {
          if (hold.status === "active" && showSeat.current_hold_id === hold.id) {
            await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
          }
          return { ok: false, code: "HOLD_EXPIRED" };
        }

        const seat = await tx.seat.findUniqueOrThrow({ where: { id: showSeat.seat_id } });
        confirmedSeats.push({ showSeatId: showSeat.id, showId: showSeat.show_id, seatId: showSeat.seat_id, category: seat.category });
      }

      if (new Set(confirmedSeats.map((s) => s.showSeatId)).size !== confirmedSeats.length) {
        return { ok: false, code: "SEAT_UNAVAILABLE", message: "Duplicate seat in request" };
      }
      const showIds = new Set(confirmedSeats.map((s) => s.showId));
      if (showIds.size > 1) return { ok: false, code: "SEAT_UNAVAILABLE", message: "All seats must belong to the same show" };
      const showId = confirmedSeats[0].showId;

      const categories = [...new Set(confirmedSeats.map((s) => s.category))];
      const pricingRows = await tx.showSeatPricing.findMany({ where: { showId, category: { in: categories } } });
      const priceByCategory = new Map(pricingRows.map((p) => [p.category, p.price]));
      for (const category of categories) {
        if (!priceByCategory.has(category)) {
          return { ok: false, code: "NOT_FOUND", message: `No pricing configured for ${category}` };
        }
      }
      const totalPrice = confirmedSeats.reduce((sum, s) => sum + Number(priceByCategory.get(s.category)), 0);

      const booking = await tx.booking.create({
        data: {
          customerId,
          showId,
          bookingReference: generateBookingReference(),
          status: "confirmed",
          totalPrice,
        },
      });
      for (const s of confirmedSeats) {
        await tx.bookingSeat.create({ data: { bookingId: booking.id, showSeatId: s.showSeatId } });
        await tx.showSeat.update({ where: { id: s.showSeatId }, data: { status: "booked", currentHoldId: null } });
      }
      for (const hold of sortedHolds) {
        await tx.hold.update({ where: { id: hold.id }, data: { status: "converted" } });
      }

      broadcasts = confirmedSeats.map((s) => ({ showId: s.showId, seatId: s.seatId }));
      return { ok: true, value: booking };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);
  for (const b of broadcasts) broadcastSeatStatusChanged(b.showId, b.seatId, "booked");
  void sendBookingConfirmationEmail(outcome.value.id);

  return outcome.value;
}

export async function listBookings(customerId: string) {
  return prisma.booking.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      show: { include: { event: true, venue: true } },
      bookingSeats: { include: { showSeat: { include: { seat: true } } } },
    },
  });
}

// Frees the booked seat(s), then hands each freed category to the waitlist queue. The waitlist
// pass runs *after* the cancel transaction commits, deliberately: it keeps seat-row locks short,
// and it means a problem while offering can never roll back a cancellation the customer has
// already been told succeeded.
export async function cancelBooking(customerId: string, bookingId: string) {
  const freedSeats: { showId: string; seatId: string }[] = [];

  const outcome = await withRetryOnce(() =>
    prisma.$transaction(async (tx): Promise<Outcome<{ showId: string; categories: string[] }>> => {
      freedSeats.length = 0; // withRetryOnce may re-run the callback; don't double-report a first attempt's seats

      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { bookingSeats: true },
      });
      if (!booking) return { ok: false, code: "NOT_FOUND", message: "Booking not found" };
      if (booking.customerId !== customerId) {
        return { ok: false, code: "FORBIDDEN", message: "This booking does not belong to you" };
      }
      if (booking.status !== "confirmed") {
        return { ok: false, code: "BOOKING_NOT_CONFIRMED", message: "This booking is already cancelled" };
      }

      const categories = new Set<string>();
      for (const bookingSeat of booking.bookingSeats) {
        const locked = await lockShowSeatById(tx, bookingSeat.showSeatId);
        if (!locked) continue;
        const seat = await tx.seat.findUniqueOrThrow({ where: { id: locked.seat_id } });
        categories.add(seat.category);
        await tx.showSeat.update({
          where: { id: locked.id },
          data: { status: "available", currentHoldId: null },
        });
        freedSeats.push({ showId: locked.show_id, seatId: locked.seat_id });
      }

      await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });

      return { ok: true, value: { showId: booking.showId, categories: [...categories] } };
    })
  );

  if (!outcome.ok) raise(outcome.code, outcome.message);

  for (const seat of freedSeats) {
    broadcastSeatStatusChanged(seat.showId, seat.seatId, "available");
  }

  // Broadcasts "held" for whichever seat(s) get reserved for the next waitlisted customer —
  // possibly, but not necessarily, the same seats just freed above.
  for (const category of outcome.value.categories) {
    await fillWaitlistForCategory(outcome.value.showId, category);
  }

  return { cancelled: true, bookingId };
}
