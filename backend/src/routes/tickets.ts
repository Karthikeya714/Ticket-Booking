import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { generateBookingQrPng } from "../services/qr";

// Deliberately unauthenticated: this is loaded as a plain <img src> by email clients (Gmail's
// image proxy, etc.), which never send an Authorization header. That's safe here because the QR
// only ever encodes the booking reference itself (see services/qr.ts) — the same value already
// printed in plain text right next to it in the email and on the confirmation page.
export const ticketsRouter = Router();

const REFERENCE_PATTERN = /^BK-[0-9A-F]{12}$/;

ticketsRouter.get(
  "/:bookingReference/qr.png",
  asyncHandler(async (req, res) => {
    const { bookingReference } = req.params;
    if (!REFERENCE_PATTERN.test(bookingReference)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const png = await generateBookingQrPng(bookingReference);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  })
);
