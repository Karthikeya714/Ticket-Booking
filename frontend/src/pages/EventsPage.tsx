import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { EventSummary } from "../api/types";
import { Badge, Button, Card, CardListSkeleton, ErrorBanner, Input, PageHeading, Select } from "../components/ui";

export function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [type, setType] = useState<"" | "movie" | "concert">("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Skeletons belong on the first paint only. Re-running a filter with results already on screen
  // should refine them in place, not blank the list back to placeholders on every keystroke.
  const hasLoaded = useRef(false);

  // Typing "Indie" would otherwise fire five requests, each racing the last. Debouncing also
  // means the list stops churning while the user is mid-word.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (date) params.set("date", date);
    setLoading(true);

    let cancelled = false;
    apiGet<{ events: EventSummary[] }>(`/api/events?${params.toString()}`)
      .then((res) => {
        if (cancelled) return; // a newer filter already superseded this response
        setEvents(res.events);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (cancelled) return;
        hasLoaded.current = true;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type, debouncedSearch, date]);

  const showSkeleton = loading && !hasLoaded.current;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeading subtitle="Find something to see and grab your seat.">Browse events</PageHeading>

      {/* Browse is the app's landing page for every role, so staff arriving here would otherwise
          have to know to look in the nav for the tools they actually came for. */}
      {(user?.role === "organiser" || user?.role === "admin") && (
        <div className="rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-500/25">
          <p className="text-sm text-white/95 font-medium">
            {user.role === "organiser"
              ? "✨ Want to host an event? Create events and schedule shows from your dashboard."
              : "⚙️ Manage venues and seat layouts from your dashboard."}
          </p>
          <Link to={user.role === "organiser" ? "/organiser" : "/admin"} className="shrink-0">
            <Button className="!bg-white !bg-none !text-violet-700 hover:!shadow-xl">Go to dashboard</Button>
          </Link>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          type="text"
          placeholder="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search events by title"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="sm:w-44"
          aria-label="Filter by event type"
        >
          <option value="">All types</option>
          <option value="movie">Movies</option>
          <option value="concert">Concerts</option>
        </Select>
        <div className="flex gap-2 sm:w-56">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1"
            aria-label="Filter by date"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              className="text-sm text-gray-400 hover:text-gray-600 px-1 shrink-0"
              title="Clear date filter"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {showSkeleton && <CardListSkeleton />}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!showSkeleton && !error && events.length === 0 && (
        <Card className="p-10 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-2xl">
            🔍
          </div>
          <p className="font-display font-bold text-slate-900">No events found</p>
          <p className="text-sm text-slate-500 mt-1">
            {search || type || date
              ? "Try clearing your filters to see everything on offer."
              : "There are no upcoming events right now — check back soon."}
          </p>
        </Card>
      )}

      {/* Dimmed rather than replaced while a filter is in flight, so the list stays readable. */}
      <div className={`flex flex-col gap-3 transition-opacity ${loading && hasLoaded.current ? "opacity-50" : ""}`}>
        {events.map((event) => {
          const isMovie = event.type === "movie";
          return (
            <Link key={event.id} to={`/events/${event.id}`} className="group">
              {/* Colour-coded left spine + matching icon tile: movies read violet, concerts amber,
                  so the two kinds are separable at a glance without reading the badge. */}
              <Card className="overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-violet-200/50 group-hover:border-violet-200">
                <div className="flex">
                  <div
                    className={`w-1.5 shrink-0 bg-gradient-to-b ${
                      isMovie ? "from-violet-500 to-indigo-500" : "from-amber-400 to-orange-500"
                    }`}
                  />
                  <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span
                        className={`grid place-items-center w-11 h-11 shrink-0 rounded-xl text-xl ${
                          isMovie ? "bg-violet-100" : "bg-amber-100"
                        }`}
                      >
                        {isMovie ? "🎬" : "🎤"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <h2 className="font-display font-bold text-slate-900 group-hover:text-violet-700 transition-colors">
                            {event.title}
                          </h2>
                          <Badge tone={isMovie ? "indigo" : "amber"}>{event.type}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          by {event.organiserName} &middot; {event.upcomingShowCount} upcoming show(s)
                        </p>
                      </div>
                    </div>
                    {event.nextShowAt && (
                      <span className="text-xs font-semibold whitespace-nowrap sm:ml-4 rounded-lg bg-slate-100 text-slate-600 px-2.5 py-1.5">
                        Next: {new Date(event.nextShowAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
