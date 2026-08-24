// Render's free tier spins the backend down after inactivity; the first request after that can
// take 50+ seconds to come back. A plain skeleton during that gap looks indistinguishable from a
// broken page, so anything that takes unusually long (not just any in-flight request — normal
// requests shouldn't trigger this) flips a shared flag that <ColdStartOverlay /> renders against.

const SLOW_THRESHOLD_MS = 4000;

type Listener = (waking: boolean) => void;
const listeners = new Set<Listener>();
let slowCount = 0;

function notify(waking: boolean) {
  listeners.forEach((fn) => fn(waking));
}

export function onColdStartChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Wraps a promise-returning call: if it hasn't settled within SLOW_THRESHOLD_MS, notify listeners
// that a wake-up is (probably) in progress, then clear once it settles either way.
export function trackColdStart<T>(promise: Promise<T>): Promise<T> {
  let firedForThis = false;
  const timer = setTimeout(() => {
    firedForThis = true;
    slowCount += 1;
    if (slowCount === 1) notify(true);
  }, SLOW_THRESHOLD_MS);

  const settle = () => {
    clearTimeout(timer);
    if (firedForThis) {
      slowCount -= 1;
      if (slowCount === 0) notify(false);
    }
  };

  return promise.then(
    (value) => {
      settle();
      return value;
    },
    (err) => {
      settle();
      throw err;
    }
  );
}
