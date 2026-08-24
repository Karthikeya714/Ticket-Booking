import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSeatMapSocket } from "../hooks/useSeatMapSocket";
import { useCountdown, formatCountdown } from "../hooks/useCountdown";
import type { HoldResult, HoldStatus, SeatMapEntry, SeatStatus, ShowDetail } from "../api/types";
import { Badge, Button, Card, ErrorBanner, InfoBanner, Skeleton } from "../components/ui";

// Keep these four in lockstep with the legend swatches rendered below — the legend is the only
// thing telling a customer what each colour means, so a change here without a matching change
// there silently makes the map unreadable.
function seatColor(status: SeatStatus, isMine: boolean): string {
  if (isMine)
    return "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white border-violet-600 shadow-md shadow-violet-500/40 scale-110";
  if (status === "available")
    return "bg-white border-slate-300 text-slate-600 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 hover:scale-110 hover:shadow-md cursor-pointer";
  if (status === "held") return "bg-amber-100 border-amber-300 text-amber-700 cursor-not-allowed";
  return "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed"; // booked
}

interface HeldSeat {
  seatId: string;
  holdId: string;
}

export function ShowPage() {
  const { showId } = useParams<{ showId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [show, setShow] = useState<ShowDetail | null>(null);
  const [seats, setSeats] = useState<SeatMapEntry[]>([]);
  // A customer can hold several seats at once (one hold per seat, per the backend's
  // concurrency-safe per-seat locking), and confirm them all together as one booking via
  // POST /api/holds/confirm.
  const [heldSeats, setHeldSeats] = useState<HeldSeat[]>([]);
  const [holdStatuses, setHoldStatuses] = useState<Record<string, HoldStatus>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldSeatsRef = useRef<HeldSeat[]>([]);
  useEffect(() => {
    heldSeatsRef.current = heldSeats;
  }, [heldSeats]);

  useEffect(() => {
    if (!showId) return;
    apiGet<ShowDetail>(`/api/shows/${showId}`).then(setShow).catch(() => {});
    apiGet<{ seats: SeatMapEntry[] }>(`/api/shows/${showId}/seats`)
      .then((res) => setSeats(res.seats))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load seat map"));
  }, [showId]);

  const onSeatStatusChanged = useCallback((seatId: string, status: SeatStatus) => {
    setSeats((prev) => prev.map((s) => (s.seatId === seatId ? { ...s, status } : s)));
  }, []);
  useSeatMapSocket(showId ?? "", onSeatStatusChanged);

  // Reconciles every held seat's countdown against the server's clock, and notices if the cron
  // swept an abandoned hold (e.g. this tab sat idle past the TTL) — either way the UI must not
  // keep showing a hold as active once the server no longer agrees. Reads from a ref (not the
  // `heldSeats` state directly) so it always polls the latest set even when called manually
  // from handleConfirmAll's error path, not just from the interval.
  const reconcileHoldStatuses = useCallback(async () => {
    const current = heldSeatsRef.current;
    if (current.length === 0) {
      setHoldStatuses({});
      return;
    }
    const results = await Promise.all(
      current.map((hs) => apiGet<HoldStatus>(`/api/holds/${hs.holdId}`).catch(() => null))
    );
    const nextStatuses: Record<string, HoldStatus> = {};
    const expired: HeldSeat[] = [];
    results.forEach((status, i) => {
      if (status && status.status === "active") nextStatuses[current[i].holdId] = status;
      else if (status) expired.push(current[i]);
    });
    setHoldStatuses(nextStatuses);
    if (expired.length > 0) {
      const labels = expired
        .map((hs) => seats.find((s) => s.seatId === hs.seatId))
        .filter((s): s is SeatMapEntry => !!s)
        .map((s) => `${s.rowLabel}${s.seatNumber}`);
      setHeldSeats((prev) => prev.filter((hs) => !expired.some((e) => e.seatId === hs.seatId)));
      setError(`Hold expired for seat(s): ${labels.join(", ") || "some seats"}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  useEffect(() => {
    if (heldSeats.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    reconcileHoldStatuses();
    pollRef.current = setInterval(reconcileHoldStatuses, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldSeats.length]);

  const activeStatuses = Object.values(holdStatuses);
  const minRemainingSeconds = activeStatuses.length > 0 ? Math.min(...activeStatuses.map((s) => s.remainingSeconds)) : 0;
  const remainingSeconds = useCountdown(minRemainingSeconds);

  async function handleSeatClick(seat: SeatMapEntry) {
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role !== "customer") return; // booking affordances are already hidden for this role

    const alreadyHeld = heldSeats.find((hs) => hs.seatId === seat.seatId);
    if (alreadyHeld) {
      // Clicking your own selected seat again deselects it (releases just that hold).
      setBusy(true);
      try {
        await apiPost(`/api/holds/${alreadyHeld.holdId}/release`);
      } catch {
        // Best-effort — clear it locally regardless; a stale server-side hold will still
        // expire on its own via TTL.
      } finally {
        setHeldSeats((prev) => prev.filter((hs) => hs.seatId !== seat.seatId));
        setBusy(false);
      }
      return;
    }

    if (seat.status !== "available") return;
    setError(null);
    setBusy(true);
    try {
      const result = await apiPost<HoldResult>(`/api/shows/${showId}/seats/${seat.seatId}/hold`, {});
      setHeldSeats((prev) => [...prev, { seatId: seat.seatId, holdId: result.holdId }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not hold this seat");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAll() {
    if (heldSeats.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ booking: { bookingReference: string } }>("/api/holds/confirm", {
        holdIds: heldSeats.map((hs) => hs.holdId),
      });
      navigate("/booking-confirmation", { state: { bookingReference: res.booking.bookingReference } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm booking");
      // The whole batch fails together if even one hold expired — reconcile so the customer
      // sees exactly which seats are still theirs to retry with, rather than losing everything.
      await reconcileHoldStatuses();
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseAll() {
    if (heldSeats.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(heldSeats.map((hs) => apiPost(`/api/holds/${hs.holdId}/release`).catch(() => {})));
    } finally {
      setHeldSeats([]);
      setHoldStatuses({});
      setBusy(false);
    }
  }

  async function handleJoinWaitlist(category: string) {
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role !== "customer") return; // the waitlist button is already hidden for this role
    setWaitlistMessage(null);
    try {
      const res = await apiPost<{ position: number }>(`/api/shows/${showId}/waitlist`, { category });
      setWaitlistMessage(`Joined the ${category} waitlist — you're #${res.position} in line.`);
    } catch (err) {
      setWaitlistMessage(err instanceof ApiError ? err.message : "Could not join waitlist");
    }
  }

  if (error && seats.length === 0) return <ErrorBanner>{error}</ErrorBanner>;
  if (!show)
    return (
      <div className="max-w-3xl mx-auto">
        <Skeleton className="h-8 w-1/2 mb-3" />
        <Skeleton className="h-4 w-2/5 mb-6" />
        <Card className="p-6">
          <Skeleton className="h-8 w-full max-w-sm mx-auto mb-6" />
          <Skeleton className="h-4 w-3/4 mb-5" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );

  const rows = [...new Set(seats.map((s) => s.rowLabel))].sort();
  const categories = [...new Set(seats.map((s) => s.category))];
  const widestRowSeats = rows.reduce((max, r) => Math.max(max, seats.filter((s) => s.rowLabel === r).length), 0);
  // Organiser/admin accounts can view any show's seat map, but booking and waitlisting are
  // customer-only (the backend already enforces this — requireRole("customer") on both
  // endpoints — this just keeps the UI from offering an action that would 403).
  const isStaffViewing = user !== null && user.role !== "customer";
  // The backend refuses holds on a show that's started or been cancelled (services/showGuard.ts).
  // Such shows are already hidden from browse, but a direct link still lands here — so mirror the
  // rule in the UI rather than letting every seat click fail with a 409.
  const showStarted = new Date(show.dateTime).getTime() <= Date.now();
  const showCancelled = show.status === "cancelled";
  const seatsLocked = isStaffViewing || showStarted || showCancelled;
  const heldSeatIds = new Set(heldSeats.map((hs) => hs.seatId));
  const selectedSeats = heldSeats
    .map((hs) => seats.find((s) => s.seatId === hs.seatId))
    .filter((s): s is SeatMapEntry => !!s);
  const totalPrice = selectedSeats.reduce((sum, s) => sum + s.price, 0);
  const seatLabels = selectedSeats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(", ");

  return (
    <div className={`max-w-3xl mx-auto ${heldSeats.length > 0 ? "pb-36 sm:pb-28" : ""}`}>
      <Link to={`/events/${show.event.id}`} className="text-sm font-semibold text-violet-600 hover:text-fuchsia-600">
        &larr; Back to {show.event.title}
      </Link>
      <div className="flex items-center gap-2 mt-2">
        <h1 className="text-2xl font-bold text-slate-900">{show.event.title}</h1>
        <Badge tone={show.event.type === "movie" ? "indigo" : "amber"}>{show.event.type}</Badge>
      </div>
      <p className="text-slate-500 mt-1">
        {new Date(show.dateTime).toLocaleString()} &middot; {show.venue.name}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {showCancelled && <InfoBanner>This show has been cancelled and is no longer bookable.</InfoBanner>}
        {!showCancelled && showStarted && (
          <InfoBanner>This show has already started — seats can no longer be booked.</InfoBanner>
        )}
        {isStaffViewing && !showStarted && !showCancelled && (
          <InfoBanner>
            You're viewing this as {user!.role === "admin" ? "an admin" : "an organiser"} — booking and joining the
            waitlist are only available on a customer account.
          </InfoBanner>
        )}
        {!seatsLocked && (
          <p className="text-sm text-slate-500">Click seats to select — you can pick more than one before checking out.</p>
        )}
      </div>

      <Card className="p-4 sm:p-6 mt-4">
        {/* Sized to roughly span the widest seat row so the arc reads as being *over* the
            seating, rather than a narrow line floating above it. */}
        <div className="flex flex-col items-center mb-7" style={{ maxWidth: `${widestRowSeats * 42}px`, margin: "0 auto 1.75rem" }}>
          {/* The arc gets a soft glow beneath it so it reads as a lit screen/stage rather than
              a plain stroke. */}
          <svg viewBox="0 0 400 40" className="w-full h-7 sm:h-9" preserveAspectRatio="none">
            <defs>
              <linearGradient id="screenGlow" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="50%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#c4b5fd" />
              </linearGradient>
            </defs>
            <path d="M10,34 Q200,-4 390,34" fill="none" stroke="url(#screenGlow)" strokeWidth="10" strokeLinecap="round" opacity="0.18" />
            <path d="M10,34 Q200,-4 390,34" fill="none" stroke="url(#screenGlow)" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <p className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-violet-400 mt-1.5">
            {show.event.type === "movie" ? "SCREEN" : "STAGE"}
          </p>
        </div>

        <div className="flex gap-3 sm:gap-5 text-xs sm:text-sm mb-6 flex-wrap justify-center rounded-xl bg-slate-50 py-3 px-4">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-3.5 h-3.5 inline-block bg-white border border-slate-300 rounded shrink-0" /> Available
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-3.5 h-3.5 inline-block bg-amber-100 border border-amber-300 rounded shrink-0" /> Held
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-3.5 h-3.5 inline-block bg-slate-100 border border-slate-200 rounded shrink-0" /> Booked
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="w-3.5 h-3.5 inline-block bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded shrink-0" /> Your
            selection
          </span>
        </div>

        {/* Rows scroll horizontally as one block on narrow screens instead of wrapping mid-row,
            so the layout keeps reading left-to-right like a real theater map. Rows are centred
            on each other (`justify-center`) rather than left-aligned, so a short 12-seat row sits
            symmetrically inside a wider 14-seat one the way real seating charts do. */}
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
          <div className="flex flex-col gap-2.5 w-max mx-auto">
            {rows.map((row) => (
              <div key={row} className="flex items-center gap-2 sm:gap-3">
                <span className="w-4 sm:w-5 text-sm font-medium text-slate-400 shrink-0 text-right">{row}</span>
                <div className="flex gap-1.5 sm:gap-2 flex-1 justify-center">
                  {seats
                    .filter((s) => s.rowLabel === row)
                    .sort((a, b) => a.seatNumber - b.seatNumber)
                    .map((seat) => {
                      const isMine = heldSeatIds.has(seat.seatId);
                      return (
                        <button
                          key={seat.seatId}
                          disabled={busy || seatsLocked || (seat.status !== "available" && !isMine)}
                          onClick={() => handleSeatClick(seat)}
                          title={`${seat.rowLabel}${seat.seatNumber} — ${seat.category} — $${seat.price}`}
                          aria-label={`Seat ${seat.rowLabel}${seat.seatNumber}, ${seat.category}, $${seat.price}, ${isMine ? "selected" : seat.status}`}
                          className={`w-9 h-9 shrink-0 text-xs font-medium rounded-md border flex items-center justify-center transition-all touch-manipulation ${seatColor(seat.status, isMine)} ${seatsLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {seat.seatNumber}
                        </button>
                      );
                    })}
                </div>
                {/* Mirrors the left gutter — real seating charts label both ends, and the symmetry
                    is also what keeps the seat block centred on the same axis as the SCREEN arc
                    (a left-only label would push the seats right by half the gutter). */}
                <span className="w-4 sm:w-5 text-sm font-medium text-slate-400 shrink-0">{row}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {!seatsLocked && categories.some((c) => !seats.some((s) => s.category === c && s.status === "available")) && (
        <Card className="p-5 mt-4 flex flex-col gap-2">
          <h3 className="font-medium text-slate-900 text-sm">Sold out categories</h3>
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => {
              const hasAvailable = seats.some((s) => s.category === category && s.status === "available");
              if (hasAvailable) return null;
              return (
                <Button key={category} variant="secondary" onClick={() => handleJoinWaitlist(category)}>
                  Join {category} waitlist
                </Button>
              );
            })}
          </div>
          {waitlistMessage && <p className="text-sm text-slate-600 mt-1">{waitlistMessage}</p>}
        </Card>
      )}

      {/* `env(safe-area-inset-bottom)` keeps Confirm/Cancel clear of an iPhone's home-indicator
          swipe zone — without it, `fixed bottom-0` sits flush against the edge those gestures
          use, which real phones (not a desktop viewport emulator) actually enforce. */}
      {heldSeats.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg text-white px-4 sm:px-6 py-3 sm:py-4 shadow-2xl border-t border-white/10"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
            <div className="text-sm min-w-0">
              <div className="truncate font-medium">
                {heldSeats.length} seat{heldSeats.length > 1 ? "s" : ""} held ({seatLabels}) &middot;{" "}
                <span className="font-display font-extrabold text-lg bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent align-middle">
                  ${totalPrice}
                </span>
              </div>
              <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Expires in <span className="font-mono font-bold text-amber-300">{formatCountdown(remainingSeconds)}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="secondary"
                onClick={handleReleaseAll}
                disabled={busy}
                className="flex-1 sm:flex-none !bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!text-white"
              >
                Cancel
              </Button>
              <Button onClick={handleConfirmAll} disabled={busy} className="flex-1 sm:flex-none">
                Confirm booking
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
