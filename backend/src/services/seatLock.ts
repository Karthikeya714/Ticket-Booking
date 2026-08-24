import type { Prisma } from "@prisma/client";

export interface ShowSeatRow {
  id: string;
  show_id: string;
  seat_id: string;
  status: "available" | "held" | "booked";
  current_hold_id: string | null;
}

// SELECT ... FOR UPDATE row-locks the show_seats row inside the transaction, so a second
// concurrent transaction touching the same seat blocks until the first commits or rolls back,
// then re-reads the now-current status. That's what makes every seat mutation in this codebase
// safe under concurrent requests, without needing application-level locks.
export async function lockShowSeatByShowAndSeat(tx: Prisma.TransactionClient, showId: string, seatId: string) {
  const rows = await tx.$queryRaw<ShowSeatRow[]>`
    SELECT id, show_id, seat_id, status, current_hold_id
    FROM show_seats
    WHERE show_id = ${showId} AND seat_id = ${seatId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function lockShowSeatById(tx: Prisma.TransactionClient, showSeatId: string) {
  const rows = await tx.$queryRaw<ShowSeatRow[]>`
    SELECT id, show_id, seat_id, status, current_hold_id
    FROM show_seats
    WHERE id = ${showSeatId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

// If the seat is `held` by an expired *hold*, free it right here rather than waiting for the
// cron sweep. Must run after the row lock is acquired so the check and the release happen
// atomically with whatever the caller does next.
//
// A seat held for a waitlist *offer* has status='held' with current_hold_id=NULL, so it falls
// through this check untouched — deliberately. Those seats stay reserved for the queue until
// the offer sweep expires them and cascades to the next person, rather than being handed to
// whoever happens to click first, which would break FIFO fairness.
export async function expireIfNeeded(tx: Prisma.TransactionClient, showSeat: ShowSeatRow): Promise<ShowSeatRow> {
  if (showSeat.status !== "held" || !showSeat.current_hold_id) return showSeat;

  const hold = await tx.hold.findUnique({ where: { id: showSeat.current_hold_id } });
  if (!hold || hold.status !== "active" || hold.expiresAt.getTime() >= Date.now()) return showSeat;

  await tx.hold.update({ where: { id: hold.id }, data: { status: "expired" } });
  await tx.showSeat.update({ where: { id: showSeat.id }, data: { status: "available", currentHoldId: null } });

  return { ...showSeat, status: "available", current_hold_id: null };
}
