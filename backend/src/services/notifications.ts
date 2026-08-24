import { env } from "../env";
import { prisma } from "../prisma";
import { sendEmail } from "./mailer";
import { generateBookingQrPng } from "./qr";
import { renderBookingConfirmationEmail, renderWaitlistOfferEmail } from "./emailTemplates";

// Every function here is fire-and-forget from the caller's perspective: it never throws, so a
// booking/offer transaction that already committed can never be undone by an email failing to
// send. Without BREVO_API_KEY configured, sends fall back to a console log instead of erroring,
// so the booking/waitlist flows stay fully testable without a real API key.

export async function sendBookingConfirmationEmail(bookingId: string): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        show: { include: { event: true, venue: true, pricing: true } },
        bookingSeats: { include: { showSeat: { include: { seat: true } } } },
      },
    });
    if (!booking) return;

    const priceByCategory = new Map(booking.show.pricing.map((p) => [p.category, Number(p.price)]));
    const seats = booking.bookingSeats.map((bs) => ({
      label: `${bs.showSeat.seat.rowLabel}${bs.showSeat.seat.seatNumber}`,
      category: bs.showSeat.seat.category,
      price: priceByCategory.get(bs.showSeat.seat.category) ?? 0,
    }));
    const seatLabels = seats.map((s) => s.label).join(", ");

    if (!env.brevoApiKey) {
      console.log(
        `[email:stub] booking confirmation -> ${booking.customer.email} | ${booking.show.event.title} | ` +
          `seats ${seatLabels} | ref ${booking.bookingReference}`
      );
      return;
    }

    const qrPng = await generateBookingQrPng(booking.bookingReference);
    const email = renderBookingConfirmationEmail({
      customerName: booking.customer.name,
      eventTitle: booking.show.event.title,
      eventType: booking.show.event.type,
      venueName: booking.show.venue.name,
      venueAddress: booking.show.venue.address,
      dateTime: booking.show.dateTime,
      seats,
      totalPrice: Number(booking.totalPrice),
      bookingReference: booking.bookingReference,
      qrDataUri: `data:image/png;base64,${qrPng.toString("base64")}`,
    });

    const result = await sendEmail({
      to: booking.customer.email,
      subject: email.subject,
      // A text alternative alongside html isn't just a nicety — mail with only an HTML part is
      // a real spam-score signal, since legitimate transactional mail (multipart/alternative)
      // almost always includes both.
      text: email.text,
      html: email.html,
      attachments: [{ filename: "ticket-qr.png", content: qrPng }],
    });
    console.log(`[email] booking confirmation sent -> ${booking.customer.email} | ${result?.messageId}`);
  } catch (err) {
    console.error("[email] failed to send booking confirmation:", err);
  }
}

export interface WaitlistOfferEmail {
  to: string;
  customerName: string;
  eventTitle: string;
  seatLabel: string;
  offerExpiresAt: Date;
  token: string;
}

// A distinct, time-limited link rather than a QR — there's nothing to scan yet, since accepting
// this still has to happen before any booking (and therefore any QR) exists.
export async function sendWaitlistOfferEmail(params: WaitlistOfferEmail): Promise<void> {
  const link = `${env.frontendUrl}/waitlist-offer/${params.token}`;

  try {
    if (!env.brevoApiKey) {
      console.log(
        `[email:stub] waitlist offer -> ${params.to} | ${params.eventTitle} seat ${params.seatLabel} | ` +
          `expires ${params.offerExpiresAt.toISOString()} | ${link}`
      );
      return;
    }

    const email = renderWaitlistOfferEmail({
      customerName: params.customerName,
      eventTitle: params.eventTitle,
      seatLabel: params.seatLabel,
      offerExpiresAt: params.offerExpiresAt,
      link,
    });

    const result = await sendEmail({ to: params.to, subject: email.subject, text: email.text, html: email.html });
    console.log(`[email] waitlist offer sent -> ${params.to} | ${result?.messageId}`);
  } catch (err) {
    console.error("[email] failed to send waitlist offer email:", err);
  }
}
