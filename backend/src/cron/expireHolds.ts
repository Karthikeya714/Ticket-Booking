import { prisma } from "../prisma";
import { broadcastSeatStatusChanged } from "../realtime";

interface ShowSeatRow {
  id: string;
  show_id: string;
  seat_id: string;
  status: "available" | "held" | "booked";
  current_hold_id: string | null;
}

// Proactively frees seats whose holds expired without anyone coming back to touch them. The
// lazy checks in services/booking.ts only fire when a request happens to hit that specific
// seat/hold again — this sweep is what catches pure abandonment (customer just closes the tab).
// Each candidate is re-checked and freed inside its own short transaction with a row lock, so
// this can safely run concurrently with in-flight hold/confirm/release requests touching other
// seats, and can't double-free a seat that a request already resolved in the meantime.
export async function sweepExpiredHolds(): Promise<number> {
  const candidates = await prisma.hold.findMany({
    where: { status: "active", expiresAt: { lt: new Date() } },
    select: { id: true, showSeatId: true },
  });

  let freed = 0;
  for (const candidate of candidates) {
    const freedSeat = await prisma.$transaction(async (tx): Promise<{ showId: string; seatId: string } | null> => {
      const hold = await tx.hold.findUnique({ where: { id: candidate.id } });
      if (!hold || hold.status !== "active" || hold.expiresAt.getTime() >= Date.now()) return null;

      const rows = await tx.$queryRaw<ShowSeatRow[]>`
        SELECT id, show_id, seat_id, status, current_hold_id FROM show_seats WHERE id = ${candidate.showSeatId} FOR UPDATE
      `;
      const showSeat = rows[0];

      await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
      if (showSeat && showSeat.current_hold_id === hold.id) {
        await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "available", currentHoldId: null } });
        return { showId: showSeat.show_id, seatId: showSeat.seat_id };
      }
      return null;
    });

    if (freedSeat) {
      freed++;
      broadcastSeatStatusChanged(freedSeat.showId, freedSeat.seatId, "available");
    }
  }

  return freed;
}
