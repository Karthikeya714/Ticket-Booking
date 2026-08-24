// Shared HTML shell + per-email bodies for transactional mail. Built with a <table>-based
// layout and inline styles (not flexbox/grid, not a <style> block) because that's what actually
// renders consistently across real inboxes (Gmail, Outlook, Apple Mail) — anything relying on
// modern CSS is a gamble in an email client.

const BRAND_COLOR = "#4f46e5";
const TEXT_DARK = "#111827";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function shell(bodyHtml: string): string {
  return `
<div style="background:#f3f4f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
    <tr>
      <td style="background:${BRAND_COLOR};padding:18px 32px;">
        <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">&#127917; Ticket Booking Platform</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px;background:#f9fafb;border-top:1px solid ${BORDER};">
        <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated email — please don't reply directly. Questions about your booking? Contact the event organiser.</p>
      </td>
    </tr>
  </table>
</div>`;
}

function typeBadge(type: string): string {
  const isMovie = type === "movie";
  const bg = isMovie ? "#eef2ff" : "#fffbeb";
  const fg = isMovie ? "#4338ca" : "#b45309";
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.5px;">${type}</span>`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface BookingEmailSeat {
  label: string; // e.g. "G12"
  category: string;
  price: number;
}

export interface BookingEmailData {
  customerName: string;
  eventTitle: string;
  eventType: string;
  venueName: string;
  venueAddress: string;
  dateTime: Date;
  seats: BookingEmailSeat[];
  totalPrice: number;
  bookingReference: string;
  // A real hosted URL (see routes/tickets.ts), not a data: URI or a cid: reference — Gmail (this
  // app's actual target) strips data: URIs from HTML email entirely, and Brevo's transactional
  // API doesn't support inline cid-attachment images at all.
  qrImageUrl: string;
}

export function renderBookingConfirmationEmail(data: BookingEmailData): { subject: string; html: string; text: string } {
  const seatBadges = data.seats
    .map(
      (s) =>
        `<span style="display:inline-block;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;font-weight:700;font-size:13px;padding:6px 12px;border-radius:8px;margin:0 6px 6px 0;">${s.label}</span>`
    )
    .join("");

  const orderRows = data.seats
    .map(
      (s) =>
        `<tr><td style="padding:5px 0;color:#374151;">Seat ${s.label} <span style="color:#9ca3af;">(${s.category})</span></td><td style="padding:5px 0;text-align:right;color:#374151;">$${s.price.toFixed(2)}</td></tr>`
    )
    .join("");

  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:38px;line-height:1;">&#127881;</div>
      <h1 style="margin:10px 0 4px;font-size:22px;color:${TEXT_DARK};">Booking confirmed</h1>
      <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">Hi ${data.customerName}, thanks for booking with us!</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid ${BORDER};border-radius:10px;margin-bottom:22px;">
      <tr><td style="padding:20px;">
        ${typeBadge(data.eventType)}
        <h2 style="margin:10px 0 4px;font-size:18px;color:${TEXT_DARK};">${data.eventTitle}</h2>
        <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">${formatDateTime(data.dateTime)}</p>
        <p style="margin:2px 0 0;color:${TEXT_MUTED};font-size:14px;">${data.venueName}, ${data.venueAddress}</p>
      </td></tr>
    </table>

    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.5px;text-transform:uppercase;">Seats</p>
    <div style="margin-bottom:20px;">${seatBadges}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:22px;">
      ${orderRows}
      <tr><td colspan="2" style="border-top:1px solid ${BORDER};padding-top:10px;"></td></tr>
      <tr><td style="padding:6px 0;font-weight:700;color:${TEXT_DARK};">Total paid</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${TEXT_DARK};">$${data.totalPrice.toFixed(2)}</td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:16px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Booking reference</p>
        <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;color:${TEXT_DARK};font-family:'Courier New',monospace;">${data.bookingReference}</p>
      </td></tr>
    </table>

    <div style="text-align:center;">
      <p style="margin:0 0 12px;font-size:13px;color:${TEXT_MUTED};">Show this QR code at entry</p>
      <img src="${data.qrImageUrl}" width="180" height="180" alt="Booking QR code" style="border:8px solid #f9fafb;border-radius:12px;" />
    </div>
  `;

  const text =
    `Booking confirmed\n\n${data.eventTitle} (${data.eventType}) at ${data.venueName}, ${data.venueAddress}\n` +
    `${formatDateTime(data.dateTime)}\n\n` +
    `Seats:\n${data.seats.map((s) => `  - ${s.label} (${s.category}): $${s.price.toFixed(2)}`).join("\n")}\n\n` +
    `Total paid: $${data.totalPrice.toFixed(2)}\n` +
    `Booking reference: ${data.bookingReference}\n\nYour QR code ticket is attached.`;

  return { subject: `Booking confirmed: ${data.eventTitle}`, html: shell(body), text };
}

export interface WaitlistOfferEmailData {
  customerName: string;
  eventTitle: string;
  seatLabel: string;
  offerExpiresAt: Date;
  link: string;
}

export function renderWaitlistOfferEmail(data: WaitlistOfferEmailData): { subject: string; html: string; text: string } {
  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:38px;line-height:1;">&#10024;</div>
      <h1 style="margin:10px 0 4px;font-size:22px;color:${TEXT_DARK};">A seat opened up for you</h1>
      <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">Hi ${data.customerName}, first come first served — act fast.</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid ${BORDER};border-radius:10px;margin-bottom:20px;">
      <tr><td style="padding:20px;text-align:center;">
        <h2 style="margin:0 0 4px;font-size:18px;color:${TEXT_DARK};">${data.eventTitle}</h2>
        <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">Seat ${data.seatLabel}</p>
      </td></tr>
    </table>

    <p style="text-align:center;font-size:13px;color:${TEXT_MUTED};margin:0 0 22px;">
      This offer expires at <strong style="color:${TEXT_DARK};">${formatDateTime(data.offerExpiresAt)}</strong> —
      after that it moves to the next person on the waitlist.
    </p>

    <div style="text-align:center;">
      <a href="${data.link}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Claim your seat</a>
    </div>
  `;

  const text =
    `A seat opened up for you\n\nHi ${data.customerName}, a seat opened up for ${data.eventTitle} (seat ${data.seatLabel}).\n` +
    `This offer expires at ${formatDateTime(data.offerExpiresAt)} — after that it moves to the next person on the waitlist.\n\n` +
    `Claim your seat: ${data.link}`;

  return { subject: `A seat opened up: ${data.eventTitle}`, html: shell(body), text };
}
