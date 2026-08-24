import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../asyncHandler";
import { badRequest, conflict, forbidden, unauthorized } from "../errors";
import { signAuthToken } from "../auth/jwt";
import { verifyGoogleIdToken } from "../auth/google";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  // Deliberately excludes "admin" from the enum — zod rejects it outright (400) rather than
  // silently downgrading it, so this can't be used to self-provision a staff-admin account.
  // Admin stays provisioned-only via routes/admin.ts (existing-admin-only) or the seed script.
  role: z.enum(["customer", "organiser"]).optional().default("customer"),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("An account with that email already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role },
    });

    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw unauthorized("Invalid email or password");
    if (!user.passwordHash) throw unauthorized("This account uses Google Sign-In; use the Google login button instead");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw unauthorized("Invalid email or password");

    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);

const googleSchema = z.object({
  idToken: z.string().min(1),
  // Same admin exclusion as /register — only relevant when this call creates a brand-new
  // account; an existing account's role is never changed by Google Sign-In (see below).
  role: z.enum(["customer", "organiser"]).optional().default("customer"),
});

// Google Sign-In creates customer or organiser accounts, never admin — same boundary as
// /register. Admin stays provisioned-only via routes/admin.ts.
authRouter.post(
  "/google",
  asyncHandler(async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");

    const profile = await verifyGoogleIdToken(parsed.data.idToken);

    let user = await prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email: profile.email } });
      if (existingByEmail) {
        if (existingByEmail.role === "admin") {
          throw forbidden("This email belongs to an admin account; Google Sign-In is not available for admins");
        }
        // Google already verified ownership of this email address, so it's safe to link it to
        // the existing account. The account's existing role always wins — Google Sign-In
        // authenticates an identity, it never changes what that identity already is, so the
        // requested `role` is ignored here (it only applies to the "create new account" branch
        // below).
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: profile.googleId },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            role: parsed.data.role,
            googleId: profile.googleId,
          },
        });
      }
    }

    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  })
);
