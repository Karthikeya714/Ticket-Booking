import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../prisma";

const app = createApp();

async function makeShowWithSeats(seatSpecs: { category: string; price: number }[]) {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `mc-admin-${suffix}@example.com`, passwordHash, name: "MC Admin", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `mc-org-${suffix}@example.com`, passwordHash, name: "MC Organiser", role: "organiser" },
  });
  const venue = await prisma.venue.create({ data: { name: "MC Venue", address: "N/A", createdByAdminId: admin.id } });
  const event = await prisma.event.create({ data: { title: "MC Event", type: "movie", organiserId: organiser.id, description: "t" } });
  const show = await prisma.show.create({ data: { eventId: event.id, venueId: venue.id, dateTime: new Date(), status: "scheduled" } });

  const categories = [...new Set(seatSpecs.map((s) => s.category))];
  for (const category of categories) {
    const spec = seatSpecs.find((s) => s.category === category)!;
    await prisma.showSeatPricing.create({ data: { showId: show.id, category, price: spec.price } });
  }

  const seatIds: string[] = [];
  for (let i = 0; i < seatSpecs.length; i++) {
    const seat = await prisma.seat.create({
      data: { venueId: venue.id, rowLabel: "M", seatNumber: i + 1, category: seatSpecs[i].category },
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

async function hold(showId: string, seatId: string, token: string) {
  const res = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(201);
  return res.body.holdId as string;
}

describe("multi-seat confirm", () => {
  it("confirms several holds into one booking with the summed price across categories", async () => {
    const { showId, seatIds } = await makeShowWithSeats([
      { category: "PREMIUM", price: 25 },
      { category: "PREMIUM", price: 25 },
      { category: "STANDARD", price: 15 },
    ]);
    const token = await makeCustomerToken("multi-buyer");

    const holdIds = await Promise.all(seatIds.map((seatId) => hold(showId, seatId, token)));

    const confirm = await request(app).post("/api/holds/confirm").set("Authorization", `Bearer ${token}`).send({ holdIds });
    expect(confirm.status).toBe(201);
    expect(confirm.body.booking.totalPrice).toBe("65"); // 25 + 25 + 15
    expect(confirm.body.booking.bookingReference).toMatch(/^BK-/);

    const bookingSeats = await prisma.bookingSeat.findMany({ where: { bookingId: confirm.body.booking.id } });
    expect(bookingSeats).toHaveLength(3);

    for (const seatId of seatIds) {
      const showSeat = await prisma.showSeat.findFirstOrThrow({ where: { showId, seatId } });
      expect(showSeat.status).toBe("booked");
    }

    const holdsAfter = await prisma.hold.findMany({ where: { id: { in: holdIds } } });
    expect(holdsAfter.every((h) => h.status === "converted")).toBe(true);
  });

  it("is all-or-nothing: if one hold expired, none of the seats get booked, but the expired one is freed", async () => {
    const { showId, seatIds } = await makeShowWithSeats([
      { category: "STANDARD", price: 10 },
      { category: "STANDARD", price: 10 },
    ]);
    const token = await makeCustomerToken("partial-expiry");

    const validHoldId = await hold(showId, seatIds[0], token);
    const expiringHoldId = await hold(showId, seatIds[1], token);
    await prisma.hold.update({ where: { id: expiringHoldId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const confirm = await request(app)
      .post("/api/holds/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ holdIds: [validHoldId, expiringHoldId] });
    expect(confirm.status).toBe(409);
    expect(confirm.body.error).toBe("HOLD_EXPIRED");

    // Neither seat was booked.
    const seat0 = await prisma.showSeat.findFirstOrThrow({ where: { showId, seatId: seatIds[0] } });
    const seat1 = await prisma.showSeat.findFirstOrThrow({ where: { showId, seatId: seatIds[1] } });
    expect(seat0.status).toBe("held"); // still held by the customer's valid hold
    expect(seat1.status).toBe("available"); // freed by the lazy expiry inside the same transaction

    const expiredHold = await prisma.hold.findUniqueOrThrow({ where: { id: expiringHoldId } });
    expect(expiredHold.status).toBe("expired");
    const validHold = await prisma.hold.findUniqueOrThrow({ where: { id: validHoldId } });
    expect(validHold.status).toBe("active"); // untouched, customer can still confirm it alone or with a new hold
  });

  it("rejects a batch containing someone else's hold, with none converted", async () => {
    const { showId, seatIds } = await makeShowWithSeats([
      { category: "STANDARD", price: 10 },
      { category: "STANDARD", price: 10 },
    ]);
    const owner = await makeCustomerToken("batch-owner");
    const intruder = await makeCustomerToken("batch-intruder");

    const ownHoldId = await hold(showId, seatIds[0], owner);
    const otherHoldId = await hold(showId, seatIds[1], intruder);

    const confirm = await request(app)
      .post("/api/holds/confirm")
      .set("Authorization", `Bearer ${owner}`)
      .send({ holdIds: [ownHoldId, otherHoldId] });
    expect(confirm.status).toBe(403);

    const seat0 = await prisma.showSeat.findFirstOrThrow({ where: { showId, seatId: seatIds[0] } });
    expect(seat0.status).toBe("held"); // owner's hold untouched
  });

  it("rejects an empty holdIds array", async () => {
    const token = await makeCustomerToken("empty-batch");
    const res = await request(app).post("/api/holds/confirm").set("Authorization", `Bearer ${token}`).send({ holdIds: [] });
    expect(res.status).toBe(400);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
