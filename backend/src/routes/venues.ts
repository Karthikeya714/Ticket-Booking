import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { badRequest } from "../errors";
import { createVenue, listVenues, addSeatRows } from "../services/venues";

export const venuesRouter = Router();
venuesRouter.use(requireAuth);

const seatRowSchema = z.object({
  rowLabel: z.string().trim().min(1).max(5),
  category: z.string().trim().min(1).max(30),
  seatCount: z.coerce.number().int().min(1).max(50),
});

const createVenueSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  seatRows: z.array(seatRowSchema).min(1),
});

const addSeatRowsSchema = z.object({
  seatRows: z.array(seatRowSchema).min(1),
});

function assertUniqueLabels(seatRows: { rowLabel: string }[]) {
  const labels = seatRows.map((r) => r.rowLabel.trim().toUpperCase());
  if (new Set(labels).size !== labels.length) throw badRequest("Row labels must be unique");
}

// Organiser needs read access too — it's how they pick a venue when creating a show.
venuesRouter.get(
  "/",
  requireRole("organiser", "admin"),
  asyncHandler(async (_req, res) => {
    res.json({ venues: await listVenues() });
  })
);

venuesRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    assertUniqueLabels(parsed.data.seatRows);

    const venue = await createVenue(req.user!.sub, parsed.data.name, parsed.data.address, parsed.data.seatRows);
    res.status(201).json({ venue });
  })
);

// Adds more rows to an existing venue — row labels must be new to that venue (see venues.ts).
venuesRouter.post(
  "/:venueId/seats",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = addSeatRowsSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    assertUniqueLabels(parsed.data.seatRows);

    const venue = await addSeatRows(req.params.venueId, parsed.data.seatRows);
    res.status(201).json({ venue });
  })
);
