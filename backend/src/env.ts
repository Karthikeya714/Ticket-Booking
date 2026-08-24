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
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  holdTtlMinutes: Number(process.env.HOLD_TTL_MINUTES ?? 10),
  waitlistOfferTtlMinutes: Number(process.env.WAITLIST_OFFER_TTL_MINUTES ?? 30),
  expirySweepIntervalSeconds: Number(process.env.EXPIRY_SWEEP_INTERVAL_SECONDS ?? 15),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpAppPassword: process.env.SMTP_APP_PASSWORD ?? "",
  // Gmail's SMTP relay expects the From header to match the authenticated account (or a
  // verified "Send mail as" alias on it) — a mismatch gets rewritten or flagged by Gmail, and
  // hurts SPF/DKIM alignment at the receiving end, which is one of the biggest spam-folder
  // triggers. So unless EMAIL_FROM is explicitly overridden, default it to the SMTP account
  // itself rather than an arbitrary display address.
  emailFrom:
    process.env.EMAIL_FROM ??
    (process.env.SMTP_USER ? `Ticket Platform <${process.env.SMTP_USER}>` : "Ticket Platform <no-reply@example.com>"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
};
