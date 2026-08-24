import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen text-slate-900">
      {/* Translucent + blurred so the tinted page background shows through as you scroll. */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-slate-200/70 shadow-sm shadow-slate-200/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            {/* A drawn ticket mark rather than the 🎟️ emoji — the emoji's own reddish colour
                fights the violet tile and turns into a blob at this size. */}
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-md shadow-violet-500/30 transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  d="M4 8.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3.5a2.5 2.5 0 0 0 0-5Z"
                  strokeLinejoin="round"
                />
                <path d="M14 6.5v11" strokeLinecap="round" strokeDasharray="2 2.5" />
              </svg>
            </span>
            <span className="font-display font-extrabold text-lg bg-gradient-to-r from-violet-700 to-fuchsia-600 bg-clip-text text-transparent">
              <span className="hidden sm:inline">Ticket Booking Platform</span>
              <span className="sm:hidden">TBP</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 text-sm flex-wrap justify-end">
            {user?.role === "customer" && (
              <Link
                to="/bookings"
                className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              >
                My bookings
              </Link>
            )}
            {user?.role === "organiser" && (
              <Link
                to="/organiser"
                className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              >
                Organiser dashboard
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                to="/admin"
                className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              >
                Admin dashboard
              </Link>
            )}
            {user ? (
              <>
                <span className="hidden md:flex items-center gap-2 pl-2 pr-1">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-slate-600 font-medium">{user.name}</span>
                </span>
                <Button variant="secondary" onClick={handleLogout} className="!py-1.5">
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
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
