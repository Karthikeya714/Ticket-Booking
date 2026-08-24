import { prisma } from "../prisma";
import { notFound, forbidden, badRequest, conflict } from "../errors";
import type { EventType } from "@prisma/client";

export async function createEvent(organiserId: string, title: string, type: EventType, description: string) {
  return prisma.event.create({ data: { title, type, organiserId, description } });
}

export interface PricingInput {
  category: string;
  price: number;
}

// Creating a show is also what makes it bookable: it snapshots every one of the venue's seats
// into show_seats (all available) and locks in per-category pricing for this specific showing —
// the same shape catalog.ts/booking.ts already expect, so a newly created show needs no special
// casing anywhere else in the app to appear on the public events list and be bookable.
export async function createShow(organiserId: string, eventId: string, venueId: string, dateTime: Date, pricing: PricingInput[]) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");
  if (event.organiserId !== organiserId) throw forbidden("You don't own this event");

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, include: { seats: true } });
  if (!venue) throw notFound("Venue not found");
  if (venue.seats.length === 0) throw badRequest("This venue has no seats configured yet");

  const venueCategories = new Set(venue.seats.map((s) => s.category));
  const pricedCategories = new Set(pricing.map((p) => p.category));
  for (const category of venueCategories) {
    if (!pricedCategories.has(category)) throw badRequest(`Missing price for category: ${category}`);
  }

  const show = await prisma.show.create({ data: { eventId, venueId, dateTime, status: "scheduled" } });

  await prisma.showSeatPricing.createMany({
    data: pricing.map((p) => ({ showId: show.id, category: p.category, price: p.price })),
  });
  await prisma.showSeat.createMany({
    data: venue.seats.map((s) => ({ showId: show.id, seatId: s.id, status: "available" as const })),
  });

  return show;
}

export async function listOrganiserEvents(organiserId: string) {
  const events = await prisma.event.findMany({
    where: { organiserId },
    include: {
      shows: {
        include: {
          showSeats: { where: { status: "booked" }, select: { id: true } },
          bookings: { where: { status: "confirmed" }, select: { totalPrice: true } },
        },
      },
    },
    orderBy: { title: "asc" },
  });

  return events.map((event) => {
    const ticketsSold = event.shows.reduce((sum, s) => sum + s.showSeats.length, 0);
    const totalRevenue = event.shows.reduce(
      (sum, s) => sum + s.bookings.reduce((s2, b) => s2 + Number(b.totalPrice), 0),
      0
    );
    return {
      id: event.id,
      title: event.title,
      type: event.type,
      description: event.description,
      showCount: event.shows.length,
      ticketsSold,
      totalRevenue,
    };
  });
}

// Deletes the event and everything under it (shows, pricing, show_seats, holds, waitlist
// entries/offers, and any bookings) — but only when no show has a *confirmed* booking. A
// cancelled booking's rows still exist for history, so they're deleted along with everything
// else; a confirmed one means a real customer holds a ticket, which this must never silently
// destroy. There's no partial/soft delete here — the organiser has to deal with those bookings
// (e.g. let the show pass, or cancel it another way) before the event can go away.
export async function deleteEvent(organiserId: string, eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { shows: { include: { bookings: { select: { status: true } } } } },
  });
  if (!event) throw notFound("Event not found");
  if (event.organiserId !== organiserId) throw forbidden("You don't own this event");

  const hasConfirmedBookings = event.shows.some((s) => s.bookings.some((b) => b.status === "confirmed"));
  if (hasConfirmedBookings) {
    throw conflict("This event has confirmed bookings and can't be deleted.");
  }

  const showIds = event.shows.map((s) => s.id);

  await prisma.$transaction([
    prisma.waitlistOffer.deleteMany({ where: { waitlistEntry: { showId: { in: showIds } } } }),
    prisma.waitlistEntry.deleteMany({ where: { showId: { in: showIds } } }),
    prisma.hold.deleteMany({ where: { showSeat: { showId: { in: showIds } } } }),
    prisma.bookingSeat.deleteMany({ where: { showSeat: { showId: { in: showIds } } } }),
    prisma.booking.deleteMany({ where: { showId: { in: showIds } } }),
    prisma.showSeat.deleteMany({ where: { showId: { in: showIds } } }),
    prisma.showSeatPricing.deleteMany({ where: { showId: { in: showIds } } }),
    prisma.show.deleteMany({ where: { id: { in: showIds } } }),
    prisma.event.delete({ where: { id: eventId } }),
  ]);
}

export async function getOrganiserEventDetail(organiserId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      shows: {
        include: {
          venue: true,
          showSeats: { where: { status: "booked" }, select: { id: true } },
          bookings: { where: { status: "confirmed" }, select: { totalPrice: true } },
        },
        orderBy: { dateTime: "asc" },
      },
    },
  });
  if (!event) throw notFound("Event not found");
  if (event.organiserId !== organiserId) throw forbidden("You don't own this event");

  return {
    id: event.id,
    title: event.title,
    type: event.type,
    description: event.description,
    shows: event.shows.map((s) => ({
      id: s.id,
      dateTime: s.dateTime,
      venue: { id: s.venue.id, name: s.venue.name, address: s.venue.address },
      ticketsSold: s.showSeats.length,
      bookingsCount: s.bookings.length,
      revenue: s.bookings.reduce((sum, b) => sum + Number(b.totalPrice), 0),
    })),
  };
}
