import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Gamepad2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** One full turn every this many seconds. */
const SECONDS_PER_REVOLUTION = 120;
/** Above this zoom the globe stops spinning. */
const MAX_SPIN_ZOOM = 5;
/** Between this zoom and MAX_SPIN_ZOOM the spin slows down. */
const SLOW_SPIN_ZOOM = 3;

/** The presenter's home, hard-coded for the demo: [lng, lat]. */
const HOME: [number, number] = [7.58215, 47.55212];
/** A neighbour who games on the rack at HOME (like the mall in baselhack_2026_adobe). */
export const GAMER: [number, number] = [7.581800279272595, 47.55543369350158];
export const GAMER_COLOR = "#8b5cf6";

// Timeline, like baselhack_2026_adobe's GlobeView: spin, fly to the city, then dive at the building
/** How long the globe spins before flying in (GLOBE_INTRO_MS in baselhack_2026_adobe). */
const SPIN_MS = 500;
/** Globe → city overview, flat. */
const CITY_CAMERA = { center: HOME, zoom: 14.25, pitch: 0, bearing: 0 };
const CITY_FLY_MS = 2500;
/** Pause over the city before diving in. */
const CITY_HOLD_MS = 1000;
/** City → the building, tilted so the 3D blocks show. */
const HOME_CAMERA = { center: HOME, zoom: 18.2, pitch: 60, bearing: -25 };
const HOME_FLY_MS = 3000;
/** Pressing "a": dive at the building, steep and close, before the 3D house takes over. */
const INSIDE_CAMERA = { center: HOME, zoom: 19.8, pitch: 72, bearing: -25 };
export const INSIDE_DIVE_MS = 1400;
/** On to the gamer: looking south, so their building is up front and HOME behind it. */
const GAMER_CAMERA = {
  center: [GAMER[0] * 0.75 + HOME[0] * 0.25, GAMER[1] * 0.75 + HOME[1] * 0.25] as [number, number],
  zoom: 17,
  pitch: 58,
  bearing: 165,
};
const GAMER_FLY_MS = 3000;
const GAMER_RISE_MS = 1400;
const GAMER_BUILDING = "gamer-building";
const LINK = "rack-link";

const BUILDINGS = "3d-buildings";
const HOME_BUILDING = "home-building";
const HOME_COLOR = "#ea580c";
const EXTRUDED: mapboxgl.FilterSpecification = ["==", ["get", "extrude"], "true"];

/** Grey 3D buildings from zoom 15, under the labels. */
function add3dBuildings(map: mapboxgl.Map) {
  if (map.getLayer(BUILDINGS)) return;
  const labels = map
    .getStyle()
    ?.layers?.find((l) => l.type === "symbol" && l.layout && "text-field" in l.layout)?.id;
  map.addLayer(
    {
      id: BUILDINGS,
      source: "composite",
      "source-layer": "building",
      filter: EXTRUDED,
      type: "fill-extrusion",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#3a3a3c",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "min_height"],
        ],
        "fill-extrusion-opacity": 1,
      },
    },
    labels,
  );
}

/** Ray-casting test: is [lng, lat] inside the ring? */
function inRing([x, y]: [number, number], ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inGeometry(pt: [number, number], geometry: GeoJSON.Geometry): boolean {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  // Inside the outer ring and outside every hole
  return polygons.some(
    ([outer = [], ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)),
  );
}

/**
 * The id of the building whose footprint contains HOME. Uses the source footprints rather than
 * the rendered pixels: at a steep pitch, the pixel above HOME's ground point is covered by the
 * wall of whatever building stands in front of it.
 */
function findBuildingId(map: mapboxgl.Map, point: [number, number]): string | number | undefined {
  const features = map.querySourceFeatures("composite", {
    sourceLayer: "building",
    filter: EXTRUDED,
  });
  const withId = features.filter((f) => f.id !== undefined);
  const containing = withId.find((f) => inGeometry(point, f.geometry));
  if (containing) return containing.id;
  // HOME sits on a street or courtyard: fall back to the building with the closest corner
  let best: { id: string | number | undefined; d: number } = { id: undefined, d: Infinity };
  for (const f of withId) {
    const g = f.geometry;
    const rings =
      g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
    for (const [x = Infinity, y = Infinity] of rings.flat()) {
      const d = (x - point[0]) ** 2 + (y - point[1]) ** 2;
      if (d < best.d) best = { id: f.id, d };
    }
  }
  return best.id;
}

/** Buildings drawn by their own layer, kept out of the grey one so the walls don't z-fight. */
const excluded = new WeakMap<mapboxgl.Map, Set<string | number>>();
function exclude(map: mapboxgl.Map, id: string | number, on: boolean) {
  const ids = excluded.get(map) ?? new Set();
  if (on) ids.add(id);
  else ids.delete(id);
  excluded.set(map, ids);
  if (!map.getLayer(BUILDINGS)) return;
  map.setFilter(BUILDINGS, ["all", EXTRUDED, ["!", ["in", ["id"], ["literal", [...ids]]]]]);
}

/**
 * The gamer's building rises out of the ground in violet, with a glowing fibre line back to
 * HOME. Returns the building's height (for the roof tag) and a cleanup.
 */
function raiseGamer(map: mapboxgl.Map): { height: number; cleanup: () => void } | null {
  const id = findBuildingId(map, GAMER);
  if (id === undefined || map.getLayer(GAMER_BUILDING)) return null;
  const feature = map
    .querySourceFeatures("composite", { sourceLayer: "building", filter: ["==", ["id"], id] })
    .at(0);
  const height = Number(feature?.properties?.["height"] ?? 15);
  exclude(map, id, true);
  map.addLayer({
    id: GAMER_BUILDING,
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    filter: ["==", ["id"], id],
    paint: {
      "fill-extrusion-color": GAMER_COLOR,
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-height": ["get", "min_height"],
      "fill-extrusion-opacity": 1,
    },
  });
  // The fibre between the two buildings: a wide soft glow and a bright dashed core
  map.addSource(LINK, {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [HOME, GAMER] },
    },
  });
  map.addLayer({
    id: `${LINK}-glow`,
    type: "line",
    source: LINK,
    paint: { "line-color": GAMER_COLOR, "line-width": 14, "line-blur": 10, "line-opacity": 0.6 },
  });
  map.addLayer({
    id: LINK,
    type: "line",
    source: LINK,
    layout: { "line-cap": "round" },
    paint: { "line-color": "#fbbf24", "line-width": 3, "line-dasharray": [1, 2] },
  });
  // Rise with an ease-out, like the mall in baselhack_2026_adobe
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    if (!map.getLayer(GAMER_BUILDING)) return;
    const t = Math.min(1, (now - start) / GAMER_RISE_MS);
    const k = 1 - (1 - t) ** 3;
    map.setPaintProperty(GAMER_BUILDING, "fill-extrusion-height", [
      "+",
      ["get", "min_height"],
      ["*", ["-", ["get", "height"], ["get", "min_height"]], k],
    ]);
    if (t < 1) frame = requestAnimationFrame(tick);
  });
  return {
    height,
    cleanup: () => {
      cancelAnimationFrame(frame);
      for (const layer of [GAMER_BUILDING, LINK, `${LINK}-glow`])
        if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(LINK)) map.removeSource(LINK);
      exclude(map, id, false);
    },
  };
}

const EARTH_M = 40075016.686;

/**
 * A glowing tag floating on the gamer's roof (as on baselhack_2026_adobe's mall): project the
 * ground point, lift it by the building's height in pixels, every frame.
 */
function Beacon({ map, height }: { map: mapboxgl.Map; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const [lng, lat] = GAMER;
    const place = () => {
      if (!ref.current) return;
      const p = map.project([lng, lat]);
      const pxPerMeter = (512 * 2 ** map.getZoom()) / (EARTH_M * Math.cos((lat * Math.PI) / 180));
      const lift = height * pxPerMeter * Math.sin((map.getPitch() * Math.PI) / 180);
      ref.current.style.transform = `translate(${p.x}px, ${p.y - lift - 14}px) translate(-50%, -100%)`;
    };
    place();
    map.on("render", place);
    return () => {
      map.off("render", place);
    };
  }, [map, height]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 flex animate-pill-in flex-col items-center font-sans"
    >
      <span className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1b1d21]/90 py-1.5 pr-3.5 pl-1.5 text-sm font-medium whitespace-nowrap text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <span
          className="grid size-6 place-items-center rounded-full"
          style={{ background: GAMER_COLOR }}
        >
          <Gamepad2 size={13} />
        </span>
        Noah · plays on your rack
      </span>
      <span
        className="h-5 w-px"
        style={{ background: `linear-gradient(${GAMER_COLOR}, transparent)` }}
      />
      <span className="relative flex size-3">
        <span
          className="absolute inset-0 animate-ping rounded-full"
          style={{ background: GAMER_COLOR }}
        />
        <span
          className="size-3 rounded-full ring-2 ring-white/70"
          style={{ background: GAMER_COLOR }}
        />
      </span>
    </div>
  );
}

/**
 * Replace the building under HOME with a solid coloured block: take it out of the grey layer
 * and draw it again in HOME_COLOR. Returns false if no building has loaded there yet.
 */
function highlightHome(map: mapboxgl.Map): boolean {
  if (map.getLayer(HOME_BUILDING)) return true;
  const id = findBuildingId(map, HOME);
  if (id === undefined) return false;

  exclude(map, id, true);
  map.addLayer({
    id: HOME_BUILDING,
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    filter: ["==", ["id"], id],
    paint: {
      "fill-extrusion-color": HOME_COLOR,
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 1,
    },
  });
  return true;
}

/** Where the camera has got to: Basel in view, then the home building lit up. */
export type Stage = "city" | "building";

/**
 * A dark Mapbox globe that spins for a moment, flies to Basel and dives at the presenter's
 * home, which rises as a solid orange block. onStage reports each step as it lands.
 */
export function Globe({
  token,
  onStage,
  inside = false,
  gamer = false,
  onGamer,
}: {
  token: string;
  onStage?: (stage: Stage) => void;
  /** Diving into the building (true) or back out to the street view (false). */
  inside?: boolean;
  /** Off to the neighbour who games on the rack (true), or back home (false). */
  gamer?: boolean;
  /** The gamer's building has risen: time for its cards. */
  onGamer?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Latest callback without re-running the map effect
  const onStageRef = useRef(onStage);
  const onGamerRef = useRef(onGamer);
  useEffect(() => {
    onStageRef.current = onStage;
    onGamerRef.current = onGamer;
  });
  // Set once the gamer's building has risen, for the roof tag
  const [gamerTag, setGamerTag] = useState<{ map: mapboxgl.Map; height: number } | null>(null);

  useEffect(() => {
    if (container.current === null) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: "globe",
      zoom: 1.8,
      center: [8, 25],
    });
    mapRef.current = map;

    let spinning = true;
    let userInteracting = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const spin = () => {
      const zoom = map.getZoom();
      if (!spinning || userInteracting || zoom >= MAX_SPIN_ZOOM) return;
      let degreesPerSecond = 360 / SECONDS_PER_REVOLUTION;
      if (zoom > SLOW_SPIN_ZOOM) {
        degreesPerSecond *= (MAX_SPIN_ZOOM - zoom) / (MAX_SPIN_ZOOM - SLOW_SPIN_ZOOM);
      }
      const center = map.getCenter();
      center.lng -= degreesPerSecond;
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    };

    const pause = () => {
      userInteracting = true;
    };
    const resume = () => {
      userInteracting = false;
      spin();
    };

    const diveHome = () => {
      add3dBuildings(map);
      map.flyTo({ ...HOME_CAMERA, duration: HOME_FLY_MS, essential: true });
      // Wait for the zoomed-in building tiles to render before looking up the building
      map.once("moveend", () => {
        const tryHighlight = () => {
          if (highlightHome(map)) onStageRef.current?.("building");
          else map.once("idle", tryHighlight);
        };
        map.once("idle", tryHighlight);
      });
    };

    const flyToCity = () => {
      spinning = false;
      map.flyTo({ ...CITY_CAMERA, duration: CITY_FLY_MS, essential: true });
      // Registered after flyTo, so the interrupted spin animation's moveend doesn't count
      map.once("moveend", () => {
        onStageRef.current?.("city");
        timers.push(setTimeout(diveHome, CITY_HOLD_MS));
      });
    };

    map.on("style.load", () => {
      map.setFog({
        color: "rgb(10, 20, 30)",
        "high-color": "rgb(20, 30, 50)",
        "horizon-blend": 0.1,
        "space-color": "rgb(5, 5, 12)",
        "star-intensity": 0.4,
      });
    });
    map.on("mousedown", pause);
    map.on("dragstart", pause);
    map.on("touchstart", pause);
    map.on("mouseup", resume);
    map.on("dragend", resume);
    map.on("touchend", resume);
    map.on("moveend", spin);
    map.on("load", () => {
      spin();
      timers.push(setTimeout(flyToCity, SPIN_MS));
    });

    return () => {
      timers.forEach(clearTimeout);
      mapRef.current = null;
      map.remove();
    };
  }, [token]);

  // Into the building and back out again (only after we've been inside, not on first load).
  // Leaving the house for the gamer is handled below.
  const wasInside = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (inside) map.flyTo({ ...INSIDE_CAMERA, duration: INSIDE_DIVE_MS, essential: true });
    else if (wasInside.current && !gamer)
      map.flyTo({ ...HOME_CAMERA, duration: INSIDE_DIVE_MS, essential: true });
    wasInside.current = inside;
  }, [inside, gamer]);

  // On to the gamer: fly across, then their building rises and the fibre lights up
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gamer) return;
    add3dBuildings(map);
    map.flyTo({ ...GAMER_CAMERA, duration: GAMER_FLY_MS, essential: true });
    let cleanup: (() => void) | undefined;
    // Building tiles may still be loading: try on the next few idles, then show the cards anyway
    let tries = 0;
    const onIdle = () => {
      const raised = raiseGamer(map);
      if (raised) {
        cleanup = raised.cleanup;
        setGamerTag({ map, height: raised.height });
      } else if (++tries < 3) return void map.once("idle", onIdle);
      onGamerRef.current?.();
    };
    const onArrive = () => map.once("idle", onIdle);
    map.once("moveend", onArrive);
    return () => {
      map.off("moveend", onArrive);
      map.off("idle", onIdle);
      cleanup?.();
      setGamerTag(null);
    };
  }, [gamer]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {gamerTag && <Beacon map={gamerTag.map} height={gamerTag.height} />}
    </div>
  );
}
