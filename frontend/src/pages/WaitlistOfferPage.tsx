import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCountdown, formatCountdown } from "../hooks/useCountdown";
import type { WaitlistOfferDetail } from "../api/types";
import { Button, Card, ErrorBanner, Skeleton } from "../components/ui";

export function WaitlistOfferPage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [offer, setOffer] = useState<WaitlistOfferDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token || !user) return;
    apiGet<WaitlistOfferDetail>(`/api/waitlist-offers/by-token/${token}`)
      .then(setOffer)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this offer"));
  }, [token, user]);

  const remainingSeconds = useCountdown(offer?.remainingSeconds ?? 0);

  async function handleAccept() {
    if (!offer) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await apiPost<{ booking: { bookingReference: string } }>(`/api/waitlist-offers/${offer.id}/accept`);
      navigate("/booking-confirmation", { state: { bookingReference: res.booking.bookingReference } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept this offer");
    } finally {
      setAccepting(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-4 sm:mt-8">
        <Card className="p-6 sm:p-10 text-center">
          <p className="text-slate-600 mb-4">Log in to view this offer.</p>
          <Button onClick={() => navigate("/login")}>Log in</Button>
        </Card>
      </div>
    );
  }

  if (error) return <div className="max-w-md mx-auto mt-8"><ErrorBanner>{error}</ErrorBanner></div>;
  if (!offer)
    return (
      <div className="max-w-md mx-auto mt-4 sm:mt-8">
        <Card className="p-6 sm:p-10">
          <Skeleton className="h-6 w-2/3 mx-auto mb-3" />
          <Skeleton className="h-4 w-1/2 mx-auto mb-6" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    );

  const expired = offer.status !== "pending" || remainingSeconds <= 0;

  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-8">
      <Card className="p-6 sm:p-10 text-center shadow-xl shadow-violet-200/40">
        <div className="grid place-items-center w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-3xl shadow-lg shadow-violet-500/30">
          ✨
        </div>
        <h1 className="font-display text-2xl font-extrabold text-slate-900 mb-1">A seat is available for you</h1>
        <p className="text-slate-700 font-medium mt-3">{offer.eventTitle}</p>
        <p className="text-sm text-slate-500 mt-1">
          {new Date(offer.dateTime).toLocaleString()} &middot; {offer.venueName}
        </p>
        <p className="text-sm text-slate-500 mb-6">
          Seat {offer.seatLabel} &middot; {offer.category}
        </p>

        {expired ? (
          <ErrorBanner>
            This offer has expired. If you're still interested, join the waitlist again from the show page.
          </ErrorBanner>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Expires in <span className="font-mono font-semibold text-slate-700">{formatCountdown(remainingSeconds)}</span>
            </p>
            <Button onClick={handleAccept} disabled={accepting} className="w-full">
              {accepting ? "Booking..." : "Claim this seat"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
