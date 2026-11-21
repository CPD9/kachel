import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { stillsFor, type InsideOf, type Still } from "./stills";

// three.js loads only when someone opens a building's inside.
const PlantRoom = lazy(() => import("./PlantRoom"));

const TITLE: Record<InsideOf, string> = {
  campus: "Inside: a plant room as it could sit in the campus basement",
  house: "Inside: the plant room of a Kachel house",
};

const NOTE: Record<InsideOf, string> = {
  campus:
    "Our concept in 3D, not the building's real basement: server rack, pump, plate heat exchanger, tank and backup heater.",
  house:
    "An illustration, the same for every fleet house: server rack, pump, plate heat exchanger, tank and backup heater.",
};

/** Keeps the stills on screen if the 3D view cannot start (no WebGL, or the model fails). */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <p role="alert" className="m-auto text-paper/70">
          The 3D plant room could not load in this browser. The stills below show it.
        </p>
      );
    return this.props.children;
  }
}

/**
 * A building's inside, over the map: the plant room in 3D (docs/models/plantroom.glb) and a
 * strip of our Blender stills (docs/media). Click a still to see it large; Escape closes.
 */
export default function InsideView({ of, onClose }: { of: InsideOf; onClose: () => void }) {
  const stills = stillsFor(of);
  const [open, setOpen] = useState<Still | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open !== null) setOpen(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inside"
      className="absolute inset-0 z-20 flex flex-col bg-[#0b0e14] text-paper"
    >
      <header className="flex items-start gap-4 px-6 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{TITLE[of]}</h2>
          <p className="text-sm text-paper/70">{NOTE[of]}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-heat px-3 py-1 text-sm font-medium text-ink"
        >
          Back to the map
        </button>
      </header>

      <section aria-label="Plant room in 3D" className="relative min-h-0 flex-1">
        <Fallback>
          <Suspense
            fallback={
              <p className="absolute inset-0 grid place-items-center">Loading the plant room…</p>
            }
          >
            <PlantRoom />
          </Suspense>
        </Fallback>
        {open === null ? (
          <p className="pointer-events-none absolute bottom-3 left-6 text-xs text-paper/60">
            Drag to turn, scroll to zoom. The walls in front step aside.
          </p>
        ) : (
          <figure className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b0e14] p-4">
            <img
              src={open.src}
              alt={open.caption}
              className="max-h-[calc(100%-3rem)] max-w-full rounded"
            />
            <figcaption className="flex items-center gap-4 text-sm text-paper/80">
              {open.caption}
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded border border-paper/40 px-2 py-0.5 text-xs hover:border-paper"
              >
                Back to 3D
              </button>
            </figcaption>
          </figure>
        )}
      </section>

      <footer className="px-6 pt-3 pb-4">
        <ul aria-label="Renders" className="flex gap-3 overflow-x-auto pb-1">
          {stills.map((s) => (
            <li key={s.src} className="w-60 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(s)}
                aria-pressed={open?.src === s.src}
                className="block w-full text-left"
              >
                <img
                  src={s.src}
                  alt={s.caption}
                  className={`aspect-video w-full rounded object-cover ring-2 ${open?.src === s.src ? "ring-heat" : "ring-transparent hover:ring-paper/40"}`}
                />
                <span className="mt-1 line-clamp-2 block text-xs text-paper/70">{s.caption}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-paper/50">
          Renders made in Blender for the pitch film; figures on screen come from the scheduler.
        </p>
      </footer>
    </div>
  );
}
