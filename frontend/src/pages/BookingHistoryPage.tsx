import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
      <PageHeading>My bookings</PageHeading>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {bookings.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-gray-500 mb-4">No bookings yet.</p>
          <Button onClick={() => navigate("/")}>Browse events</Button>
        </Card>
      )}

      <div className="flex flex-col gap-3 mt-3">
        {bookings.map((booking) => (
          <Card key={booking.id} className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900">{booking.show.event.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {new Date(booking.show.dateTime).toLocaleString()} &middot; {booking.show.venue.name}
                </p>
                <p className="text-sm text-gray-500">
                  Seats: {booking.bookingSeats.map((bs) => `${bs.showSeat.seat.rowLabel}${bs.showSeat.seat.seatNumber}`).join(", ")}
                </p>
                <p className="text-sm font-mono text-gray-400 mt-1.5">{booking.bookingReference}</p>
              </div>
              <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                <Badge tone={booking.status === "confirmed" ? "green" : "gray"}>{booking.status}</Badge>
                <p className="text-sm font-semibold">${booking.totalPrice}</p>
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
                    <span className="text-xs text-gray-400">Past show</span>
                  ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
