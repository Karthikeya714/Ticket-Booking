import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../asyncHandler";
import { badRequest, conflict } from "../errors";
import { requireAuth, requireRole } from "../auth/middleware";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

const createStaffUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["organiser", "admin"]),
});

// The only way to create an organiser or admin account: an existing admin provisions it here.
// Public /api/auth/register can only ever create customers.
adminRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
    const parsed = createStaffUserSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("An account with that email already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role },
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);
