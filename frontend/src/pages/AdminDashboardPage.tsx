import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, ApiError } from "../api/client";
import type { Venue } from "../api/types";
import { Badge, Button, Card, ErrorBanner, Input, PageHeading } from "../components/ui";

interface SeatRowForm {
  rowLabel: string;
  category: string;
  seatCount: string;
}

function emptyRow(): SeatRowForm {
  return { rowLabel: "", category: "", seatCount: "10" };
}

function SeatRowsEditor({
  seatRows,
  setSeatRows,
}: {
  seatRows: SeatRowForm[];
  setSeatRows: (updater: (prev: SeatRowForm[]) => SeatRowForm[]) => void;
}) {
  function updateRow(i: number, field: keyof SeatRowForm, value: string) {
    setSeatRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  return (
    <>
      {seatRows.map((row, i) => (
        // Deliberately `flex-nowrap`: the remove button must stay on its row's own line, never
        // wrap to a line of its own where it reads as belonging to nothing. Category carries
        // `min-w-0` so it absorbs the squeeze instead — a flex item defaults to `min-width: auto`
        // (won't shrink below its content), which is exactly what forced the overflow before.
        <div key={i} className="flex flex-nowrap items-end gap-1.5 sm:gap-2">
          <label className="flex flex-col gap-1 w-14 sm:w-20 shrink-0">
            <span className="text-[11px] font-medium text-gray-500">Row</span>
            <Input
              placeholder="A"
              value={row.rowLabel}
              onChange={(e) => updateRow(i, "rowLabel", e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-[11px] font-medium text-gray-500">Category</span>
            <Input
              placeholder="PREMIUM"
              value={row.category}
              onChange={(e) => updateRow(i, "category", e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 w-14 sm:w-20 shrink-0">
            <span className="text-[11px] font-medium text-gray-500">Seats</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={row.seatCount}
              onChange={(e) => updateRow(i, "seatCount", e.target.value)}
              className="!px-2"
              required
            />
          </label>
          {/* Hidden rather than disabled on the only row — a permanently greyed-out glyph reads
              as a rendering artifact, especially once it wraps on a narrow screen. */}
          {seatRows.length > 1 && (
            <button
              type="button"
              onClick={() => setSeatRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="h-[42px] w-7 shrink-0 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
              title={`Remove row ${row.rowLabel || i + 1}`}
              aria-label={`Remove row ${row.rowLabel || i + 1}`}
            >
              &times;
            </button>
          )}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => setSeatRows((prev) => [...prev, emptyRow()])} className="self-start">
        + Add row
      </Button>
    </>
  );
}

export function AdminDashboardPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [seatRows, setSeatRows] = useState<SeatRowForm[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    apiGet<{ venues: Venue[] }>("/api/venues")
      .then((res) => setVenues(res.venues))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load venues"));
  }
  useEffect(reload, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const venue = await apiPost<{ venue: Venue }>("/api/venues", {
        name,
        address,
        seatRows: seatRows.map((r) => ({ ...r, seatCount: Number(r.seatCount) })),
      });
      setSuccess(`Venue "${venue.venue.name}" created with ${venue.venue.seatCount} seats.`);
      setName("");
      setAddress("");
      setSeatRows([emptyRow()]);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create venue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeading subtitle="Create venues and their seat layouts.">Admin dashboard</PageHeading>

      <Card className="p-6 mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Create a venue</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input placeholder="Venue name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} required />

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Seat rows</p>
          <SeatRowsEditor seatRows={seatRows} setSeatRows={setSeatRows} />

          {error && <ErrorBanner>{error}</ErrorBanner>}
          {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Creating..." : "Create venue"}
          </Button>
        </form>
      </Card>

      <h2 className="font-semibold text-gray-900 mb-3">Venues ({venues.length})</h2>
      <div className="flex flex-col gap-3">
        {venues.length === 0 && <Card className="p-6 text-center text-gray-500">No venues yet.</Card>}
        {venues.map((v) => (
          <VenueCard key={v.id} venue={v} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}

function VenueCard({ venue, onChanged }: { venue: Venue; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [seatRows, setSeatRows] = useState<SeatRowForm[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddSeats(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await apiPost<{ venue: Venue }>(`/api/venues/${venue.id}/seats`, {
        seatRows: seatRows.map((r) => ({ ...r, seatCount: Number(r.seatCount) })),
      });
      setSuccess(`Added rows — venue now has ${res.venue.seatCount} seats.`);
      setSeatRows([emptyRow()]);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add seats");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 flex-wrap text-left"
      >
        <div>
          <h3 className="font-medium text-gray-900">{venue.name}</h3>
          <p className="text-sm text-gray-500">{venue.address}</p>
        </div>
        <div className="flex gap-1.5 items-center flex-wrap">
          <Badge tone="gray">{venue.seatCount} seats</Badge>
          {venue.categories.map((c) => (
            <Badge key={c} tone="indigo">
              {c}
            </Badge>
          ))}
        </div>
      </button>

      {expanded && (
        <form onSubmit={handleAddSeats} className="mt-4 pt-4 border-t border-gray-200 flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Add more rows (row labels must be new to this venue)
          </p>
          <SeatRowsEditor seatRows={seatRows} setSeatRows={setSeatRows} />
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}
          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? "Adding..." : "Add seats"}
          </Button>
        </form>
      )}
    </Card>
  );
}
