import { Link, useLocation } from "react-router-dom";
import { Button, Card } from "../components/ui";

export function BookingConfirmationPage() {
  const location = useLocation();
  const bookingReference = (location.state as { bookingReference?: string } | null)?.bookingReference;

  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-8">
      <Card className="overflow-hidden text-center shadow-xl shadow-violet-200/50">
        <div className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-700 px-6 py-8">
          <div className="grid place-items-center w-20 h-20 mx-auto mb-3 rounded-full bg-white/20 backdrop-blur text-4xl ring-4 ring-white/25">
            🎉
          </div>
          <h1 className="font-display text-2xl font-extrabold text-white">Booking confirmed</h1>
          <p className="text-violet-100 text-sm mt-1">Your seats are locked in.</p>
        </div>

        <div className="p-6 sm:p-8">
          {bookingReference ? (
            <>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Your reference number</p>
              {/* Dashed border + monospace so it reads like a tear-off ticket stub. */}
              <p className="text-xl font-mono font-bold tracking-wider mt-2 mb-5 bg-violet-50 border-2 border-dashed border-violet-200 text-violet-800 rounded-xl py-3">
                {bookingReference}
              </p>
            </>
          ) : (
            <p className="text-slate-600 mb-4">Your booking was confirmed.</p>
          )}
          <p className="text-sm text-slate-500 mb-6">
            A confirmation email with your QR code ticket is on its way — check your inbox (and spam folder, just in
            case).
          </p>
          {/* "View my bookings" stays the primary action since it's the natural next step right
              after booking; browsing on is offered alongside it rather than competing with it. */}
          <div className="flex flex-col gap-2.5">
            <Link to="/bookings">
              <Button className="w-full">View my bookings</Button>
            </Link>
            <Link to="/">
              <Button variant="secondary" className="w-full">
                🏠 Back to home
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
