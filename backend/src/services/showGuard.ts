import type { Prisma } from "@prisma/client";
import type { Outcome } from "./outcome";

// A show stops accepting new holds and waitlist joins once it's cancelled or its start time has
// passed. Without this, a seat map for last week's show stays fully interactive: customers could
// hold and pay for seats at an event that already ended, and cancelling such a booking would
// cascade waitlist *offer emails* for a show nobody can attend.
//
// Returns the failing Outcome when the show isn't bookable, or null when it is — so callers can
// `if (notBookable) return notBookable;` inside a transaction without throwing (see outcome.ts
// for why transactions return rather than throw).
export async function checkShowBookable(
  tx: Prisma.TransactionClient,
  showId: string
): Promise<{ ok: false; code: "NOT_FOUND" | "SHOW_NOT_BOOKABLE"; message?: string } | null> {
  const show = await tx.show.findUnique({ where: { id: showId }, select: { status: true, dateTime: true } });
  if (!show) return { ok: false, code: "NOT_FOUND", message: "Show not found" };

  if (show.status === "cancelled") {
    return { ok: false, code: "SHOW_NOT_BOOKABLE", message: "This show has been cancelled" };
  }
  if (show.dateTime.getTime() <= Date.now()) {
    return { ok: false, code: "SHOW_NOT_BOOKABLE", message: "This show has already started" };
  }
  return null;
}

// Same rule expressed as a Prisma `where` fragment, for the public catalog queries: only
// scheduled shows that haven't started yet are advertised as bookable.
export function upcomingShowWhere(dayRange?: { gte: Date; lt: Date }) {
  const now = new Date();
  if (!dayRange) return { status: "scheduled" as const, dateTime: { gte: now } };
  // Narrowing to a specific day still never surfaces a show that's already begun — for *today*
  // that means "from now", not "from midnight".
  return {
    status: "scheduled" as const,
    dateTime: { gte: dayRange.gte > now ? dayRange.gte : now, lt: dayRange.lt },
  };
}

export type { Outcome };
