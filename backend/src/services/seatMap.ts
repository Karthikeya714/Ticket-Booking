import { prisma } from "../prisma";
import { notFound } from "../errors";

export interface SeatMapEntry {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: string;
  status: "available" | "held" | "booked";
  price: number;
}

export async function getShowSeatMap(showId: string): Promise<SeatMapEntry[]> {
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show) throw notFound("Show not found");

  const [showSeats, pricing] = await Promise.all([
    prisma.showSeat.findMany({
      where: { showId },
      include: { seat: true },
      orderBy: [{ seat: { rowLabel: "asc" } }, { seat: { seatNumber: "asc" } }],
    }),
    prisma.showSeatPricing.findMany({ where: { showId } }),
  ]);

  const priceByCategory = new Map(pricing.map((p) => [p.category, Number(p.price)]));

  const now = Date.now();
  return Promise.all(
    showSeats.map(async (showSeat) => {
      // Read-only view, so this doesn't perform the lazy-expiry write — just reports what the
      // status *should* read as, so a viewer doesn't see a stale "held" for a seat whose hold
      // has lapsed but hasn't been swept yet. The actual free happens on the next
      // hold/confirm/cron touch, same as everywhere else in the codebase.
      let status = showSeat.status;
      if (status === "held" && showSeat.currentHoldId) {
        const hold = await prisma.hold.findUnique({ where: { id: showSeat.currentHoldId } });
        if (hold && hold.status === "active" && hold.expiresAt.getTime() < now) {
          status = "available";
        }
      }

      return {
        seatId: showSeat.seat.id,
        rowLabel: showSeat.seat.rowLabel,
        seatNumber: showSeat.seat.seatNumber,
        category: showSeat.seat.category,
        status,
        price: priceByCategory.get(showSeat.seat.category) ?? 0,
      };
    })
  );
}
