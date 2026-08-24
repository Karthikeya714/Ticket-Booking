import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware";

// Throwaway routes to prove requireAuth/requireRole work per role. Not part of the product API.
export const testRouter = Router();

testRouter.get("/customer", requireAuth, requireRole("customer"), (req, res) => {
  res.json({ ok: true, role: "customer", user: req.user });
});

testRouter.get("/organiser", requireAuth, requireRole("organiser"), (req, res) => {
  res.json({ ok: true, role: "organiser", user: req.user });
});

testRouter.get("/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ ok: true, role: "admin", user: req.user });
});
