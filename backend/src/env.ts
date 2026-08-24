import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  // This backend's own public URL, used to build the QR-code image link embedded in emails (see
  // routes/tickets.ts) — email clients load that as a plain <img src>, which only works with a
  // real reachable URL, not a data: URI (Gmail strips those) or a Brevo cid: reference (Brevo's
  // API doesn't support inline attachments at all). RENDER_EXTERNAL_URL is set automatically by
  // Render for every web service, so this needs no manual configuration in production.
  apiBaseUrl: process.env.RENDER_EXTERNAL_URL ?? process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  holdTtlMinutes: Number(process.env.HOLD_TTL_MINUTES ?? 10),
  waitlistOfferTtlMinutes: Number(process.env.WAITLIST_OFFER_TTL_MINUTES ?? 30),
  expirySweepIntervalSeconds: Number(process.env.EXPIRY_SWEEP_INTERVAL_SECONDS ?? 15),
  // Brevo (not raw SMTP) — see services/mailer.ts for why: Render's free tier blocks outbound
  // SMTP ports entirely, so a real mail provider's HTTP API is the only thing that works both
  // locally and in production without a paid plan.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  // Must be an email Brevo has verified as a sender (single-sender verification, not full domain
  // DNS) — an unverified "from" address gets every send rejected. Falls back to a placeholder
  // that only ever appears in the stub-fallback log line, never in a real send.
  emailFrom: process.env.EMAIL_FROM ?? "Ticket Platform <no-reply@example.com>",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
};
