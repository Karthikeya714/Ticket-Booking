import crypto from "crypto";

// Customer-facing booking identifier. Random rather than sequential so it can be shown in
// emails/QR codes without leaking how many bookings the platform has taken.
export function generateBookingReference(): string {
  return `BK-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}
