import { env } from "../env";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Render's free tier blocks all outbound traffic on SMTP ports 25/465/587, so Nodemailer-over-
// Gmail can never work there — the TCP connection times out before authentication is even
// attempted, regardless of how correct the credentials are. Brevo's API runs over plain HTTPS
// (port 443), which isn't affected by that block, and behaves identically in every environment
// (local dev included), so there's no reason to keep two separate mailer implementations.
//
// Returns null (not an error) when BREVO_API_KEY isn't set, matching the old getTransporter()
// contract, so callers fall back to a console-log stub instead of erroring — this keeps every
// booking/waitlist flow testable without a real API key.
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string } | null> {
  if (!env.brevoApiKey) return null;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.brevoApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseFromHeader(env.emailFrom),
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text,
      ...(params.attachments && params.attachments.length > 0
        ? { attachment: params.attachments.map((a) => ({ name: a.filename, content: a.content.toString("base64") })) }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { messageId?: string };
  return { messageId: data.messageId ?? "(no message id returned)" };
}

// "Ticket Platform <no-reply@example.com>" -> { name: "Ticket Platform", email: "no-reply@..." }.
// Brevo's API wants sender name/email as separate fields rather than one RFC 5322 header string.
function parseFromHeader(from: string): { name?: string; email: string } {
  const match = from.match(/^(.*)<(.+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}
