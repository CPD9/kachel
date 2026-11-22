import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuildingCard, type NotIn3D } from "./building/BuildingCard";
import { locate, lookUp, type BuildingFacts, type Located } from "./building/geoadmin";
import { latestOnly } from "./building/latest";
import { swissTime } from "./clock";
import { fleetHouse, type FleetHouse } from "./fleet/fleet";
import { Layers, useLayers } from "./networks/Layers";
import { Places } from "./Places";
import { NetworkCard } from "./networks/NetworkCard";
import type { Network } from "./networks/thermal";
import type { Scene } from "./scene/viewer";
import { CREDITS } from "./sources";
import type { InsideOf } from "./inside/stills";
import { standIn, TOUR_BUILDING, viewOf, type TourBuilding } from "./tour/steps";
import { TourBar } from "./tour/TourBar";

// three.js and the stills load only when someone opens a building's inside.
const InsideView = lazy(() => import("./inside/InsideView"));

export type StartScene = (container: HTMLElement) => Promise<Scene>;

/** How long the hand-over waits for tiles before deciding what stands in for the campus. */
const HANDOVER_TILES_MS = 8000;

/** The heat map: Basel in 3D at dusk, the day passing, with the sources always on screen. */
export function App({
  start,
  autoTour = false,
  tourCapMs,
  startEgid,
}: {
  start: StartScene;
  autoTour?: boolean;
  tourCapMs?: number | undefined;
  /** Open at this building with its card (`?egid=…&card=1`, the pitch app's hand-over). */
  startEgid?: number | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [playing, setPlaying] = useState(true);
  const [building, setBuilding] = useState<BuildingFacts | "loading" | null>(null);
  const [network, setNetwork] = useState<Network | null>(null);
  const [house, setHouse] = useState<FleetHouse | null>(null);
  /** The building is missing from swissBUILDINGS3D (FHNW campus): the card says what stands in. */
  const [notIn3D, setNotIn3D] = useState<NotIn3D>(false);
  /** The EGID of the building whose card is open, for its Inside button. */
  const [egid, setEgid] = useState<number | null>(null);
  const [inside, setInside] = useState<InsideOf | null>(null);
  const layers = useLayers(scene);
  // Only the latest card request may fill the card.
  const [requests] = useState(latestOnly);

  /** Opens the card for a building: by click, or by the tour. */
  const openBuilding = useCallback(
    (egid: number | null, lon: number, lat: number, ownModel = false) => {
      setNetwork(null);
      setHouse(fleetHouse(egid));
      setEgid(egid);
      setNotIn3D(ownModel ? "model" : false);
      setBuilding("loading");
      requests.run(lookUp({ egid, lon, lat }), setBuilding);
    },
    [requests],
  );

  const closeCards = useCallback(() => {
    requests.cancel();
    setBuilding(null);
    setNetwork(null);
    setNotIn3D(false);
  }, [requests]);

  const { setNetworksOn, setServersOn } = layers;
  const tourDeps = useMemo(
    () =>
      scene === null
        ? null
        : {
            scene,
            openBuilding: (b: TourBuilding) => openBuilding(b.egid, b.lon, b.lat),
            setNotIn3D,
            closeCards,
            setNetworksOn,
            setServersOn,
            ...(tourCapMs === undefined ? {} : { tilesCapMs: tourCapMs }),
          },
    [scene, openBuilding, closeCards, setNetworksOn, setServersOn, tourCapMs],
  );

  useEffect(() => {
    if (scene === null) return;
    return scene.onPick((picked) => {
      if (picked?.kind === "building") {
        openBuilding(
          picked.building.egid,
          picked.building.lon,
          picked.building.lat,
          picked.ownModel === true,
        );
        return;
      }
      closeCards();
      if (picked?.kind === "network") setNetwork(picked.network);
    });
  }, [scene, openBuilding, closeCards]);

  // The pitch app hands over here: find the building, fly to it, colour it and open its card. The
  // campus we know already: once the tiles are in, its block model (or a pin) stands in, as on the
  // tour. Any other building comes from the register and is coloured as a click colours it.
  useEffect(() => {
    if (scene === null || startEgid === undefined) return;
    let gone = false;
    // A click before the tiles are in takes over: the hand-over stops there.
    const stop = scene.onPick(() => {
      gone = true;
    });
    const campus = startEgid === TOUR_BUILDING.egid;
    const where: Promise<(Located & { name: string }) | null> = campus
      ? Promise.resolve(TOUR_BUILDING)
      : locate(startEgid).then((at) => (at === null ? null : { ...at, name: `EGID ${startEgid}` }));
    void where.then(async (b) => {
      if (gone || b === null) return;
      void scene.flyTo(viewOf(b, b.name), 3);
      openBuilding(startEgid, b.lon, b.lat);
      scene.highlightBuilding(startEgid);
      if (!campus) return;
      await Promise.race([
        scene.tilesLoaded(),
        new Promise((resolve) => setTimeout(resolve, HANDOVER_TILES_MS)),
      ]);
      if (!gone) setNotIn3D(standIn(scene, TOUR_BUILDING));
    });
    return () => {
      gone = true;
      stop();
    };
  }, [scene, startEgid, openBuilding]);

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

  // The plant room and renders: for the fleet's houses and for the campus, where we built this.
  const insideOf: InsideOf | null =
    house !== null ? "house" : egid === TOUR_BUILDING.egid ? "campus" : null;

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
          fleet={house}
          notIn3D={notIn3D}
          onInside={insideOf === null ? undefined : () => setInside(insideOf)}
          onClose={() => {
            setBuilding(null);
            // The orange belongs to the open card.
            scene?.highlightBuilding(null);
          }}
        />
      )}

      {network !== null && <NetworkCard network={network} onClose={() => setNetwork(null)} />}

      {scene !== null && <Layers {...layers} />}
      {tourDeps !== null && <TourBar deps={tourDeps} autoStart={autoTour} onPlaying={setPlaying} />}
      {scene !== null && <Places scene={scene} />}

      {inside !== null && (
        <Suspense fallback={null}>
          <InsideView of={inside} onClose={() => setInside(null)} />
        </Suspense>
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
