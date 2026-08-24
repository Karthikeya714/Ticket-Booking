import express from "express";
import cors from "cors";
import type { ErrorRequestHandler } from "express";
import { env } from "./env";
import { AppError } from "./errors";
import { authRouter } from "./routes/auth";
import { testRouter } from "./routes/test";
import { adminRouter } from "./routes/admin";
import { showsRouter } from "./routes/shows";
import { holdsRouter } from "./routes/holds";
import { bookingsRouter } from "./routes/bookings";
import { waitlistOffersRouter } from "./routes/waitlistOffers";
import { eventsRouter } from "./routes/events";
import { venuesRouter } from "./routes/venues";
import { organiserRouter } from "./routes/organiser";
import { ticketsRouter } from "./routes/tickets";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/test", testRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/shows", showsRouter);
  app.use("/api/holds", holdsRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/waitlist-offers", waitlistOffersRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/venues", venuesRouter);
  app.use("/api/organiser", organiserRouter);
  app.use("/api/tickets", ticketsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
