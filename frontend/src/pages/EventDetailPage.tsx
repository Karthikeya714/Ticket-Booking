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
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        &larr; Back to events
      </Link>

      <div className="flex items-center gap-2 mt-3">
        <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
        <Badge tone={event.type === "movie" ? "indigo" : "amber"}>{event.type}</Badge>
      </div>
      <p className="text-gray-600 mt-2">{event.description}</p>
      <p className="text-sm text-gray-500 mt-1">organised by {event.organiserName}</p>

      <h2 className="text-lg font-semibold mt-8 mb-3 text-gray-900">Showtimes</h2>
      {event.shows.length === 0 && <Card className="p-6 text-center text-gray-500">No upcoming shows.</Card>}
      <div className="flex flex-col gap-3">
        {event.shows.map((show) => (
          <Link key={show.id} to={`/shows/${show.id}`}>
            <Card className="p-5 hover:border-indigo-300 hover:shadow-md transition-all">
              <div className="font-semibold text-gray-900">{new Date(show.dateTime).toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {show.venue.name} &middot; {show.venue.address}
              </div>
              <div className="flex gap-2 mt-2">
                {show.pricing.map((p) => (
                  <Badge key={p.category} tone="gray">
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
