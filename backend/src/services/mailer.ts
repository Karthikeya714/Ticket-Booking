import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";

let transporter: Transporter | null | undefined;

// Lazily built and cached. Returns null (not an error) when SMTP_USER/SMTP_APP_PASSWORD aren't
// set, so the rest of the app can run — and be tested — without real credentials; callers fall
// back to logging instead of sending. `undefined` means "not yet resolved", `null` means
// "resolved to unconfigured", keeping the memoization and the "is it configured" check distinct.
export function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!env.smtpUser || !env.smtpAppPassword) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.smtpUser, pass: env.smtpAppPassword },
  });
  return transporter;
}
