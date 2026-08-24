export type Role = "customer" | "organiser" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface EventSummary {
  id: string;
  title: string;
  type: "movie" | "concert";
  description: string;
  organiserName: string;
  upcomingShowCount: number;
  nextShowAt: string | null;
}

export interface ShowSummary {
  id: string;
  dateTime: string;
  venue: { name: string; address: string };
  pricing: { category: string; price: number }[];
}

export interface EventDetail {
  id: string;
  title: string;
  type: "movie" | "concert";
  description: string;
  organiserName: string;
  shows: ShowSummary[];
}

export interface ShowDetail {
  id: string;
  dateTime: string;
  status: string;
  event: { id: string; title: string; type: string };
  venue: { name: string; address: string };
  pricing: { category: string; price: number }[];
}

export type SeatStatus = "available" | "held" | "booked";

export interface SeatMapEntry {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  category: string;
  status: SeatStatus;
  price: number;
}

export interface HoldResult {
  holdId: string;
  showSeatId: string;
  expiresAt: string;
}

export interface HoldStatus {
  holdId: string;
  showSeatId: string;
  status: "active" | "expired" | "converted";
  expiresAt: string;
  remainingSeconds: number;
}

export interface Booking {
  id: string;
  bookingReference: string;
  status: "confirmed" | "cancelled";
  totalPrice: string;
  createdAt: string;
  show: {
    dateTime: string;
    event: { title: string };
    venue: { name: string };
  };
  bookingSeats: {
    showSeat: {
      seat: { rowLabel: string; seatNumber: number; category: string };
    };
  }[];
}

export interface WaitlistJoinResult {
  waitlistEntryId: string;
  position: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  seatCount: number;
  categories: string[];
}

export interface OrganiserEventSummary {
  id: string;
  title: string;
  type: "movie" | "concert";
  description: string;
  showCount: number;
  ticketsSold: number;
  totalRevenue: number;
}

export interface OrganiserShowSummary {
  id: string;
  dateTime: string;
  venue: { id: string; name: string; address: string };
  ticketsSold: number;
  bookingsCount: number;
  revenue: number;
}

export interface OrganiserEventDetail {
  id: string;
  title: string;
  type: "movie" | "concert";
  description: string;
  shows: OrganiserShowSummary[];
}

export interface WaitlistOfferDetail {
  id: string;
  status: "pending" | "accepted" | "expired";
  offerExpiresAt: string;
  remainingSeconds: number;
  seatLabel: string;
  category: string;
  eventTitle: string;
  venueName: string;
  dateTime: string;
}
