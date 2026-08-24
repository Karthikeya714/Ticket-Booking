import { AppError, badRequest, conflict, forbidden, notFound } from "../errors";

// Transactions return one of these instead of throwing. Prisma rolls back the *entire*
// transaction when its callback throws, which would silently undo any lazy-expiry writes the
// transaction legitimately made before deciding the overall operation should fail. Returning a
// result lets those side effects commit, and the caller throws afterward at the JS level.
export type OutcomeCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SEAT_UNAVAILABLE"
  | "HOLD_EXPIRED"
  | "OFFER_EXPIRED"
  | "SEATS_AVAILABLE"
  | "ALREADY_WAITING"
  | "BOOKING_NOT_CONFIRMED"
  | "SHOW_NOT_BOOKABLE";

export type Outcome<T> = { ok: true; value: T } | { ok: false; code: OutcomeCode; message?: string };

export function raise(code: OutcomeCode, message?: string): never {
  switch (code) {
    case "NOT_FOUND":
      throw notFound(message ?? "Not found");
    case "FORBIDDEN":
      throw forbidden(message ?? "You don't have access to this resource");
    case "SEAT_UNAVAILABLE":
      throw conflict("SEAT_UNAVAILABLE");
    case "HOLD_EXPIRED":
      throw conflict("HOLD_EXPIRED");
    case "OFFER_EXPIRED":
      throw conflict("OFFER_EXPIRED");
    case "SEATS_AVAILABLE":
      throw badRequest(message ?? "Seats are still available in this category; book directly instead");
    case "ALREADY_WAITING":
      throw conflict(message ?? "You are already on the waitlist for this category");
    case "BOOKING_NOT_CONFIRMED":
      throw conflict(message ?? "This booking is not confirmed");
    case "SHOW_NOT_BOOKABLE":
      throw conflict(message ?? "This show has already started or been cancelled");
    default: {
      const exhaustive: never = code;
      throw new AppError(500, `Unhandled outcome: ${exhaustive}`);
    }
  }
}
