import { useEffect, useRef, useState } from "react";
import { BuildingCard } from "./building/BuildingCard";
import { lookUp, type BuildingFacts } from "./building/geoadmin";
import { swissTime } from "./clock";
import type { Scene } from "./scene/viewer";
import { CREDITS } from "./sources";

export type StartScene = (container: HTMLElement) => Promise<Scene>;

/** The heat map: Basel in 3D at dusk, the day passing, with the sources always on screen. */
export function App({ start }: { start: StartScene }) {
  const container = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [playing, setPlaying] = useState(true);
  const [building, setBuilding] = useState<BuildingFacts | "loading" | null>(null);

  useEffect(() => {
    if (scene === null) return;
    let latest = 0;
    return scene.onPick((picked) => {
      const call = ++latest;
      if (picked === null) {
        setBuilding(null);
        return;
      }
      setBuilding("loading");
      void lookUp(picked).then((facts) => {
        if (call === latest) setBuilding(facts);
      });
    });
  }, [scene]);

  useEffect(() => {
    const el = container.current;
    if (el === null) return;
    let live: Scene | null = null;
    let closed = false;
    start(el).then(
      (s) => {
        if (closed) s.destroy();
        else {
          live = s;
          setScene(s);
          setPlaying(s.playing());
        }
      },
      () => {
        if (!closed) setFailed(true);
      },
    );
    return () => {
      closed = true;
      live?.destroy();
    };
  }, [start]);

  useEffect(() => {
    if (scene === null) return;
    const tick = () => setTime(scene.time());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [scene]);

  const toggle = () => {
    if (scene === null) return;
    scene.setPlaying(!playing);
    setPlaying(!playing);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink text-paper">
      <div ref={container} className="absolute inset-0" data-testid="map" />

      <header className="pointer-events-none absolute top-4 left-4 max-w-sm rounded-lg bg-ink/70 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-semibold">Kachel</h1>
        <p className="text-sm text-paper/80">Where home servers could heat homes.</p>
      </header>

      <section
        aria-label="Time of day"
        className="absolute top-4 right-4 flex items-center gap-3 rounded-lg bg-ink/70 px-4 py-2 backdrop-blur"
      >
        <span className="font-mono text-lg tabular-nums" aria-live="off">
          {time === null ? "--:--" : swissTime(time)}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={scene === null}
          className="rounded bg-heat px-3 py-1 text-sm font-medium text-ink disabled:opacity-50"
        >
          {playing ? "Pause" : "Play"}
        </button>
      </section>

      {building !== null && (
        <BuildingCard
          facts={building}
          month={(time ?? new Date()).getMonth()}
          onClose={() => setBuilding(null)}
        />
      )}

      {failed && (
        <p
          role="alert"
          className="absolute inset-x-0 top-24 mx-auto w-fit rounded bg-ink px-4 py-2"
        >
          The 3D map could not start in this browser.
        </p>
      )}

      <footer className="absolute right-0 bottom-0 left-0 flex flex-wrap gap-x-4 bg-ink/70 px-3 py-1 text-xs text-paper/80">
        {CREDITS.map((c) => (
          <a
            key={c.label}
            href={c.href}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {c.label}
          </a>
        ))}
        <span>Source: BFS GWR</span>
        <span>Source: SFOE</span>
        <span className="ml-auto">
          Click a building. Lit windows are an illustration, not data.
        </span>
      </footer>
    </main>
  );
}
