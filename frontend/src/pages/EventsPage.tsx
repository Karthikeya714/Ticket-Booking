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
        <Card className="p-4 mb-6 flex items-center justify-between gap-3 flex-wrap bg-indigo-50/60 border-indigo-100">
          <p className="text-sm text-gray-700">
            {user.role === "organiser"
              ? "Want to host an event? Create events and schedule shows from your dashboard."
              : "Manage venues and seat layouts from your dashboard."}
          </p>
          <Link to={user.role === "organiser" ? "/organiser" : "/admin"} className="shrink-0">
            <Button>Go to dashboard</Button>
          </Link>
        </Card>
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
          <div className="text-3xl mb-2">🔍</div>
          <p className="font-medium text-gray-900">No events found</p>
          <p className="text-sm text-gray-500 mt-1">
            {search || type || date
              ? "Try clearing your filters to see everything on offer."
              : "There are no upcoming events right now — check back soon."}
          </p>
        </Card>
      )}

      {/* Dimmed rather than replaced while a filter is in flight, so the list stays readable. */}
      <div className={`flex flex-col gap-3 transition-opacity ${loading && hasLoaded.current ? "opacity-50" : ""}`}>
        {events.map((event) => (
          <Link key={event.id} to={`/events/${event.id}`}>
            <Card className="p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-semibold text-gray-900">{event.title}</h2>
                  <Badge tone={event.type === "movie" ? "indigo" : "amber"}>{event.type}</Badge>
                </div>
                <p className="text-sm text-gray-500">
                  by {event.organiserName} &middot; {event.upcomingShowCount} upcoming show(s)
                </p>
              </div>
              {event.nextShowAt && (
                <span className="text-sm text-gray-500 whitespace-nowrap sm:ml-4">
                  Next: {new Date(event.nextShowAt).toLocaleDateString()}
                </span>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
