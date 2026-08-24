// One-seat show so the category can be sold out by a single booking, to trigger a real
// waitlist-offer email end-to-end.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" } });
  const organiser = await prisma.user.findFirstOrThrow({ where: { role: "organiser" } });

  const venue = await prisma.venue.create({
    data: { name: "Email Demo Hall", address: "1 Demo Road", createdByAdminId: admin.id },
  });
  const event = await prisma.event.create({
    data: { title: "Waitlist Email Demo", type: "concert", organiserId: organiser.id, description: "Live demo" },
  });
  const show = await prisma.show.create({
    data: { eventId: event.id, venueId: venue.id, dateTime: new Date(Date.now() + 86_400_000), status: "scheduled" },
  });
  await prisma.showSeatPricing.create({ data: { showId: show.id, category: "STANDARD", price: 20 } });

  const seat = await prisma.seat.create({
    data: { venueId: venue.id, rowLabel: "E", seatNumber: 1, category: "STANDARD" },
  });
  await prisma.showSeat.create({ data: { showId: show.id, seatId: seat.id, status: "available" } });

  console.log(JSON.stringify({ showId: show.id, seatId: seat.id }));
}

main().finally(() => prisma.$disconnect());
