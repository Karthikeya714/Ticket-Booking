import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { sweepExpiredHolds } from "./expireHolds";

async function makeShowWithOneSeat() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `sweep-admin-${suffix}@example.com`, passwordHash, name: "Sweep Admin", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `sweep-organiser-${suffix}@example.com`, passwordHash, name: "Sweep Organiser", role: "organiser" },
  });
  const customer = await prisma.user.create({
    data: { email: `sweep-customer-${suffix}@example.com`, passwordHash, name: "Sweep Customer", role: "customer" },
  });

  const venue = await prisma.venue.create({ data: { name: "Sweep Venue", address: "N/A", createdByAdminId: admin.id } });
  const event = await prisma.event.create({ data: { title: "Sweep Event", type: "movie", organiserId: organiser.id, description: "t" } });
  const show = await prisma.show.create({ data: { eventId: event.id, venueId: venue.id, dateTime: new Date(), status: "scheduled" } });
  const seat = await prisma.seat.create({ data: { venueId: venue.id, rowLabel: "S", seatNumber: 1, category: "STANDARD" } });
  const showSeat = await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });

  return { customerId: customer.id, showSeatId: showSeat.id };
}

describe("sweepExpiredHolds", () => {
  it("frees seats whose holds expired, and ignores holds that haven't expired yet", async () => {
    const expired = await makeShowWithOneSeat();
    const notExpired = await makeShowWithOneSeat();

    const expiredHold = await prisma.hold.create({
      data: { showSeatId: expired.showSeatId, customerId: expired.customerId, status: "active", expiresAt: new Date(Date.now() - 5000) },
    });
    await prisma.showSeat.update({ where: { id: expired.showSeatId }, data: { status: "held", currentHoldId: expiredHold.id } });

    const freshHold = await prisma.hold.create({
      data: { showSeatId: notExpired.showSeatId, customerId: notExpired.customerId, status: "active", expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.showSeat.update({ where: { id: notExpired.showSeatId }, data: { status: "held", currentHoldId: freshHold.id } });

    // This is a shared, non-transactional integration DB (no per-test rollback), and the sweep
    // is intentionally global, so we can't assert an exact count here without risking flakiness
    // against unrelated rows left by other test runs. What actually matters is verified below:
    // this test's own expired fixture got freed, and its own unexpired fixture didn't.
    const freedCount = await sweepExpiredHolds();
    expect(freedCount).toBeGreaterThanOrEqual(1);

    const expiredHoldAfter = await prisma.hold.findUniqueOrThrow({ where: { id: expiredHold.id } });
    expect(expiredHoldAfter.status).toBe("expired");
    const expiredSeatAfter = await prisma.showSeat.findUniqueOrThrow({ where: { id: expired.showSeatId } });
    expect(expiredSeatAfter.status).toBe("available");
    expect(expiredSeatAfter.currentHoldId).toBeNull();

    const freshHoldAfter = await prisma.hold.findUniqueOrThrow({ where: { id: freshHold.id } });
    expect(freshHoldAfter.status).toBe("active");
    const freshSeatAfter = await prisma.showSeat.findUniqueOrThrow({ where: { id: notExpired.showSeatId } });
    expect(freshSeatAfter.status).toBe("held");
  });

  it("is idempotent: sweeping twice in a row only frees once", async () => {
    const { customerId, showSeatId } = await makeShowWithOneSeat();
    const hold = await prisma.hold.create({
      data: { showSeatId, customerId, status: "active", expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.showSeat.update({ where: { id: showSeatId }, data: { status: "held", currentHoldId: hold.id } });

    await sweepExpiredHolds();
    const afterFirst = await prisma.hold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(afterFirst.status).toBe("expired");

    // Sweeping again must not error or re-process this already-expired hold.
    await sweepExpiredHolds();
    const afterSecond = await prisma.hold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(afterSecond.status).toBe("expired");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
