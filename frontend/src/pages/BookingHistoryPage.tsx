import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "../api/client";
import type { Booking } from "../api/types";
import { Badge, Button, Card, ErrorBanner, PageHeading } from "../components/ui";

export function BookingHistoryPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const navigate = useNavigate();

  function reload() {
    apiGet<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bookings"));
  }

  useEffect(reload, []);

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    setError(null);
    try {
      await apiPost(`/api/bookings/${bookingId}/cancel`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel booking");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* This page is reachable straight from the nav and from the confirmation screen, so it
          needs its own way back rather than relying on the browser's back button. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeading>My bookings</PageHeading>
        <Link to="/" className="shrink-0">
          <Button variant="secondary">🏠 Home</Button>
        </Link>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {bookings.length === 0 && (
        <Card className="p-10 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-2xl">
            🎫
          </div>
          <p className="font-display font-bold text-slate-900">No bookings yet</p>
          <p className="text-sm text-slate-500 mt-1 mb-5">Find something to see and grab your seat.</p>
          <Button onClick={() => navigate("/")}>Browse events</Button>
        </Card>
      )}

      <div className="flex flex-col gap-3 mt-3">
        {bookings.map((booking) => (
          <Card
            key={booking.id}
            className={`p-5 border-l-4 ${
              booking.status === "confirmed" ? "border-l-emerald-500" : "border-l-slate-300 opacity-75"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h2 className="font-display font-bold text-slate-900">{booking.show.event.title}</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {new Date(booking.show.dateTime).toLocaleString()} &middot; {booking.show.venue.name}
                </p>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-slate-600">Seats:</span>
                  {booking.bookingSeats.map((bs) => (
                    <span
                      key={`${bs.showSeat.seat.rowLabel}${bs.showSeat.seat.seatNumber}`}
                      className="inline-block rounded-md bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 px-1.5 py-0.5 text-xs font-bold"
                    >
                      {bs.showSeat.seat.rowLabel}
                      {bs.showSeat.seat.seatNumber}
                    </span>
                  ))}
                </p>
                <p className="text-xs font-mono text-slate-400 mt-2">{booking.bookingReference}</p>
              </div>
              <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                <Badge tone={booking.status === "confirmed" ? "green" : "gray"}>{booking.status}</Badge>
                <p className="font-display text-lg font-extrabold text-slate-900">${booking.totalPrice}</p>
                {/* The backend refuses to cancel once the show has started, so don't offer it. */}
                {booking.status === "confirmed" &&
                  (new Date(booking.show.dateTime).getTime() > Date.now() ? (
                    <Button
                      variant="danger"
                      onClick={() => handleCancel(booking.id)}
                      disabled={cancellingId === booking.id}
                      className="!px-3 !py-1 text-xs"
                    >
                      {cancellingId === booking.id ? "Cancelling..." : "Cancel"}
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Past show</span>
                  ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
