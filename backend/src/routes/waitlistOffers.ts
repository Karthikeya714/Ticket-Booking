import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { acceptOffer, getOfferByToken } from "../services/waitlist";

export const waitlistOffersRouter = Router();
waitlistOffersRouter.use(requireAuth, requireRole("customer"));

// The emailed offer link carries the token, so the frontend resolves it to offer details here
// before showing the accept screen.
waitlistOffersRouter.get(
  "/by-token/:token",
  asyncHandler(async (req, res) => {
    const offer = await getOfferByToken(req.user!.sub, req.params.token);
    res.json(offer);
  })
);

waitlistOffersRouter.post(
  "/:offerId/accept",
  asyncHandler(async (req, res) => {
    const result = await acceptOffer(req.user!.sub, req.params.offerId);
    res.status(201).json(result);
  })
);
