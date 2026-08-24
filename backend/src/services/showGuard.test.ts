import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../prisma";
import { futureShowDate } from "../testFixtures";

const app = createApp();

// A show that's already started (or been cancelled) must stop accepting new holds and waitlist
// joins. Without this, last week's seat map stays fully interactive and cancelling such a
// booking would cascade waitlist offer emails for an event nobody can attend.
async function makeShow(opts: { dateTime: Date; status?: "scheduled" | "cancelled" }) {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `guard-admin-${suffix}@example.com`, passwordHash, name: "A", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `guard-org-${suffix}@example.com`, passwordHash, name: "O", role: "organiser" },
  });
  const venue = await prisma.venue.create({ data: { name: `Guard Venue ${suffix}`, address: "x", createdByAdminId: admin.id } });
  const event = await prisma.event.create({
    data: { title: `Guard Event ${suffix}`, type: "movie", organiserId: organiser.id, description: "d" },
  });
  const show = await prisma.show.create({
    data: { eventId: event.id, venueId: venue.id, dateTime: opts.dateTime, status: opts.status ?? "scheduled" },
  });
  await prisma.showSeatPricing.create({ data: { showId: show.id, category: "STANDARD", price: 10 } });
  const seat = await prisma.seat.create({ data: { venueId: venue.id, rowLabel: "A", seatNumber: 1, category: "STANDARD" } });
  await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });

  return { showId: show.id, seatId: seat.id, eventId: event.id };
}

async function customerToken(label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({ data: { email, passwordHash, name: label, role: "customer" } });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token as string;
}

describe("show bookability guard", () => {
  it("rejects holding a seat on a show that already started", async () => {
    const { showId, seatId } = await makeShow({ dateTime: new Date(Date.now() - 60_000) });
    const token = await customerToken("past-hold");

    const res = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already started/i);
  });

  it("rejects holding a seat on a cancelled show", async () => {
    const { showId, seatId } = await makeShow({ dateTime: futureShowDate(), status: "cancelled" });
    const token = await customerToken("cancelled-hold");

    const res = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cancelled/i);
  });

  it("still allows holding a seat on an upcoming scheduled show", async () => {
    const { showId, seatId } = await makeShow({ dateTime: futureShowDate() });
    const token = await customerToken("future-hold");

    const res = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(201);
  });

  it("rejects joining the waitlist for a show that already started", async () => {
    const { showId } = await makeShow({ dateTime: new Date(Date.now() - 60_000) });
    const token = await customerToken("past-waitlist");

    const res = await request(app)
      .post(`/api/shows/${showId}/waitlist`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "STANDARD" });

    expect(res.status).toBe(409);
  });

  it("hides an event whose only show has already started from the public list", async () => {
    const { eventId } = await makeShow({ dateTime: new Date(Date.now() - 60_000) });

    const res = await request(app).get("/api/events");

    expect(res.status).toBe(200);
    expect(res.body.events.some((e: { id: string }) => e.id === eventId)).toBe(false);
  });

  it("hides an event with no shows at all from the public list, but lists one with an upcoming show", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organiser = await prisma.user.create({
      data: { email: `empty-org-${suffix}@example.com`, passwordHash, name: "O", role: "organiser" },
    });
    const emptyEvent = await prisma.event.create({
      data: { title: `Empty Event ${suffix}`, type: "movie", organiserId: organiser.id, description: "d" },
    });
    const { eventId: bookableEventId } = await makeShow({ dateTime: futureShowDate() });

    const res = await request(app).get("/api/events");

    expect(res.body.events.some((e: { id: string }) => e.id === emptyEvent.id)).toBe(false);
    expect(res.body.events.some((e: { id: string }) => e.id === bookableEventId)).toBe(true);
  });

  it("refuses to cancel a booking once the show has started", async () => {
    // Book while the show is still upcoming, then move it into the past — the same sequence a
    // real customer hits by simply not showing up.
    const { showId, seatId } = await makeShow({ dateTime: futureShowDate() });
    const token = await customerToken("late-cancel");
    const holdRes = await request(app)
      .post(`/api/shows/${showId}/seats/${seatId}/hold`)
      .set("Authorization", `Bearer ${token}`);
    const confirmRes = await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/confirm`)
      .set("Authorization", `Bearer ${token}`);
    const bookingId = confirmRes.body.booking.id;

    await prisma.show.update({ where: { id: showId }, data: { dateTime: new Date(Date.now() - 60_000) } });

    const res = await request(app).post(`/api/bookings/${bookingId}/cancel`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("confirmed");
  });

  it("excludes a past show from an event's detail page", async () => {
    const { eventId, showId } = await makeShow({ dateTime: new Date(Date.now() - 60_000) });

    const res = await request(app).get(`/api/events/${eventId}`);

    expect(res.status).toBe(200);
    expect(res.body.shows.some((s: { id: string }) => s.id === showId)).toBe(false);
  });
});
