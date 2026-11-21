import type { Scene } from "./scene/viewer";
import { STEPS } from "./places";

/** Buttons that fly from Basel out to Bern, Switzerland, its neighbours and the globe. */
export function Places({ scene }: { scene: Scene }) {
  return (
    <nav
      aria-label="Places"
      className="absolute top-20 right-4 flex flex-col gap-1 rounded-lg bg-ink/70 p-2 text-sm backdrop-blur"
    >
      {STEPS.map((view) => (
        <button
          key={view.name}
          type="button"
          onClick={() => void scene.flyTo(view, view.height > 100_000 ? 4 : 3)}
          className="rounded px-3 py-1 text-left hover:bg-paper/10"
        >
          {view.name}
        </button>
      ))}
    </nav>
  );
}
