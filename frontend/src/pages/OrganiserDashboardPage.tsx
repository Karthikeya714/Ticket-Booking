import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, apiDelete, ApiError } from "../api/client";
import type { OrganiserEventSummary, OrganiserEventDetail, Venue } from "../api/types";
import { Badge, Button, Card, ErrorBanner, Input, PageHeading, Select, Textarea } from "../components/ui";

export function OrganiserDashboardPage() {
  const [events, setEvents] = useState<OrganiserEventSummary[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"movie" | "concert">("movie");
  const [description, setDescription] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function reloadEvents() {
    apiGet<{ events: OrganiserEventSummary[] }>("/api/organiser/events")
      .then((res) => setEvents(res.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"));
  }
  useEffect(reloadEvents, []);
  useEffect(() => {
    apiGet<{ venues: Venue[] }>("/api/venues")
      .then((res) => setVenues(res.venues))
      .catch(() => {});
  }, []);

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatingEvent(true);
    try {
      await apiPost("/api/organiser/events", { title, type, description });
      setTitle("");
      setDescription("");
      reloadEvents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create event");
    } finally {
      setCreatingEvent(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeading subtitle="Create events, schedule shows, and track revenue.">Organiser dashboard</PageHeading>

      <Card className="p-6 mb-8">
        <h2 className="font-semibold text-slate-900 mb-4">Create an event</h2>
        <form onSubmit={handleCreateEvent} className="flex flex-col gap-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Select value={type} onChange={(e) => setType(e.target.value as "movie" | "concert")}>
            <option value="movie">Movie</option>
            <option value="concert">Concert</option>
          </Select>
          <Textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            required
          />
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button type="submit" disabled={creatingEvent} className="self-start">
            {creatingEvent ? "Creating..." : "Create event"}
          </Button>
        </form>
      </Card>

      <h2 className="font-semibold text-slate-900 mb-3">Your events ({events.length})</h2>
      <div className="flex flex-col gap-3">
        {events.length === 0 && <Card className="p-6 text-center text-slate-500">No events yet — create one above.</Card>}
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            venues={venues}
            expanded={expandedId === event.id}
            onToggle={() => setExpandedId((prev) => (prev === event.id ? null : event.id))}
            onChanged={reloadEvents}
          />
        ))}
      </div>
    </div>
  );
}

function EventRow({
  event,
  venues,
  expanded,
  onToggle,
  onChanged,
}: {
  event: OrganiserEventSummary;
  venues: Venue[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`Delete "${event.title}"? This can't be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/organiser/events/${event.id}`);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete event");
    } finally {
      setDeleting(false);
    }
  }
  const [detail, setDetail] = useState<OrganiserEventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  function refreshDetail() {
    apiGet<OrganiserEventDetail>(`/api/organiser/events/${event.id}`).then(setDetail);
  }

  useEffect(() => {
    if (!expanded) return;
    setLoadingDetail(true);
    apiGet<OrganiserEventDetail>(`/api/organiser/events/${event.id}`)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [expanded, event.id]);

  return (
    <Card className="p-4">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 flex-wrap text-left">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">{event.title}</h3>
            <Badge tone={event.type === "movie" ? "indigo" : "amber"}>{event.type}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{event.description}</p>
        </div>
        {/* Revenue is the number an organiser actually cares about, so it gets the strongest
            treatment of the three rather than sitting as a peer badge. */}
        <div className="flex gap-2 items-center flex-wrap">
          <Badge tone="gray">{event.showCount} show(s)</Badge>
          <Badge tone="indigo">{event.ticketsSold} sold</Badge>
          <span className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-sm font-display font-extrabold text-white shadow-sm shadow-emerald-500/30">
            ${event.totalRevenue.toFixed(2)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          {loadingDetail && <p className="text-sm text-slate-500">Loading...</p>}
          {detail && (
            <>
              {detail.shows.length === 0 && <p className="text-sm text-slate-500 mb-3">No shows scheduled yet.</p>}
              <div className="flex flex-col gap-2 mb-4">
                {detail.shows.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5 gap-2 flex-wrap"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{new Date(s.dateTime).toLocaleString()}</div>
                      <div className="text-slate-500">📍 {s.venue.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 text-xs">{s.ticketsSold} sold</div>
                      <div className="font-display font-extrabold text-emerald-600">${s.revenue.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <AddShowForm
                eventId={event.id}
                venues={venues}
                onCreated={() => {
                  refreshDetail();
                  onChanged();
                }}
              />

              <div className="mt-4 pt-4 border-t border-slate-200">
                {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}
                <Button variant="danger" onClick={handleDelete} disabled={deleting} className="mt-2">
                  {deleting ? "Deleting..." : "Delete event"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function AddShowForm({ eventId, venues, onCreated }: { eventId: string; venues: Venue[]; onCreated: () => void }) {
  const [venueId, setVenueId] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedVenue = venues.find((v) => v.id === venueId);

  function handleVenueChange(id: string) {
    setVenueId(id);
    const v = venues.find((x) => x.id === id);
    setPrices(v ? Object.fromEntries(v.categories.map((c) => [c, ""])) : {});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(`/api/organiser/events/${eventId}/shows`, {
        venueId,
        dateTime: new Date(dateTime).toISOString(),
        pricing: Object.entries(prices).map(([category, price]) => ({ category, price: Number(price) })),
      });
      setVenueId("");
      setDateTime("");
      setPrices({});
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create show");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-violet-50/60 border border-violet-100 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add a show</p>
      {venues.length === 0 ? (
        <p className="text-sm text-slate-500">No venues exist yet — ask an admin to create one first.</p>
      ) : (
        <>
          <Select value={venueId} onChange={(e) => handleVenueChange(e.target.value)} required>
            <option value="">Select a venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.seatCount} seats)
              </option>
            ))}
          </Select>
          <Input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
          {selectedVenue && (
            <div className="flex flex-col gap-2">
              {selectedVenue.categories.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-28 shrink-0">{c}</span>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    placeholder="Price"
                    value={prices[c] ?? ""}
                    onChange={(e) => setPrices((prev) => ({ ...prev, [c]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>
          )}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button type="submit" disabled={submitting || !venueId} className="self-start">
            {submitting ? "Adding..." : "Add show"}
          </Button>
        </>
      )}
    </form>
  );
}
