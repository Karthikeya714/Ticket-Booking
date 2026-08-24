import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { env } from "./env";

let io: SocketIOServer | null = null;

function showRoom(showId: string): string {
  return `show:${showId}`;
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigin },
  });

  io.on("connection", (socket) => {
    socket.on("join-show", (showId: unknown) => {
      if (typeof showId === "string") socket.join(showRoom(showId));
    });
    socket.on("leave-show", (showId: unknown) => {
      if (typeof showId === "string") socket.leave(showRoom(showId));
    });
  });

  return io;
}

export type BroadcastSeatStatus = "available" | "held" | "booked";

// Called after a transaction commits (never from inside one — a rollback must not be followed
// by a broadcast of state that never actually took effect). `io` is null when the server hasn't
// called initSocketIO (e.g. in tests, which exercise the HTTP/service layer directly), so this
// is a safe no-op rather than a crash in that context.
export function broadcastSeatStatusChanged(showId: string, seatId: string, status: BroadcastSeatStatus): void {
  io?.to(showRoom(showId)).emit("seat_status_changed", { seatId, status });
}
