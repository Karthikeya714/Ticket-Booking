import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { futureShowDate } from "./testFixtures";
import http from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import bcrypt from "bcryptjs";
import { createApp } from "./app";
import { initSocketIO } from "./realtime";
import { prisma } from "./prisma";

// Mirrors what a real two-browser-tab scenario looks like: two independent socket connections
// joined to the same show room must both see every seat_status_changed event, proving the
// broadcast actually reaches everyone watching a show — not just the customer who acted.

let server: http.Server;
let baseUrl: string;
const app = createApp();

async function connectAndJoin(showId: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, { forceNew: true, transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });
  socket.emit("join-show", showId);
  // Give the server a moment to process the room join before the caller triggers a mutation.
  await new Promise((resolve) => setTimeout(resolve, 100));
  return socket;
}

function waitForSeatEvent(socket: ClientSocket): Promise<{ seatId: string; status: string }> {
  return new Promise((resolve) => socket.once("seat_status_changed", resolve));
}

async function makeShowWithSeat() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({
    data: { email: `rt-admin-${suffix}@example.com`, passwordHash, name: "RT Admin", role: "admin" },
  });
  const organiser = await prisma.user.create({
    data: { email: `rt-org-${suffix}@example.com`, passwordHash, name: "RT Organiser", role: "organiser" },
  });
  const venue = await prisma.venue.create({ data: { name: "RT Venue", address: "N/A", createdByAdminId: admin.id } });
  const event = await prisma.event.create({ data: { title: "RT Event", type: "movie", organiserId: organiser.id, description: "t" } });
  const show = await prisma.show.create({ data: { eventId: event.id, venueId: venue.id, dateTime: futureShowDate(), status: "scheduled" } });
  await prisma.showSeatPricing.create({ data: { showId: show.id, category: "STANDARD", price: 15 } });
  const seat = await prisma.seat.create({ data: { venueId: venue.id, rowLabel: "R", seatNumber: 1, category: "STANDARD" } });
  await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });
  return { showId: show.id, seatId: seat.id };
}

async function makeCustomerToken() {
  const email = `rt-cust-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({ data: { email, passwordHash, name: "RT Customer", role: "customer" } });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token as string;
}

beforeAll(async () => {
  server = http.createServer(app);
  initSocketIO(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe("real-time seat map", () => {
  it("broadcasts seat_status_changed to every client watching the show when a seat is held", async () => {
    const { showId, seatId } = await makeShowWithSeat();
    const token = await makeCustomerToken();

    const viewerA = await connectAndJoin(showId);
    const viewerB = await connectAndJoin(showId);

    const [eventA, eventB] = await Promise.all([
      waitForSeatEvent(viewerA),
      waitForSeatEvent(viewerB),
      request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`),
    ]);

    expect(eventA).toEqual({ seatId, status: "held" });
    expect(eventB).toEqual({ seatId, status: "held" });

    viewerA.disconnect();
    viewerB.disconnect();
  });

  it("broadcasts booked when a hold is confirmed", async () => {
    const { showId, seatId } = await makeShowWithSeat();
    const token = await makeCustomerToken();

    const viewer = await connectAndJoin(showId);

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
    expect(holdRes.status).toBe(201);

    const confirmedEvent = waitForSeatEvent(viewer);
    const confirmRes = await request(app).post(`/api/holds/${holdRes.body.holdId}/confirm`).set("Authorization", `Bearer ${token}`);
    expect(confirmRes.status).toBe(201);
    await expect(confirmedEvent).resolves.toEqual({ seatId, status: "booked" });

    viewer.disconnect();
  });

  it("broadcasts available when a hold is released", async () => {
    const { showId, seatId } = await makeShowWithSeat();
    const token = await makeCustomerToken();

    const viewer = await connectAndJoin(showId);

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
    expect(holdRes.status).toBe(201);

    const releasedEvent = waitForSeatEvent(viewer);
    const releaseRes = await request(app).post(`/api/holds/${holdRes.body.holdId}/release`).set("Authorization", `Bearer ${token}`);
    expect(releaseRes.status).toBe(200);
    await expect(releasedEvent).resolves.toEqual({ seatId, status: "available" });

    viewer.disconnect();
  });

  it("a viewer who never joined the show room does not receive the event", async () => {
    const { showId, seatId } = await makeShowWithSeat();
    const other = await makeShowWithSeat(); // a different show
    const token = await makeCustomerToken();

    const wrongRoomViewer = await connectAndJoin(other.showId);
    let receivedWrongEvent = false;
    wrongRoomViewer.once("seat_status_changed", () => {
      receivedWrongEvent = true;
    });

    const holdRes = await request(app).post(`/api/shows/${showId}/seats/${seatId}/hold`).set("Authorization", `Bearer ${token}`);
    expect(holdRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(receivedWrongEvent).toBe(false);

    wrongRoomViewer.disconnect();
  });
});
