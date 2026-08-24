import { Link } from "react-router-dom";
import { Button, Card } from "../components/ui";

const FEATURES = [
  {
    icon: "🎬",
    title: "Browse movies & concerts",
    body: "Find showtimes across every venue on the platform, filterable by type and date.",
  },
  {
    icon: "💺",
    title: "Pick your exact seat",
    body: "Live seat maps update in real time as other people book, so you always see what's really left.",
  },
  {
    icon: "📩",
    title: "Instant QR ticket",
    body: "A scannable ticket lands in your inbox the moment your booking is confirmed.",
  },
  {
    icon: "⏳",
    title: "Waitlist when sold out",
    body: "Join the waitlist and get first dibs, by email, the second a seat frees up.",
  },
];

// The public landing screen for anyone who hasn't logged in yet — browsing the catalog itself
// requires an account, so this is what greets a visitor at "/" instead of the events list.
export function LandingPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="text-center opacity-0 [animation-fill-mode:both]"
        style={{ animation: "fade-in-up 0.6s ease-out" }}
      >
        <span className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-500/30 text-3xl mb-5">
          🎟️
        </span>
        <h1 className="font-display text-4xl font-extrabold bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-700 bg-clip-text text-transparent mb-3">
          Ticket Booking Platform
        </h1>
        <p className="text-slate-500 text-base max-w-lg mx-auto mb-8">
          Book tickets for movies and concerts in seconds — pick your seat, pay, and get a QR ticket
          emailed to you instantly.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/register">
            <Button>Get started</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-14">
        {FEATURES.map((f, i) => (
          <Card
            key={f.title}
            className="p-5 opacity-0 [animation-fill-mode:both]"
            style={{ animation: `fade-in-up 0.6s ease-out ${0.1 + i * 0.1}s` }}
          >
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-violet-50 text-xl mb-3">
              {f.icon}
            </span>
            <h2 className="font-display font-bold text-slate-900 mb-1">{f.title}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{f.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
