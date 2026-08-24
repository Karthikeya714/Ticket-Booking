import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 shrink-0">
            <span className="text-xl">🎟️</span>
            <span className="hidden sm:inline">Ticket Booking Platform</span>
            <span className="sm:hidden">TBP</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3 text-sm flex-wrap justify-end">
            {user?.role === "customer" && (
              <Link to="/bookings" className="text-gray-600 hover:text-gray-900 font-medium">
                My bookings
              </Link>
            )}
            {user?.role === "organiser" && (
              <Link to="/organiser" className="text-gray-600 hover:text-gray-900 font-medium">
                Organiser dashboard
              </Link>
            )}
            {user?.role === "admin" && (
              <Link to="/admin" className="text-gray-600 hover:text-gray-900 font-medium">
                Admin dashboard
              </Link>
            )}
            {user ? (
              <>
                <span className="text-gray-500 hidden md:inline">{user.name}</span>
                <Button variant="secondary" onClick={logout} className="!py-1.5">
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium">
                  Log in
                </Link>
                <Link to="/register">
                  <Button className="!py-1.5">Register</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
