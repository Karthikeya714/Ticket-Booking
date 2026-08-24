import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "../prisma";

const app = createApp();

async function makeUserToken(role: "admin" | "organiser" | "customer", label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({ data: { email, passwordHash, name: label, role } });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token as string;
}

describe("POST /api/venues", () => {
  it("lets an admin create a venue with a seat layout", async () => {
    const token = await makeUserToken("admin", "venue-admin");
    const res = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test Hall",
        address: "1 Test St",
        seatRows: [
          { rowLabel: "A", category: "PREMIUM", seatCount: 5 },
          { rowLabel: "B", category: "STANDARD", seatCount: 8 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.venue.seatCount).toBe(13);
    expect(new Set(res.body.venue.categories)).toEqual(new Set(["PREMIUM", "STANDARD"]));
  });

  it("rejects a non-admin", async () => {
    const token = await makeUserToken("organiser", "venue-org");
    const res = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nope", address: "x", seatRows: [{ rowLabel: "A", category: "STANDARD", seatCount: 1 }] });

    expect(res.status).toBe(403);
  });

  it("rejects duplicate row labels", async () => {
    const token = await makeUserToken("admin", "venue-admin-dup");
    const res = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Dup Hall",
        address: "x",
        seatRows: [
          { rowLabel: "A", category: "STANDARD", seatCount: 3 },
          { rowLabel: "a", category: "PREMIUM", seatCount: 3 },
        ],
      });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/venues/:venueId/seats", () => {
  it("adds new rows to an existing venue", async () => {
    const token = await makeUserToken("admin", "addseats-admin");
    const createRes = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Expandable Hall", address: "x", seatRows: [{ rowLabel: "A", category: "STANDARD", seatCount: 5 }] });
    const venueId = createRes.body.venue.id;

    const res = await request(app)
      .post(`/api/venues/${venueId}/seats`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatRows: [{ rowLabel: "B", category: "PREMIUM", seatCount: 4 }] });

    expect(res.status).toBe(201);
    expect(res.body.venue.seatCount).toBe(9);
    expect(new Set(res.body.venue.categories)).toEqual(new Set(["STANDARD", "PREMIUM"]));
  });

  it("rejects adding a row label that already exists on the venue", async () => {
    const token = await makeUserToken("admin", "addseats-admin-2");
    const createRes = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Collision Hall", address: "x", seatRows: [{ rowLabel: "A", category: "STANDARD", seatCount: 5 }] });
    const venueId = createRes.body.venue.id;

    const res = await request(app)
      .post(`/api/venues/${venueId}/seats`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatRows: [{ rowLabel: "a", category: "PREMIUM", seatCount: 4 }] });

    expect(res.status).toBe(400);
  });

  it("rejects a non-admin", async () => {
    const adminToken = await makeUserToken("admin", "addseats-admin-3");
    const orgToken = await makeUserToken("organiser", "addseats-org");
    const createRes = await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Guarded Hall", address: "x", seatRows: [{ rowLabel: "A", category: "STANDARD", seatCount: 5 }] });
    const venueId = createRes.body.venue.id;

    const res = await request(app)
      .post(`/api/venues/${venueId}/seats`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ seatRows: [{ rowLabel: "B", category: "STANDARD", seatCount: 2 }] });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/venues", () => {
  it("lists venues for an organiser (needed to pick one when creating a show)", async () => {
    const adminToken = await makeUserToken("admin", "venue-list-admin");
    await request(app)
      .post("/api/venues")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Listable Hall", address: "x", seatRows: [{ rowLabel: "A", category: "STANDARD", seatCount: 2 }] });

    const orgToken = await makeUserToken("organiser", "venue-list-org");
    const res = await request(app).get("/api/venues").set("Authorization", `Bearer ${orgToken}`);

    expect(res.status).toBe(200);
    expect(res.body.venues.some((v: { name: string }) => v.name === "Listable Hall")).toBe(true);
  });
});

async function makeVenue(adminToken: string, seatRows: { rowLabel: string; category: string; seatCount: number }[]) {
  const res = await request(app)
    .post("/api/venues")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `Venue ${Date.now()}-${Math.random()}`, address: "x", seatRows });
  return res.body.venue.id as string;
}

async function makeEvent(orgToken: string, title = "Test Event") {
  const res = await request(app)
    .post("/api/organiser/events")
    .set("Authorization", `Bearer ${orgToken}`)
    .send({ title, type: "movie", description: "desc" });
  return res.body.event.id as string;
}

describe("POST /api/organiser/events/:eventId/shows", () => {
  it("creates a show that immediately appears as bookable on the public events list", async () => {
    const adminToken = await makeUserToken("admin", "show-admin");
    const orgToken = await makeUserToken("organiser", "show-org");
    const venueId = await makeVenue(adminToken, [{ rowLabel: "A", category: "STANDARD", seatCount: 4 }]);
    const eventId = await makeEvent(orgToken, `Bookable Event ${Date.now()}`);

    const showRes = await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "STANDARD", price: 12 }] });

    expect(showRes.status).toBe(201);
    const showId = showRes.body.show.id;

    // Bookable: public seat map has 4 available seats at the configured price.
    const seatsRes = await request(app).get(`/api/shows/${showId}/seats`);
    expect(seatsRes.status).toBe(200);
    expect(seatsRes.body.seats).toHaveLength(4);
    expect(seatsRes.body.seats.every((s: { status: string; price: number }) => s.status === "available" && s.price === 12)).toBe(true);
  });

  it("rejects a show missing a price for one of the venue's categories", async () => {
    const adminToken = await makeUserToken("admin", "show-admin-2");
    const orgToken = await makeUserToken("organiser", "show-org-2");
    const venueId = await makeVenue(adminToken, [
      { rowLabel: "A", category: "PREMIUM", seatCount: 2 },
      { rowLabel: "B", category: "STANDARD", seatCount: 2 },
    ]);
    const eventId = await makeEvent(orgToken);

    const res = await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "PREMIUM", price: 20 }] });

    expect(res.status).toBe(400);
  });

  it("rejects creating a show for an event owned by a different organiser", async () => {
    const adminToken = await makeUserToken("admin", "show-admin-3");
    const ownerToken = await makeUserToken("organiser", "show-owner");
    const otherToken = await makeUserToken("organiser", "show-other");
    const venueId = await makeVenue(adminToken, [{ rowLabel: "A", category: "STANDARD", seatCount: 2 }]);
    const eventId = await makeEvent(ownerToken);

    const res = await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "STANDARD", price: 10 }] });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/organiser/events", () => {
  it("summarizes ticketsSold and totalRevenue as bookings come in", async () => {
    const adminToken = await makeUserToken("admin", "summary-admin");
    const orgToken = await makeUserToken("organiser", "summary-org");
    const venueId = await makeVenue(adminToken, [{ rowLabel: "A", category: "STANDARD", seatCount: 2 }]);
    const eventId = await makeEvent(orgToken, `Summary Event ${Date.now()}`);
    const showRes = await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "STANDARD", price: 15 }] });
    const showId = showRes.body.show.id;

    const before = await request(app).get("/api/organiser/events").set("Authorization", `Bearer ${orgToken}`);
    const beforeSummary = before.body.events.find((e: { id: string }) => e.id === eventId);
    expect(beforeSummary.showCount).toBe(1);
    expect(beforeSummary.ticketsSold).toBe(0);
    expect(beforeSummary.totalRevenue).toBe(0);

    const seatsRes = await request(app).get(`/api/shows/${showId}/seats`);
    const seatId = seatsRes.body.seats[0].seatId;
    const custToken = await makeUserToken("customer", "summary-cust");
    const holdRes = await request(app)
      .post(`/api/shows/${showId}/seats/${seatId}/hold`)
      .set("Authorization", `Bearer ${custToken}`);
    await request(app)
      .post(`/api/holds/${holdRes.body.holdId}/confirm`)
      .set("Authorization", `Bearer ${custToken}`);

    const after = await request(app).get("/api/organiser/events").set("Authorization", `Bearer ${orgToken}`);
    const afterSummary = after.body.events.find((e: { id: string }) => e.id === eventId);
    expect(afterSummary.ticketsSold).toBe(1);
    expect(afterSummary.totalRevenue).toBe(15);
  });

  it("does not leak another organiser's events", async () => {
    const orgAToken = await makeUserToken("organiser", "leak-a");
    const orgBToken = await makeUserToken("organiser", "leak-b");
    const eventId = await makeEvent(orgAToken, `Private Event ${Date.now()}`);

    const res = await request(app).get("/api/organiser/events").set("Authorization", `Bearer ${orgBToken}`);
    expect(res.body.events.some((e: { id: string }) => e.id === eventId)).toBe(false);
  });
});

describe("DELETE /api/organiser/events/:eventId", () => {
  it("deletes an event with no confirmed bookings, shows included", async () => {
    const adminToken = await makeUserToken("admin", "del-admin");
    const orgToken = await makeUserToken("organiser", "del-org");
    const venueId = await makeVenue(adminToken, [{ rowLabel: "A", category: "STANDARD", seatCount: 2 }]);
    const eventId = await makeEvent(orgToken, `Deletable Event ${Date.now()}`);
    await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "STANDARD", price: 10 }] });

    const res = await request(app).delete(`/api/organiser/events/${eventId}`).set("Authorization", `Bearer ${orgToken}`);
    expect(res.status).toBe(204);

    const listRes = await request(app).get("/api/organiser/events").set("Authorization", `Bearer ${orgToken}`);
    expect(listRes.body.events.some((e: { id: string }) => e.id === eventId)).toBe(false);
  });

  it("refuses to delete an event that has a confirmed booking", async () => {
    const adminToken = await makeUserToken("admin", "del-admin-2");
    const orgToken = await makeUserToken("organiser", "del-org-2");
    const venueId = await makeVenue(adminToken, [{ rowLabel: "A", category: "STANDARD", seatCount: 1 }]);
    const eventId = await makeEvent(orgToken, `Protected Event ${Date.now()}`);
    const showRes = await request(app)
      .post(`/api/organiser/events/${eventId}/shows`)
      .set("Authorization", `Bearer ${orgToken}`)
      .send({ venueId, dateTime: new Date(Date.now() + 86400000).toISOString(), pricing: [{ category: "STANDARD", price: 10 }] });
    const showId = showRes.body.show.id;

    const seatsRes = await request(app).get(`/api/shows/${showId}/seats`);
    const seatId = seatsRes.body.seats[0].seatId;
    const custToken = await makeUserToken("customer", "del-cust");
    const holdRes = await request(app)
      .post(`/api/shows/${showId}/seats/${seatId}/hold`)
      .set("Authorization", `Bearer ${custToken}`);
    await request(app).post(`/api/holds/${holdRes.body.holdId}/confirm`).set("Authorization", `Bearer ${custToken}`);

    const res = await request(app).delete(`/api/organiser/events/${eventId}`).set("Authorization", `Bearer ${orgToken}`);
    expect(res.status).toBe(409);

    const listRes = await request(app).get("/api/organiser/events").set("Authorization", `Bearer ${orgToken}`);
    expect(listRes.body.events.some((e: { id: string }) => e.id === eventId)).toBe(true);
  });

  it("rejects deleting another organiser's event", async () => {
    const ownerToken = await makeUserToken("organiser", "del-owner");
    const otherToken = await makeUserToken("organiser", "del-other");
    const eventId = await makeEvent(ownerToken, `Not Yours ${Date.now()}`);

    const res = await request(app).delete(`/api/organiser/events/${eventId}`).set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});
