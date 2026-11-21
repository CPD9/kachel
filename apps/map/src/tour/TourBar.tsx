import { useEffect, useMemo, useState } from "react";
import { tourSteps, type TourDeps } from "./steps";
import { createTour, type TourState } from "./tour";

/**
 * The stage tour's controls: one Tour button, then the step's caption with Pause or Resume and
 * Stop. The map's clock holds during the tour; the tour sets the time at each stop.
 */
export function TourBar({
  deps,
  autoStart,
  onPlaying,
}: {
  deps: TourDeps;
  autoStart: boolean;
  onPlaying: (on: boolean) => void;
}) {
  const [state, setState] = useState<TourState>({ kind: "idle" });
  // The page passes stable callbacks (useCallback/useMemo), so the tour is made once.
  const tour = useMemo(() => createTour(tourSteps(deps), setState), [deps]);

  const start = () => {
    onPlaying(false);
    void tour.start();
  };
  // ?tour=1: start once the map is up. In development React runs effects twice; the second
  // start replaces the first run, which stops itself.
  useEffect(() => {
    if (!autoStart) return;
    onPlaying(false);
    void tour.start();
    return () => tour.stop();
  }, [autoStart, tour, onPlaying]);
  useEffect(() => () => tour.stop(), [tour]);

  const setPaused = (paused: boolean) => {
    if (paused) tour.pause();
    else tour.resume();
  };

  const active = state.kind === "running" || state.kind === "paused";
  return (
    <section
      aria-label="Tour"
      className="absolute top-4 left-1/2 flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg bg-ink/80 px-4 py-2 text-sm backdrop-blur"
    >
      {active ? (
        <>
          <span aria-live="polite">{state.caption}</span>
          <button
            type="button"
            onClick={() => setPaused(state.kind === "running")}
            className="rounded bg-heat px-3 py-1 font-medium text-ink"
          >
            {state.kind === "running" ? "Pause tour" : "Resume tour"}
          </button>
          <button
            type="button"
            onClick={() => {
              tour.resume();
              tour.stop();
            }}
            className="rounded px-2 py-1 text-paper/80 hover:text-paper"
          >
            Stop
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          className="rounded bg-heat px-3 py-1 font-medium text-ink"
        >
          {state.kind === "done" ? "Tour again" : "Tour"}
        </button>
      )}
    </section>
  );
}
