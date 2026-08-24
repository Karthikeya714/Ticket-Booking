import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../prisma";

const app = createApp();

// Self-contained: creates its own admin/organiser rather than depending on seed data, so this
// suite works against any empty Postgres database (e.g. the isolated ticketing_test DB).
async function makeShowWithSeats(seatCount: number) {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `test-admin-${suffix}@example.com`, passwordHash, name: "Test Admin", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `test-organiser-${suffix}@example.com`, passwordHash, name: "Test Organiser", role: "organiser" },
  });

  const venue = await prisma.venue.create({
    data: { name: `Test Venue ${Date.now()}`, address: "N/A", createdByAdminId: admin.id },
  });
  const event = await prisma.event.create({
    data: { title: "Test Event", type: "movie", organiserId: organiser.id, description: "test" },
  });
  const show = await prisma.show.create({
    data: { eventId: event.id, venueId: venue.id, dateTime: new Date(), status: "scheduled" },
  });
  await prisma.showSeatPricing.create({ data: { showId: show.id, category: "STANDARD", price: 10 } });

  const seatIds: string[] = [];
  for (let i = 0; i < seatCount; i++) {
    const seat = await prisma.seat.create({
      data: { venueId: venue.id, rowLabel: "Z", seatNumber: i + 1, category: "STANDARD" },
    });
    await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });
    seatIds.push(seat.id);
  }

  return { showId: show.id, seatIds };
}

async function makeCustomerToken(label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({ data: { email, passwordHash, name: label, role: "customer" } });

  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token as string;
}

describe("seat hold concurrency", () => {
  it("only allows exactly one of N concurrent hold requests on the same seat to succeed", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const token = await makeCustomerToken("concurrent");

    const N = 15;
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`)
      )
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(N - 1);
    conflicted.forEach((r) => expect(r.body.error).toBe("SEAT_UNAVAILABLE"));

    const showSeat = await prisma.showSeat.findUniqueOrThrow({
      where: { showId_seatId: { showId, seatId } },
    });
    expect(showSeat.status).toBe("held");
  });
});

describe("hold lifecycle", () => {
  it("rejects holding a seat that is already held", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const tokenA = await makeCustomerToken("holderA");
    const tokenB = await makeCustomerToken("holderB");

    const first = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${tokenA}`);
    expect(first.status).toBe(201);

    const second = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${tokenB}`);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("SEAT_UNAVAILABLE");
  });

  it("confirms a valid hold into a booking and marks the seat booked", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const token = await makeCustomerToken("confirmer");

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
    expect(holdRes.status).toBe(201);

    const confirmRes = await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/confirm`)
      .set("Authorization", `Bearer ${token}`);
    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.booking.status).toBe("confirmed");
    expect(confirmRes.body.booking.bookingReference).toMatch(/^BK-/);

    const showSeat = await prisma.showSeat.findUniqueOrThrow({ where: { showId_seatId: { showId, seatId } } });
    expect(showSeat.status).toBe("booked");

    const hold = await prisma.hold.findUniqueOrThrow({ where: { id: holdRes.body.holdId } });
    expect(hold.status).toBe("converted");
  });

  it("rejects confirming an expired hold, and lazily frees the seat", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const token = await makeCustomerToken("expiree");

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
    expect(holdRes.status).toBe(201);

    // Simulate TTL elapsing without waiting for it or the cron sweep.
    await prisma.hold.update({ where: { id: holdRes.body.holdId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const confirmRes = await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/confirm`)
      .set("Authorization", `Bearer ${token}`);
    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.error).toBe("HOLD_EXPIRED");

    const hold = await prisma.hold.findUniqueOrThrow({ where: { id: holdRes.body.holdId } });
    expect(hold.status).toBe("expired");

    const showSeat = await prisma.showSeat.findUniqueOrThrow({ where: { showId_seatId: { showId, seatId } } });
    expect(showSeat.status).toBe("available");
  });

  it("rejects confirming someone else's hold", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const owner = await makeCustomerToken("owner");
    const intruder = await makeCustomerToken("intruder");

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${owner}`);
    expect(holdRes.status).toBe(201);

    const confirmRes = await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/confirm`)
      .set("Authorization", `Bearer ${intruder}`);
    expect(confirmRes.status).toBe(403);
  });

  it("releasing a hold frees the seat for someone else to hold", async () => {
    const { showId, seatIds } = await makeShowWithSeats(1);
    const seatId = seatIds[0];
    const tokenA = await makeCustomerToken("releaserA");
    const tokenB = await makeCustomerToken("releaserB");

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${tokenA}`);
    expect(holdRes.status).toBe(201);

    const releaseRes = await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/release`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(releaseRes.status).toBe(200);

    const secondHold = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${tokenB}`);
    expect(secondHold.status).toBe(201);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
