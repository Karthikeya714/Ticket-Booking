import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { badRequest } from "../errors";
import { createEvent, createShow, listOrganiserEvents, getOrganiserEventDetail, deleteEvent } from "../services/organiser";

export const organiserRouter = Router();
organiserRouter.use(requireAuth, requireRole("organiser"));

const createEventSchema = z.object({
  title: z.string().trim().min(1),
  type: z.enum(["movie", "concert"]),
  description: z.string().trim().min(1),
});

organiserRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const event = await createEvent(req.user!.sub, parsed.data.title, parsed.data.type, parsed.data.description);
    res.status(201).json({ event });
  })
);

organiserRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    res.json({ events: await listOrganiserEvents(req.user!.sub) });
  })
);

organiserRouter.get(
  "/events/:eventId",
  asyncHandler(async (req, res) => {
    res.json(await getOrganiserEventDetail(req.user!.sub, req.params.eventId));
  })
);

organiserRouter.delete(
  "/events/:eventId",
  asyncHandler(async (req, res) => {
    await deleteEvent(req.user!.sub, req.params.eventId);
    res.status(204).send();
  })
);

const createShowSchema = z.object({
  venueId: z.string().min(1),
  dateTime: z.coerce.date(),
  pricing: z.array(z.object({ category: z.string().trim().min(1), price: z.coerce.number().positive() })).min(1),
});

organiserRouter.post(
  "/events/:eventId/shows",
  asyncHandler(async (req, res) => {
    const parsed = createShowSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const show = await createShow(
      req.user!.sub,
      req.params.eventId,
      parsed.data.venueId,
      parsed.data.dateTime,
      parsed.data.pricing
    );
    res.status(201).json({ show });
  })
);
