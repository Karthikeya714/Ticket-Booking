import { Link, useLocation } from "react-router-dom";
import { Button, Card } from "../components/ui";

export function BookingConfirmationPage() {
  const location = useLocation();
  const bookingReference = (location.state as { bookingReference?: string } | null)?.bookingReference;

  return (
    <div className="max-w-md mx-auto mt-4 sm:mt-8">
      <Card className="p-6 sm:p-10 text-center">
        <div className="text-5xl mb-3">🎟️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking confirmed</h1>
        {bookingReference ? (
          <>
            <p className="text-gray-500 text-sm">Your reference number</p>
            <p className="text-xl font-mono font-semibold mt-1 mb-4 bg-gray-50 border border-gray-200 rounded-lg py-2">
              {bookingReference}
            </p>
          </>
        ) : (
          <p className="text-gray-600 mb-4">Your booking was confirmed.</p>
        )}
        <p className="text-sm text-gray-500 mb-6">
          A confirmation email with your QR code ticket is on its way — check your inbox (and spam
          folder, just in case).
        </p>
        <Link to="/bookings">
          <Button className="w-full">View my bookings</Button>
        </Link>
      </Card>
    </div>
  );
}
