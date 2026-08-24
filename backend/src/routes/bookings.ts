import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { cancelBooking, listBookings } from "../services/booking";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth, requireRole("customer"));

bookingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const bookings = await listBookings(req.user!.sub);
    res.json({ bookings });
  })
);

bookingsRouter.post(
  "/:bookingId/cancel",
  asyncHandler(async (req, res) => {
    const result = await cancelBooking(req.user!.sub, req.params.bookingId);
    res.json(result);
  })
);
