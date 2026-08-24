import { describe, it, expect, afterAll } from "vitest";
import { futureShowDate } from "../testFixtures";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { sendBookingConfirmationEmail, sendWaitlistOfferEmail } from "./notifications";

// .env.test forces SMTP_USER/SMTP_APP_PASSWORD blank, so these exercise the stub-fallback path
// deterministically — same contract Phase 5 established: never throw, regardless of whether a
// real transporter is configured.

describe("sendBookingConfirmationEmail", () => {
  it("does not throw when SMTP is unconfigured (falls back to logging)", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const admin = await prisma.user.create({
      data: { email: `notif-admin-${suffix}@example.com`, passwordHash, name: "A", role: "admin" },
    });
    const organiser = await prisma.user.create({
      data: { email: `notif-org-${suffix}@example.com`, passwordHash, name: "O", role: "organiser" },
    });
    const customer = await prisma.user.create({
      data: { email: `notif-cust-${suffix}@example.com`, passwordHash, name: "C", role: "customer" },
    });
    const venue = await prisma.venue.create({ data: { name: "N", address: "N/A", createdByAdminId: admin.id } });
    const event = await prisma.event.create({ data: { title: "N", type: "movie", organiserId: organiser.id, description: "t" } });
    const show = await prisma.show.create({ data: { eventId: event.id, venueId: venue.id, dateTime: futureShowDate(), status: "scheduled" } });
    const seat = await prisma.seat.create({ data: { venueId: venue.id, rowLabel: "N", seatNumber: 1, category: "STANDARD" } });
    const showSeat = await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "booked" } });
    const booking = await prisma.booking.create({
      data: { customerId: customer.id, showId: show.id, bookingReference: `BK-TEST${suffix}`, status: "confirmed", totalPrice: 10 },
    });
    await prisma.bookingSeat.create({ data: { bookingId: booking.id, showSeatId: showSeat.id } });

    await expect(sendBookingConfirmationEmail(booking.id)).resolves.toBeUndefined();
  });

  it("does not throw for a booking id that doesn't exist", async () => {
    await expect(sendBookingConfirmationEmail("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
  });
});

describe("sendWaitlistOfferEmail", () => {
  it("does not throw when SMTP is unconfigured", async () => {
    await expect(
      sendWaitlistOfferEmail({
        to: "someone@example.com",
        customerName: "Someone",
        eventTitle: "Test Event",
        seatLabel: "A1",
        offerExpiresAt: new Date(Date.now() + 60_000),
        token: "abc123",
      })
    ).resolves.toBeUndefined();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
