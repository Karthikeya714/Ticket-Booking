import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import type { SeatStatus } from "../api/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;
function getSocket(): Socket {
  if (!socket) socket = io(API_URL, { transports: ["websocket"] });
  return socket;
}

// Joins the given show's room for the lifetime of the component, and calls onSeatStatusChanged
// for every live update — the caller merges these into its own seat map state rather than
// refetching, so the grid updates instantly without a page refresh.
export function useSeatMapSocket(showId: string, onSeatStatusChanged: (seatId: string, status: SeatStatus) => void) {
  useEffect(() => {
    const s = getSocket();
    s.emit("join-show", showId);

    const handler = (payload: { seatId: string; status: SeatStatus }) => {
      onSeatStatusChanged(payload.seatId, payload.status);
    };
    s.on("seat_status_changed", handler);

    return () => {
      s.off("seat_status_changed", handler);
      s.emit("leave-show", showId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);
}
