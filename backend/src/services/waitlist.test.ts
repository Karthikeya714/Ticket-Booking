import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../prisma";
import { sweepExpiredOffers } from "./waitlist";

const app = createApp();

const CATEGORY = "STANDARD";

async function makeCustomer(label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({ data: { email, passwordHash, name: label, role: "customer" } });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return { id: user.id, email, token: res.body.token as string };
}

// One show with `seatCount` seats in a single category, so a category can be filled to capacity
// and the waitlist behaviour observed in isolation.
async function makeShow(seatCount: number) {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `wl-admin-${suffix}@example.com`, passwordHash, name: "WL Admin", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `wl-org-${suffix}@example.com`, passwordHash, name: "WL Organiser", role: "organiser" },
  });

  const venue = await prisma.venue.create({ data: { name: "WL Venue", address: "N/A", createdByAdminId: admin.id } });
  const event = await prisma.event.create({
    data: { title: "WL Event", type: "movie", organiserId: organiser.id, description: "t" },
  });
  const show = await prisma.show.create({
    data: { eventId: event.id, venueId: venue.id, dateTime: new Date(Date.now() + 86_400_000), status: "scheduled" },
  });
  await prisma.showSeatPricing.create({ data: { showId: show.id, category: CATEGORY, price: 12 } });

  const seatIds: string[] = [];
  for (let i = 0; i < seatCount; i++) {
    const seat = await prisma.seat.create({
      data: { venueId: venue.id, rowLabel: "W", seatNumber: i + 1, category: CATEGORY },
    });
    await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });
    seatIds.push(seat.id);
  }

  return { showId: show.id, seatIds };
}

async function bookSeat(showId: string, seatId: string, token: string) {
  const hold = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
  expect(hold.status).toBe(201);
  const confirm = await request(app).post(`/api/holds/${hold.body.holdId}/confirm`).set("Authorization", `Bearer ${token}`);
  expect(confirm.status).toBe(201);
  return confirm.body.booking.id as string;
}

async function pendingOfferFor(customerId: string) {
  return prisma.waitlistOffer.findFirst({
    where: { status: "pending", waitlistEntry: { customerId } },
    include: { waitlistEntry: true },
  });
}

describe("waitlist join", () => {
  it("rejects joining while seats are still available in the category", async () => {
    const { showId } = await makeShow(2);
    const customer = await makeCustomer("wl-early");

    const res = await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ category: CATEGORY });

    expect(res.status).toBe(400);
  });

  it("accepts joining once the category is sold out, and rejects duplicate joins", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("wl-buyer");
    const waiter = await makeCustomer("wl-waiter");

    await bookSeat(showId, seatIds[0], buyer.token);

    const first = await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${waiter.token}`)
      .send({ category: CATEGORY });
    expect(first.status).toBe(201);
    expect(first.body.position).toBe(1);

    const duplicate = await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${waiter.token}`)
      .send({ category: CATEGORY });
    expect(duplicate.status).toBe(409);
  });
});

describe("waitlist auto-assignment on cancellation", () => {
  it("offers the freed seat to the longest-waiting customer, in FIFO order", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("fifo-buyer");
    const first = await makeCustomer("fifo-1");
    const second = await makeCustomer("fifo-2");
    const third = await makeCustomer("fifo-3");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);

    // Joined in order, so `first` must be the one offered the seat.
    for (const customer of [first, second, third]) {
      const res = await request(app)
        .post(`/api/shows/${showId}/waitlist`)
        .set("Authorization", `Bearer ${customer.token}`)
        .send({ category: CATEGORY });
      expect(res.status).toBe(201);
    }

    const cancel = await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);
    expect(cancel.status).toBe(200);

    const offer = await pendingOfferFor(first.id);
    expect(offer).not.toBeNull();
    expect(offer!.waitlistEntry.status).toBe("offered");

    // The other two stay queued, and the seat is reserved rather than left bookable.
    const secondEntry = await prisma.waitlistEntry.findFirstOrThrow({ where: { customerId: second.id } });
    expect(secondEntry.status).toBe("waiting");
    const showSeat = await prisma.showSeat.findUniqueOrThrow({ where: { id: offer!.showSeatId } });
    expect(showSeat.status).toBe("held");
    expect(showSeat.currentHoldId).toBeNull();
  });

  it("cascades to the next customer automatically when an offer expires unclaimed", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("cascade-buyer");
    const first = await makeCustomer("cascade-1");
    const second = await makeCustomer("cascade-2");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);
    for (const customer of [first, second]) {
      await request(app)
        .post(`/api/shows/${showId}/waitlist`)
        .set("Authorization", `Bearer ${customer.token}`)
        .send({ category: CATEGORY });
    }
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);

    const firstOffer = await pendingOfferFor(first.id);
    expect(firstOffer).not.toBeNull();

    // Simulate the offer TTL lapsing, then run the sweep the cron runs on a timer.
    await prisma.waitlistOffer.update({
      where: { id: firstOffer!.id },
      data: { offerExpiresAt: new Date(Date.now() - 1000) },
    });
    await sweepExpiredOffers();

    const firstOfferAfter = await prisma.waitlistOffer.findUniqueOrThrow({ where: { id: firstOffer!.id } });
    expect(firstOfferAfter.status).toBe("expired");
    const firstEntryAfter = await prisma.waitlistEntry.findFirstOrThrow({ where: { customerId: first.id } });
    expect(firstEntryAfter.status).toBe("expired");

    // The seat moved straight to the next person in line, with no manual intervention.
    const secondOffer = await pendingOfferFor(second.id);
    expect(secondOffer).not.toBeNull();
    expect(secondOffer!.showSeatId).toBe(firstOffer!.showSeatId);
  });

  it("leaves the seat available when nobody is waiting", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("nobody-waiting");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);

    const showSeat = await prisma.showSeat.findFirstOrThrow({ where: { showId, seatId: seatIds[0] } });
    expect(showSeat.status).toBe("available");
  });
});

describe("waitlist offer acceptance", () => {
  it("converts an accepted offer into a confirmed booking", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("accept-buyer");
    const waiter = await makeCustomer("accept-waiter");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);
    await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${waiter.token}`)
      .send({ category: CATEGORY });
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);

    const offer = await pendingOfferFor(waiter.id);
    expect(offer).not.toBeNull();

    const accept = await request(app)
      .post(`/api/waitlist-offers/${offer!.id}/accept`)
      .set("Authorization", `Bearer ${waiter.token}`);
    expect(accept.status).toBe(201);
    expect(accept.body.booking.bookingReference).toMatch(/^BK-/);

    const offerAfter = await prisma.waitlistOffer.findUniqueOrThrow({ where: { id: offer!.id } });
    expect(offerAfter.status).toBe("accepted");
    const entryAfter = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: offer!.waitlistEntryId } });
    expect(entryAfter.status).toBe("fulfilled");
    const showSeat = await prisma.showSeat.findUniqueOrThrow({ where: { id: offer!.showSeatId } });
    expect(showSeat.status).toBe("booked");
  });

  it("rejects accepting an expired offer and frees the seat", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("expired-buyer");
    const waiter = await makeCustomer("expired-waiter");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);
    await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${waiter.token}`)
      .send({ category: CATEGORY });
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);

    const offer = await pendingOfferFor(waiter.id);
    await prisma.waitlistOffer.update({
      where: { id: offer!.id },
      data: { offerExpiresAt: new Date(Date.now() - 1000) },
    });

    const accept = await request(app)
      .post(`/api/waitlist-offers/${offer!.id}/accept`)
      .set("Authorization", `Bearer ${waiter.token}`);
    expect(accept.status).toBe(409);
    expect(accept.body.error).toBe("OFFER_EXPIRED");

    // Queue is empty behind them, so the seat goes back to being freely bookable.
    const showSeat = await prisma.showSeat.findUniqueOrThrow({ where: { id: offer!.showSeatId } });
    expect(showSeat.status).toBe("available");
  });

  it("rejects accepting someone else's offer", async () => {
    const { showId, seatIds } = await makeShow(1);
    const buyer = await makeCustomer("other-buyer");
    const waiter = await makeCustomer("other-waiter");
    const intruder = await makeCustomer("other-intruder");

    const bookingId = await bookSeat(showId, seatIds[0], buyer.token);
    await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${waiter.token}`)
      .send({ category: CATEGORY });
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${buyer.token}`);

    const offer = await pendingOfferFor(waiter.id);
    const accept = await request(app)
      .post(`/api/waitlist-offers/${offer!.id}/accept`)
      .set("Authorization", `Bearer ${intruder.token}`);
    expect(accept.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
