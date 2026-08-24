import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Wipe transactional/venue data so this script is safe to re-run; users are upserted below.
  await prisma.waitlistOffer.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.bookingSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.showSeatPricing.deleteMany();
  await prisma.show.deleteMany();
  await prisma.event.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.venue.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      role: "admin",
      name: "Ada Admin",
    },
  });

  const organiser = await prisma.user.upsert({
    where: { email: "organiser@example.com" },
    update: {},
    create: {
      email: "organiser@example.com",
      passwordHash,
      role: "organiser",
      name: "Oscar Organiser",
    },
  });

  await prisma.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      email: "customer@example.com",
      passwordHash,
      role: "customer",
      name: "Cara Customer",
    },
  });

  await prisma.user.upsert({
    where: { email: "customer2@example.com" },
    update: {},
    create: {
      email: "customer2@example.com",
      passwordHash,
      role: "customer",
      name: "Chris Customer",
    },
  });

  const venue = await prisma.venue.create({
    data: {
      name: "Grand Cinema Hall",
      address: "123 Main Street, Springfield",
      createdByAdminId: admin.id,
    },
  });

  // 2 categories, sized like a real small cinema hall: PREMIUM (rows A-C, 12 seats each = 36)
  // and STANDARD (rows D-I, 14 seats each = 84) — 120 seats total.
  const seatRows: { row: string; category: string; seatCount: number }[] = [
    { row: "A", category: "PREMIUM", seatCount: 12 },
    { row: "B", category: "PREMIUM", seatCount: 12 },
    { row: "C", category: "PREMIUM", seatCount: 12 },
    { row: "D", category: "STANDARD", seatCount: 14 },
    { row: "E", category: "STANDARD", seatCount: 14 },
    { row: "F", category: "STANDARD", seatCount: 14 },
    { row: "G", category: "STANDARD", seatCount: 14 },
    { row: "H", category: "STANDARD", seatCount: 14 },
    { row: "I", category: "STANDARD", seatCount: 14 },
  ];

  const seats = [];
  for (const { row, category, seatCount } of seatRows) {
    for (let n = 1; n <= seatCount; n++) {
      seats.push({ venueId: venue.id, rowLabel: row, seatNumber: n, category });
    }
  }
  await prisma.seat.createMany({ data: seats });
  const allSeats = await prisma.seat.findMany({ where: { venueId: venue.id } });

  const event = await prisma.event.create({
    data: {
      title: "The Great Movie Premiere",
      type: "movie",
      organiserId: organiser.id,
      description: "An exclusive premiere screening.",
    },
  });

  const show = await prisma.show.create({
    data: {
      eventId: event.id,
      venueId: venue.id,
      dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "scheduled",
    },
  });

  await prisma.showSeatPricing.createMany({
    data: [
      { showId: show.id, category: "PREMIUM", price: 25.0 },
      { showId: show.id, category: "STANDARD", price: 15.0 },
    ],
  });

  await prisma.showSeat.createMany({
    data: allSeats.map((seat) => ({
      showId: show.id,
      seatId: seat.id,
      status: "available" as const,
    })),
  });

  console.log("Seed complete:");
  console.log(`  admin:     admin@example.com / password123`);
  console.log(`  organiser: organiser@example.com / password123`);
  console.log(`  customer:  customer@example.com / password123`);
  console.log(`  customer2: customer2@example.com / password123`);
  console.log(`  venue:     ${venue.id} (${venue.name})`);
  console.log(`  event:     ${event.id} (${event.title})`);
  console.log(`  show:      ${show.id} with ${allSeats.length} seats`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
