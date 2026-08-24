import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { badRequest } from "../errors";
import { holdSeat } from "../services/booking";
import { joinWaitlist } from "../services/waitlist";
import { getShowSeatMap } from "../services/seatMap";
import { getShowDetail } from "../services/catalog";

export const showsRouter = Router();

// Public: show header info (venue, date, pricing) for the seat-map/checkout page.
showsRouter.get(
  "/:showId",
  asyncHandler(async (req, res) => {
    const show = await getShowDetail(req.params.showId);
    res.json(show);
  })
);

// Public: anyone browsing can see a show's seat map before logging in.
showsRouter.get(
  "/:showId/seats",
  asyncHandler(async (req, res) => {
    const seats = await getShowSeatMap(req.params.showId);
    res.json({ seats });
  })
);

showsRouter.post(
  "/:showId/seats/:seatId/hold",
  requireAuth,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const { showId, seatId } = req.params;
    const result = await holdSeat(showId, seatId, req.user!.sub);
    res.status(201).json(result);
  })
);

const waitlistSchema = z.object({ category: z.string().min(1) });

showsRouter.post(
  "/:showId/waitlist",
  requireAuth,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const parsed = waitlistSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");

    const result = await joinWaitlist(req.params.showId, parsed.data.category, req.user!.sub);
    res.status(201).json(result);
  })
);
