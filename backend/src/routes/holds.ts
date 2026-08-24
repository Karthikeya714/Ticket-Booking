import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { badRequest } from "../errors";
import { confirmHold, confirmHolds, getHoldStatus, releaseHold } from "../services/booking";

export const holdsRouter = Router();
holdsRouter.use(requireAuth, requireRole("customer"));

holdsRouter.get(
  "/:holdId",
  asyncHandler(async (req, res) => {
    const status = await getHoldStatus(req.user!.sub, req.params.holdId);
    res.json(status);
  })
);

const confirmManySchema = z.object({ holdIds: z.array(z.string().min(1)).min(1) });

// Multi-seat checkout: confirms several holds into one booking. Placed before /:holdId/confirm
// isn't necessary (different path shapes — "confirm" here has no :holdId segment — so there's
// no route-matching ambiguity), but kept close to it since it's the batch counterpart.
holdsRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const parsed = confirmManySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const booking = await confirmHolds(req.user!.sub, parsed.data.holdIds);
    res.status(201).json({ booking });
  })
);

holdsRouter.post(
  "/:holdId/confirm",
  asyncHandler(async (req, res) => {
    const booking = await confirmHold(req.user!.sub, req.params.holdId);
    res.status(201).json({ booking });
  })
);

holdsRouter.post(
  "/:holdId/release",
  asyncHandler(async (req, res) => {
    const result = await releaseHold(req.user!.sub, req.params.holdId);
    res.json(result);
  })
);
