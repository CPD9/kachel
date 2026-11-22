import type { Scene } from "./scene/viewer";
import { STEPS } from "./views";

/** Buttons that fly from Basel out to Bern, Switzerland, its neighbours and the globe. */
export function Places({ scene }: { scene: Scene }) {
  return (
    <nav
      aria-label="Places"
      className="absolute top-20 right-4 flex flex-col gap-1 rounded-lg bg-ink/70 p-2 text-sm backdrop-blur max-md:top-[6.5rem] max-md:right-2 max-md:left-2 max-md:flex-row max-md:overflow-x-auto max-md:p-1 max-md:[scrollbar-width:none]"
    >
      {STEPS.map((view) => (
        <button
          key={view.name}
          type="button"
          onClick={() => void scene.flyTo(view, view.height > 100_000 ? 4 : 3)}
          className="rounded px-3 py-1 text-left hover:bg-paper/10 max-md:min-h-10 max-md:shrink-0"
        >
          {view.name}
        </button>
      ))}
    </nav>
  );
}
