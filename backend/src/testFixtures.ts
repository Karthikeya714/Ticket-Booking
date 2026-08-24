// Shows must start in the future to be bookable (see services/showGuard.ts), so fixtures can't
// use `new Date()` — a show starting at this exact instant is already past by the time the
// request under test runs, and every hold would be rejected with SHOW_NOT_BOOKABLE.
export function futureShowDate(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
