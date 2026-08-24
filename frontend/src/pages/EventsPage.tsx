import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import type { EventSummary } from "../api/types";
import { Badge, Card, ErrorBanner, Input, PageHeading, Select } from "../components/ui";

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [type, setType] = useState<"" | "movie" | "concert">("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (search) params.set("search", search);
    if (date) params.set("date", date);
    setLoading(true);
    apiGet<{ events: EventSummary[] }>(`/api/events?${params.toString()}`)
      .then((res) => setEvents(res.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"))
      .finally(() => setLoading(false));
  }, [type, search, date]);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeading subtitle="Find something to see and grab your seat.">Browse events</PageHeading>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input type="text" placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="sm:w-44">
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

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!loading && !error && events.length === 0 && (
        <Card className="p-8 text-center text-gray-500">No events found.</Card>
      )}

      <div className="flex flex-col gap-3">
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
