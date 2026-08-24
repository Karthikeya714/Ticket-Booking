import { useEffect, useState } from "react";
import { onColdStartChange } from "../api/coldStart";

// Only mounts its visible content once a request has actually been slow for a while (see
// coldStart.ts's threshold) — so this never flashes on a normal, fast request.
export function ColdStartOverlay() {
  const [waking, setWaking] = useState(false);

  useEffect(() => onColdStartChange(setWaking), []);

  if (!waking) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="max-w-sm w-full rounded-2xl bg-white shadow-xl shadow-black/20 p-8 text-center">
        <div className="relative mx-auto mb-5 w-16 h-16">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 animate-ping opacity-30" />
          <div className="relative grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-3xl shadow-lg shadow-violet-500/30">
            🎟️
          </div>
        </div>
        <h2 className="font-display text-lg font-extrabold text-slate-900 mb-1.5">Waking up the server&hellip;</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          This app runs on free hosting that sleeps after a while without visitors. It's booting back
          up now — this can take up to a minute the first time, then it'll be fast again.
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-5">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
