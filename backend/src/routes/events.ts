import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../asyncHandler";
import { badRequest } from "../errors";
import { getEventWithShows, listEvents } from "../services/catalog";

export const eventsRouter = Router();

const listQuerySchema = z.object({
  type: z.enum(["movie", "concert"]).optional(),
  search: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
});

// Public: browsing doesn't require an account.
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
    const events = await listEvents(parsed.data);
    res.json({ events });
  })
);

const eventDetailQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

eventsRouter.get(
  "/:eventId",
  asyncHandler(async (req, res) => {
    const parsed = eventDetailQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
    const event = await getEventWithShows(req.params.eventId, parsed.data);
    res.json(event);
  })
);
