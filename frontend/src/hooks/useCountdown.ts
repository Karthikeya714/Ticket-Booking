import { useEffect, useState } from "react";

// Counts down from an initial server-reported value, ticking client-side every second so the UI
// doesn't need to poll continuously — but the initial number always comes from the server
// (`remainingSeconds` on the hold/offer response), avoiding client/server clock skew.
export function useCountdown(initialSeconds: number): number {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds > 0]);

  return seconds;
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
