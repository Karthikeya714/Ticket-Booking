import { prisma } from "../prisma";
import { notFound } from "../errors";
import { upcomingShowWhere } from "./showGuard";
import type { EventType } from "@prisma/client";

export interface EventListFilters {
  type?: EventType;
  search?: string;
  // A calendar day (any time-of-day component is ignored) — matches events with a scheduled
  // show on that day. Computed in UTC to match how z.coerce.date() parses a "YYYY-MM-DD" query
  // string (UTC midnight), so a day boundary here means the same calendar day the user picked.
  date?: Date;
}

function dayRangeUTC(date: Date): { gte: Date; lt: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

export async function listEvents(filters: EventListFilters) {
  const showDateFilter = filters.date ? dayRangeUTC(filters.date) : undefined;
  const showWhere = upcomingShowWhere(showDateFilter);

  const events = await prisma.event.findMany({
    where: {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
      // Browsing is for finding something to book, so an event only appears once it actually has
      // an upcoming show — that hides both a just-created event with no shows yet and one whose
      // shows have all passed, instead of listing dead-end links a customer can't act on.
      shows: { some: showWhere },
    },
    include: {
      organiser: { select: { name: true } },
      shows: { where: showWhere, select: { id: true, dateTime: true } },
    },
    orderBy: { title: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    description: event.description,
    organiserName: event.organiser.name,
    upcomingShowCount: event.shows.length,
    nextShowAt: event.shows.map((s) => s.dateTime).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  }));
}

export async function getEventWithShows(eventId: string, dateFilter?: { from?: Date; to?: Date }) {
  // Only upcoming shows are listed — a past showtime isn't something a customer can act on, and
  // holding a seat on one is rejected by checkShowBookable anyway. A caller-supplied `from` can
  // narrow that window but never widen it back into the past, hence the max() rather than a
  // spread that would overwrite the guard.
  const now = new Date();
  const from = dateFilter?.from && dateFilter.from > now ? dateFilter.from : now;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organiser: { select: { name: true } },
      shows: {
        where: {
          status: "scheduled",
          dateTime: { gte: from, ...(dateFilter?.to ? { lte: dateFilter.to } : {}) },
        },
        include: { venue: true, pricing: true },
        orderBy: { dateTime: "asc" },
      },
    },
  });
  if (!event) throw notFound("Event not found");

  return {
    id: event.id,
    title: event.title,
    type: event.type,
    description: event.description,
    organiserName: event.organiser.name,
    shows: event.shows.map((show) => ({
      id: show.id,
      dateTime: show.dateTime,
      venue: { name: show.venue.name, address: show.venue.address },
      pricing: show.pricing.map((p) => ({ category: p.category, price: Number(p.price) })),
    })),
  };
}

export async function getShowDetail(showId: string) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { event: true, venue: true, pricing: true },
  });
  if (!show) throw notFound("Show not found");

  return {
    id: show.id,
    dateTime: show.dateTime,
    status: show.status,
    event: { id: show.event.id, title: show.event.title, type: show.event.type },
    venue: { name: show.venue.name, address: show.venue.address },
    pricing: show.pricing.map((p) => ({ category: p.category, price: Number(p.price) })),
  };
}
