import QRCode from "qrcode";

// Encodes only the booking_reference — never seat, customer, or price details — so the QR
// itself carries no sensitive data; whoever scans it still has to look the reference up
// server-side (e.g. at check-in) to see anything about the booking.
export async function generateBookingQrPng(bookingReference: string): Promise<Buffer> {
  return QRCode.toBuffer(bookingReference, { type: "png", width: 300, margin: 2 });
}
