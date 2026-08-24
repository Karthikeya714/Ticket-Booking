import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../api/client";
import type { EventDetail } from "../api/types";
import { Badge, Card, CardListSkeleton, ErrorBanner, Skeleton } from "../components/ui";

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    apiGet<EventDetail>(`/api/events/${eventId}`)
      .then(setEvent)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load event"));
  }, [eventId]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!event)
    return (
      <div className="max-w-2xl mx-auto">
        <Skeleton className="h-8 w-1/2 mb-3" />
        <Skeleton className="h-4 w-3/4 mb-6" />
        <CardListSkeleton rows={2} />
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm font-semibold text-violet-600 hover:text-fuchsia-600">
        &larr; Back to events
      </Link>

      {/* Hero band tinted to the event type, matching the colour-coding on the browse list. */}
      <div
        className={`mt-3 rounded-2xl p-6 bg-gradient-to-br ${
          event.type === "movie"
            ? "from-violet-600 to-indigo-600 shadow-violet-500/25"
            : "from-amber-500 to-orange-600 shadow-amber-500/25"
        } shadow-lg`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-3xl">{event.type === "movie" ? "🎬" : "🎤"}</span>
          <h1 className="font-display text-2xl font-extrabold text-white">{event.title}</h1>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
            {event.type}
          </span>
        </div>
        <p className="text-white/90 mt-2.5">{event.description}</p>
        <p className="text-sm text-white/70 mt-1">organised by {event.organiserName}</p>
      </div>

      <h2 className="font-display text-lg font-bold mt-8 mb-3 text-slate-900">Showtimes</h2>
      {event.shows.length === 0 && <Card className="p-6 text-center text-slate-500">No upcoming shows.</Card>}
      <div className="flex flex-col gap-3">
        {event.shows.map((show) => (
          <Link key={show.id} to={`/shows/${show.id}`} className="group">
            <Card
              className={`p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg ${
                event.type === "movie"
                  ? "group-hover:border-violet-200 group-hover:shadow-violet-200/50"
                  : "group-hover:border-amber-200 group-hover:shadow-amber-200/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div
                    className={`font-display font-bold text-slate-900 transition-colors ${
                      event.type === "movie" ? "group-hover:text-violet-700" : "group-hover:text-amber-700"
                    }`}
                  >
                    {new Date(show.dateTime).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    📍 {show.venue.name} &middot; {show.venue.address}
                  </div>
                </div>
                <span
                  className={`opacity-0 group-hover:opacity-100 transition-opacity font-bold ${
                    event.type === "movie" ? "text-violet-500" : "text-amber-600"
                  }`}
                >
                  Book &rarr;
                </span>
              </div>
              {/* Price pills follow the event's own colour so the detail page reads as one
                  palette instead of violet chips under an amber concert hero. */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {show.pricing.map((p) => (
                  <Badge key={p.category} tone={event.type === "movie" ? "indigo" : "amber"}>
                    {p.category}: ${p.price}
                  </Badge>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
