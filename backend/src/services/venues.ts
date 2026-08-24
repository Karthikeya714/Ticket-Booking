import { prisma } from "../prisma";
import { notFound, badRequest } from "../errors";

export interface SeatRowInput {
  rowLabel: string;
  category: string;
  seatCount: number;
}

function buildSeatRecords(venueId: string, seatRows: SeatRowInput[]) {
  return seatRows.flatMap((row) =>
    Array.from({ length: row.seatCount }, (_, i) => ({
      venueId,
      rowLabel: row.rowLabel.trim().toUpperCase(),
      seatNumber: i + 1,
      category: row.category.trim().toUpperCase(),
    }))
  );
}

export async function createVenue(adminId: string, name: string, address: string, seatRows: SeatRowInput[]) {
  const venue = await prisma.venue.create({ data: { name, address, createdByAdminId: adminId } });
  const seats = buildSeatRecords(venue.id, seatRows);
  await prisma.seat.createMany({ data: seats });

  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    seatCount: seats.length,
    categories: [...new Set(seats.map((s) => s.category))],
  };
}

// Adds more rows to a venue that already exists. Only accepts row labels the venue doesn't
// already have — a seat's (venueId, rowLabel, seatNumber) is immutable once shows have been
// scheduled against it (their show_seats reference specific seat rows), so "editing" row A would
// mean deciding what happens to every show that already snapshotted it. Adding a brand-new row
// B has no such conflict.
export async function addSeatRows(venueId: string, seatRows: SeatRowInput[]) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, include: { seats: { select: { rowLabel: true, category: true } } } });
  if (!venue) throw notFound("Venue not found");

  const existingLabels = new Set(venue.seats.map((s) => s.rowLabel));
  for (const row of seatRows) {
    if (existingLabels.has(row.rowLabel.trim().toUpperCase())) {
      throw badRequest(`Row ${row.rowLabel.trim().toUpperCase()} already exists on this venue`);
    }
  }

  const seats = buildSeatRecords(venueId, seatRows);
  await prisma.seat.createMany({ data: seats });

  const allCategories = new Set([...venue.seats.map((s) => s.category), ...seats.map((s) => s.category)]);
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    seatCount: venue.seats.length + seats.length,
    categories: [...allCategories],
  };
}

export async function listVenues() {
  const venues = await prisma.venue.findMany({
    include: { seats: { select: { category: true } } },
    orderBy: { name: "asc" },
  });
  return venues.map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    seatCount: v.seats.length,
    categories: [...new Set(v.seats.map((s) => s.category))],
  }));
}
