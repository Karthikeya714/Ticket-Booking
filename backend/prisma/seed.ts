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

  const DAY = 24 * 60 * 60 * 1000;

  async function makeVenue(name: string, address: string, rows: { row: string; category: string; seatCount: number }[]) {
    const venue = await prisma.venue.create({ data: { name, address, createdByAdminId: admin.id } });
    const seats = rows.flatMap(({ row, category, seatCount }) =>
      Array.from({ length: seatCount }, (_, i) => ({ venueId: venue.id, rowLabel: row, seatNumber: i + 1, category }))
    );
    await prisma.seat.createMany({ data: seats });
    return { venue, seats: await prisma.seat.findMany({ where: { venueId: venue.id } }) };
  }

  // Snapshots the venue's seats into the show and locks in per-category pricing — exactly what
  // the organiser dashboard's "add show" flow does, so seeded and UI-created shows are identical.
  async function makeShow(eventId: string, v: Awaited<ReturnType<typeof makeVenue>>, daysOut: number, hour: number, pricing: Record<string, number>) {
    const dateTime = new Date(Date.now() + daysOut * DAY);
    dateTime.setHours(hour, 0, 0, 0);
    const show = await prisma.show.create({ data: { eventId, venueId: v.venue.id, dateTime, status: "scheduled" } });
    await prisma.showSeatPricing.createMany({
      data: Object.entries(pricing).map(([category, price]) => ({ showId: show.id, category, price })),
    });
    await prisma.showSeat.createMany({
      data: v.seats.map((seat) => ({ showId: show.id, seatId: seat.id, status: "available" as const })),
    });
    return show;
  }

  // A 120-seat cinema. Rows render nearest-screen-first (A closest, per the SCREEN arc above the
  // seat map), so — matching real cinemas, where the front rows are the less desirable ones —
  // STANDARD (cheaper) is up front and PREMIUM (pricier) is further back: STANDARD rows A-C,
  // PREMIUM rows D-I.
  const cinema = await makeVenue("Grand Cinema Hall", "123 Main Street, Springfield", [
    { row: "A", category: "STANDARD", seatCount: 12 },
    { row: "B", category: "STANDARD", seatCount: 12 },
    { row: "C", category: "STANDARD", seatCount: 12 },
    { row: "D", category: "PREMIUM", seatCount: 14 },
    { row: "E", category: "PREMIUM", seatCount: 14 },
    { row: "F", category: "PREMIUM", seatCount: 14 },
    { row: "G", category: "PREMIUM", seatCount: 14 },
    { row: "H", category: "PREMIUM", seatCount: 14 },
    { row: "I", category: "PREMIUM", seatCount: 14 },
  ]);

  // A 110-seat concert arena — gives the seat map a STAGE (not SCREEN) to render against.
  const arena = await makeVenue("Riverside Arena", "9 Riverside Walk, Springfield", [
    { row: "A", category: "VIP", seatCount: 10 },
    { row: "B", category: "VIP", seatCount: 10 },
    { row: "C", category: "GENERAL", seatCount: 18 },
    { row: "D", category: "GENERAL", seatCount: 18 },
    { row: "E", category: "GENERAL", seatCount: 18 },
    { row: "F", category: "GENERAL", seatCount: 18 },
    { row: "G", category: "GENERAL", seatCount: 18 },
  ]);

  const premiere = await prisma.event.create({
    data: {
      title: "The Great Movie Premiere",
      type: "movie",
      organiserId: organiser.id,
      description: "An exclusive premiere screening, with the director in attendance.",
    },
  });
  const indieFest = await prisma.event.create({
    data: {
      title: "Indie Film Festival",
      type: "movie",
      organiserId: organiser.id,
      description: "Three days of independent cinema from around the world.",
    },
  });
  const rockNight = await prisma.event.create({
    data: {
      title: "Riverside Rock Night",
      type: "concert",
      organiserId: organiser.id,
      description: "An open-air night of live rock from four headline acts.",
    },
  });

  // Several shows across different days so the date filter has something to filter.
  const cinemaPricing = { PREMIUM: 25.0, STANDARD: 15.0 };
  const arenaPricing = { VIP: 80.0, GENERAL: 45.0 };
  const shows = [
    await makeShow(premiere.id, cinema, 3, 19, cinemaPricing),
    await makeShow(premiere.id, cinema, 5, 21, cinemaPricing),
    await makeShow(indieFest.id, cinema, 7, 18, cinemaPricing),
    await makeShow(indieFest.id, cinema, 8, 18, cinemaPricing),
    await makeShow(rockNight.id, arena, 10, 20, arenaPricing),
    await makeShow(rockNight.id, arena, 14, 20, arenaPricing),
  ];

  console.log("Seed complete:");
  console.log(`  admin:     admin@example.com / password123`);
  console.log(`  organiser: organiser@example.com / password123`);
  console.log(`  customer:  customer@example.com / password123`);
  console.log(`  customer2: customer2@example.com / password123`);
  console.log(`  venues:    ${cinema.venue.name} (${cinema.seats.length} seats), ${arena.venue.name} (${arena.seats.length} seats)`);
  console.log(`  events:    3 (2 movies, 1 concert)`);
  console.log(`  shows:     ${shows.length}, all upcoming`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
