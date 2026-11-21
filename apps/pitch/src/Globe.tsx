import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Flame, Globe2, Plus, Zap } from "lucide-react";
import { HOME, NEIGHBOURS } from "./neighbours";
import type { MarketPin } from "./MarketView";
import { REMOTE_COLOR, REMOTE_FROM, type SimView } from "./simulation";

/** One full turn every this many seconds. */
const SECONDS_PER_REVOLUTION = 120;
/** Above this zoom the globe stops spinning. */
const MAX_SPIN_ZOOM = 5;
/** Between this zoom and MAX_SPIN_ZOOM the spin slows down. */
const SLOW_SPIN_ZOOM = 3;

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
/**
 * On to a neighbour: looking from their building towards HOME, so they're up front and HOME
 * behind, with the other neighbours around.
 */
function neighbourCamera([lng, lat]: [number, number]) {
  const dx = (HOME[0] - lng) * Math.cos((lat * Math.PI) / 180);
  const dy = HOME[1] - lat;
  return {
    center: [lng * 0.75 + HOME[0] * 0.25, lat * 0.75 + HOME[1] * 0.25] as [number, number],
    zoom: 16.7,
    pitch: 58,
    bearing: (Math.atan2(dx, dy) * 180) / Math.PI,
  };
}
/** The simulation: pulled back over HOME and every neighbour, slowly orbiting. */
const OVERVIEW_CAMERA = {
  center: [
    (HOME[0] + NEIGHBOURS.reduce((s, n) => s + n.at[0], 0)) / (NEIGHBOURS.length + 1),
    (HOME[1] + NEIGHBOURS.reduce((s, n) => s + n.at[1], 0)) / (NEIGHBOURS.length + 1),
  ] as [number, number],
  zoom: 15.9,
  pitch: 55,
  bearing: -20,
};
/** Degrees per frame while orbiting. */
const ORBIT_SPEED = 0.03;
const NEIGHBOUR_FLY_MS = 3000;
const SWITCH_FLY_MS = 1800;
const NEIGHBOUR_BUILDINGS = "neighbour-buildings";
const LINK = "rack-link";
const REMOTE_LINK = "remote-link";
/** Where the far-away line's tag sits: this far from HOME along the line, in metres. */
const REMOTE_TAG_M = 520;
const REMOTE_TAG_AT: [number, number] = (() => {
  const [lng, lat] = HOME;
  const dx = (REMOTE_FROM[0] - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const dy = (REMOTE_FROM[1] - lat) * 110_540;
  const t = REMOTE_TAG_M / Math.hypot(dx, dy);
  return [lng + (REMOTE_FROM[0] - lng) * t, lat + (REMOTE_FROM[1] - lat) * t];
})();

const BUILDINGS = "3d-buildings";
const HOME_BUILDING = "home-building";
const HOME_COLOR = "#ea580c";
/** The city's plain grey buildings. */
const BUILDING_COLOR = "#3a3a3c";
const EXTRUDED: mapboxgl.FilterSpecification = ["==", ["get", "extrude"], "true"];
const FOG: mapboxgl.FogSpecification = {
  color: "rgb(10, 20, 30)",
  "high-color": "rgb(20, 30, 50)",
  "horizon-blend": 0.1,
  "space-color": "rgb(5, 5, 12)",
  "star-intensity": 0.4,
};

/** The sky in the simulation: icy blue when it's cold, a warm haze in summer. */
function weatherFog(temp: number): mapboxgl.FogSpecification {
  const k = Math.min(1, Math.max(0, (temp + 10) / 40));
  const mix = (a: number[], b: number[]) =>
    `rgb(${a.map((x, i) => Math.round(x + ((b[i] ?? x) - x) * k)).join(", ")})`;
  return {
    color: mix([30, 52, 88], [92, 50, 20]),
    "high-color": mix([40, 70, 120], [120, 70, 30]),
    "horizon-blend": 0.2,
    "space-color": "rgb(5, 5, 12)",
    "star-intensity": 0.15,
  };
}

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
        "fill-extrusion-color": BUILDING_COLOR,
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

/** The lit-up neighbours on the map: pick one, pull more in as tiles load, and clean up. */
type Raised = {
  /** Building heights by neighbour index, for the roof tags. */
  heights: Record<number, number>;
  /** HOME's building height, for its tag in the simulation. */
  home: number;
  /** Light up these neighbours; the rest stay dim. */
  select: (on: number[]) => void;
  /** Look again for neighbours whose building hadn't loaded; true if any was found. */
  resolve: () => boolean;
  /** Blend the neighbours back into the city (plain grey, no lines), or light them up again. */
  hide: (hidden: boolean) => void;
  cleanup: () => void;
};

/**
 * Every neighbour's building is highlighted as a solid block in its colour (bright for the picked one,
 * dim for the rest), each with a fibre line back to HOME; the picked line glows with a bright
 * dashed core. Null if none of the buildings has loaded yet.
 */
function raiseNeighbours(map: mapboxgl.Map, selected: number): Raised | null {
  const ids = new Map<number, string | number>();
  const heights: Record<number, number> = {};
  let current = new Set([selected]);
  let hidden = false;
  const homeId = findBuildingId(map, HOME);
  const homeFeature =
    homeId === undefined
      ? undefined
      : map
          .querySourceFeatures("composite", {
            sourceLayer: "building",
            filter: ["==", ["id"], homeId],
          })
          .at(0);

  const resolve = () => {
    let found = false;
    NEIGHBOURS.forEach((n, i) => {
      if (ids.has(i)) return;
      const id = findBuildingId(map, n.at);
      // Two neighbours on one building would break the colour match
      if (id === undefined || [...ids.values()].includes(id)) return;
      const f = map
        .querySourceFeatures("composite", { sourceLayer: "building", filter: ["==", ["id"], id] })
        .at(0);
      ids.set(i, id);
      heights[i] = Number(f?.properties?.["height"] ?? 15);
      exclude(map, id, true);
      found = true;
    });
    if (found && map.getLayer(NEIGHBOUR_BUILDINGS)) paint();
    return found;
  };

  const paint = () => {
    const all = [...ids.values()];
    map.setFilter(NEIGHBOUR_BUILDINGS, ["in", ["id"], ["literal", all]]);
    const pairs = [...ids].flatMap(([i, id]) => {
      const n = NEIGHBOURS[i];
      return n ? [id, current.has(i) ? n.color : n.dim] : [];
    });
    map.setPaintProperty(
      NEIGHBOUR_BUILDINGS,
      "fill-extrusion-color",
      hidden
        ? BUILDING_COLOR
        : pairs.length
          ? (["match", ["id"], ...pairs, "#555"] as mapboxgl.ExpressionSpecification)
          : "#555",
    );
    for (const layer of [LINK, `${LINK}-glow`, `${LINK}-others`])
      if (map.getLayer(layer))
        map.setLayoutProperty(layer, "visibility", hidden ? "none" : "visible");
    const source = map.getSource<mapboxgl.GeoJSONSource>(LINK);
    source?.setData({
      type: "FeatureCollection",
      features: NEIGHBOURS.map((n, i) => ({
        type: "Feature",
        properties: { on: current.has(i), color: n.color },
        geometry: { type: "LineString", coordinates: [HOME, n.at] },
      })),
    });
  };

  resolve();
  if (ids.size === 0) return null;

  map.addLayer({
    id: NEIGHBOUR_BUILDINGS,
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    filter: ["in", ["id"], ["literal", []]],
    paint: {
      "fill-extrusion-color": "#555",
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 1,
    },
  });
  // The fibre from each neighbour to HOME: faint for the others, glowing for the picked one
  map.addSource(LINK, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: `${LINK}-others`,
    type: "line",
    source: LINK,
    filter: ["!", ["get", "on"]],
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.45 },
  });
  map.addLayer({
    id: `${LINK}-glow`,
    type: "line",
    source: LINK,
    filter: ["get", "on"],
    paint: {
      "line-color": ["get", "color"],
      "line-width": 14,
      "line-blur": 10,
      "line-opacity": 0.6,
    },
  });
  map.addLayer({
    id: LINK,
    type: "line",
    source: LINK,
    filter: ["get", "on"],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#fbbf24", "line-width": 3, "line-dasharray": [1, 2] },
  });
  paint();

  return {
    heights,
    home: Number(homeFeature?.properties?.["height"] ?? 12),
    select: (on) => {
      current = new Set(on);
      paint();
    },
    resolve,
    hide: (on) => {
      hidden = on;
      paint();
    },
    cleanup: () => {
      for (const layer of [NEIGHBOUR_BUILDINGS, LINK, `${LINK}-glow`, `${LINK}-others`])
        if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(LINK)) map.removeSource(LINK);
      for (const id of ids.values()) exclude(map, id, false);
    },
  };
}

const EARTH_M = 40075016.686;

/**
 * Something floating on a roof (as on baselhack_2026_adobe's mall): project the ground point,
 * lift it by the building's height in pixels, every frame.
 */
function OnRoof({
  map,
  at: [lng, lat],
  height,
  front = false,
  children,
}: {
  map: mapboxgl.Map;
  at: [number, number];
  height: number;
  front?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
  }, [map, lng, lat, height]);
  return (
    // The animation moves its own transform, so it sits inside the positioned wrapper
    <div ref={ref} className={`absolute top-0 left-0 ${front ? "z-10" : ""}`}>
      {children}
    </div>
  );
}

/** The picked neighbour's roof tag: "Noah · plays on your rack". */
function Beacon({ i }: { i: number }) {
  const n = NEIGHBOURS[i];
  if (!n) return null;
  const Icon = n.icon;
  return (
    <div className="pointer-events-none flex animate-pill-in flex-col items-center font-sans">
      <span className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1b1d21]/90 py-1.5 pr-3.5 pl-1.5 text-sm font-medium whitespace-nowrap text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <span
          className="grid size-6 place-items-center rounded-full"
          style={{ background: n.color }}
        >
          <Icon size={13} />
        </span>
        {n.tag}
      </span>
      <span
        className="h-5 w-px"
        style={{ background: `linear-gradient(${n.color}, transparent)` }}
      />
      <span className="relative flex size-3">
        <span
          className="absolute inset-0 animate-ping rounded-full"
          style={{ background: n.color }}
        />
        <span
          className="size-3 rounded-full ring-2 ring-white/70"
          style={{ background: n.color }}
        />
      </span>
    </div>
  );
}

/** In the simulation: each neighbour's live load, or a button to sign them up. */
function SimChip({
  i,
  kw,
  signed,
  onToggle,
}: {
  i: number;
  kw: number;
  signed: boolean;
  onToggle: (i: number) => void;
}) {
  const n = NEIGHBOURS[i];
  if (!n) return null;
  const Icon = n.icon;
  return (
    <button
      onClick={() => onToggle(i)}
      title={signed ? `Take ${n.name} out` : `Sign ${n.name} up`}
      className="group flex animate-pill-in flex-col items-center font-sans"
    >
      <span
        className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[11px] font-semibold whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-md transition-transform group-hover:scale-105 ${
          signed
            ? "border-white/15 bg-[#1b1d21]/90 text-white"
            : "border-dashed border-white/25 bg-[#1b1d21]/60 text-white/55"
        }`}
      >
        <span
          className="grid size-5 place-items-center rounded-full"
          style={{ background: signed ? n.color : n.dim }}
        >
          <Icon size={11} />
        </span>
        {signed ? (
          <>
            <Zap size={10} className="text-amber-300" />
            <span className="tabular-nums">{kw.toFixed(1)} kW</span>
          </>
        ) : (
          <>
            <Plus size={11} /> Sign up
          </>
        )}
      </span>
      <span className="h-3 w-px bg-white/30" />
    </button>
  );
}

/** In the simulation: the rack at HOME and the heat it gives off right now. */
function HomeTag({ kw, temp }: { kw: number; temp: number }) {
  return (
    <div className="pointer-events-none flex animate-pill-in flex-col items-center font-sans">
      <span className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1b1d21]/90 py-1.5 pr-3.5 pl-1.5 text-sm font-medium whitespace-nowrap text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <span className="grid size-6 place-items-center rounded-full bg-clay">
          <Flame size={13} />
        </span>
        Your rack
        <span className="text-clay tabular-nums">{kw.toFixed(1)} kW of heat</span>
        <span className="text-white/45 tabular-nums">· {temp.toFixed(0)} °C outside</span>
      </span>
      <span className="h-5 w-px bg-gradient-to-b from-clay to-transparent" />
      <span className="relative flex size-3">
        <span className="absolute inset-0 animate-ping rounded-full bg-clay" />
        <span className="size-3 rounded-full bg-clay ring-2 ring-white/70" />
      </span>
    </div>
  );
}

/** In the simulation: the work coming in from far away, on its line into HOME. */
function RemoteTag({ kw }: { kw: number }) {
  return (
    <div className="pointer-events-none flex animate-pill-in flex-col items-center font-sans">
      <span
        className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[11px] font-semibold whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-md ${
          kw > 0.05
            ? "border-white/15 bg-[#1b1d21]/90 text-white"
            : "border-dashed border-white/25 bg-[#1b1d21]/60 text-white/55"
        }`}
      >
        <span
          className="grid size-5 place-items-center rounded-full"
          style={{ background: REMOTE_COLOR }}
        >
          <Globe2 size={11} />
        </span>
        From far away
        <Zap size={10} className="text-amber-300" />
        <span className="tabular-nums">{kw.toFixed(1)} kW</span>
      </span>
      <span className="h-3 w-px bg-white/30" />
    </div>
  );
}

/**
 * The line from far away into HOME, in REMOTE_COLOR: a soft glow with a dashed core, both
 * thicker the more work comes in, and faint when none does.
 */
function drawRemoteLink(map: mapboxgl.Map, kw: number) {
  if (!map.getSource(REMOTE_LINK)) {
    map.addSource(REMOTE_LINK, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [REMOTE_FROM, HOME] },
      },
    });
    map.addLayer({
      id: `${REMOTE_LINK}-glow`,
      type: "line",
      source: REMOTE_LINK,
      paint: { "line-color": REMOTE_COLOR, "line-blur": 10 },
    });
    map.addLayer({
      id: REMOTE_LINK,
      type: "line",
      source: REMOTE_LINK,
      layout: { "line-cap": "round" },
      paint: { "line-color": "#c4b5fd", "line-dasharray": [1, 2] },
    });
  }
  const on = kw > 0.05;
  map.setPaintProperty(`${REMOTE_LINK}-glow`, "line-width", on ? 8 + kw * 2 : 0);
  map.setPaintProperty(`${REMOTE_LINK}-glow`, "line-opacity", on ? 0.65 : 0);
  map.setPaintProperty(REMOTE_LINK, "line-width", on ? 2 + kw * 0.3 : 1.5);
  map.setPaintProperty(REMOTE_LINK, "line-opacity", on ? 1 : 0.35);
}

function removeRemoteLink(map: mapboxgl.Map) {
  for (const layer of [REMOTE_LINK, `${REMOTE_LINK}-glow`])
    if (map.getLayer(layer)) map.removeLayer(layer);
  if (map.getSource(REMOTE_LINK)) map.removeSource(REMOTE_LINK);
}

/** A house offering compute: its price if it fits what's asked, a faded dot if not. */
function HousePin({
  pin,
  picked,
  onPick,
}: {
  pin: MarketPin;
  picked: boolean;
  onPick?: ((id: string) => void) | undefined;
}) {
  if (!pin.fit)
    return (
      <span className="flex animate-pill-in flex-col items-center opacity-35 grayscale transition-all">
        <span className="grid size-6 place-items-center rounded-full border border-white/15 bg-[#1b1d21]/80 text-[11px]">
          {pin.emoji}
        </span>
        <span className="h-2 w-px bg-white/30" />
      </span>
    );
  return (
    <button
      onClick={() => onPick?.(pin.id)}
      disabled={!onPick}
      className="group flex animate-pill-in flex-col items-center font-sans"
    >
      <span
        className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 font-semibold whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all group-enabled:group-hover:scale-105 ${
          picked
            ? "scale-110 border-white/70 text-[12.5px]"
            : "border-white/15 bg-[#1b1d21]/90 text-[11px]"
        }`}
        style={
          picked ? { background: REMOTE_COLOR, boxShadow: `0 0 28px ${REMOTE_COLOR}` } : undefined
        }
      >
        <span
          className={`grid place-items-center rounded-full ${picked ? "size-6 bg-white/25 text-[14px]" : "size-5 text-[12px]"}`}
          style={picked ? undefined : { background: `${REMOTE_COLOR}55` }}
        >
          {pin.emoji}
        </span>
        <span className="tabular-nums">{pin.price}</span>
      </span>
      <span
        className={picked ? "h-6 w-0.5" : "h-3 w-px bg-white/40"}
        style={picked ? { background: `linear-gradient(${REMOTE_COLOR}, transparent)` } : undefined}
      />
      {picked && (
        <span className="relative flex size-3">
          <span
            className="absolute inset-0 animate-ping rounded-full"
            style={{ background: REMOTE_COLOR }}
          />
          <span
            className="size-3 rounded-full ring-2 ring-white/80"
            style={{ background: REMOTE_COLOR }}
          />
        </span>
      )}
    </button>
  );
}

/** A small pin on the other neighbours' roofs: click to switch to them. */
function Pin({ i, onPick }: { i: number; onPick: (i: number) => void }) {
  const n = NEIGHBOURS[i];
  if (!n) return null;
  const Icon = n.icon;
  return (
    <button
      onClick={() => onPick(i)}
      title={`${n.name} · ${n.what}`}
      className="group flex animate-pill-in flex-col items-center font-sans"
    >
      <span
        className="grid size-7 place-items-center rounded-full border border-white/20 text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-110"
        style={{ background: n.dim }}
      >
        <Icon size={13} />
      </span>
      <span className="h-3 w-px bg-white/30" />
    </button>
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
  neighbour = null,
  onArrive,
  onPick,
  sim = null,
  market = null,
}: {
  token: string;
  onStage?: (stage: Stage) => void;
  /** Diving into the building (true) or back out to the street view (false). */
  inside?: boolean;
  /** Index into NEIGHBOURS: off to someone who could use the rack, or null to stay home. */
  neighbour?: number | null;
  /** The neighbours' buildings have risen: time for the cards. */
  onArrive?: () => void;
  /** A neighbour's roof pin was clicked (in the simulation: sign them up or out). */
  onPick?: (i: number) => void;
  /** The weather and earnings simulation, shown over every neighbour at once. */
  sim?: SimView | null;
  /**
   * Someone looking for compute: every house offering it across Basel. While they're still
   * choosing what to run (houses false) the map just frames the city; then it flies to the pick.
   */
  market?: {
    pins: MarketPin[];
    picked: string | null;
    houses: boolean;
    onPick: (id: string) => void;
  } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Latest callback without re-running the map effect
  const onStageRef = useRef(onStage);
  const onArriveRef = useRef(onArrive);
  const neighbourRef = useRef(neighbour);
  const pinsRef = useRef<MarketPin[]>([]);
  useEffect(() => {
    onStageRef.current = onStage;
    onArriveRef.current = onArrive;
    neighbourRef.current = neighbour;
    if (market) pinsRef.current = market.pins;
  });
  const away = neighbour !== null;
  // Set once the neighbours' buildings have risen, for the roof tags
  const [roofs, setRoofs] = useState<{
    map: mapboxgl.Map;
    heights: Record<number, number>;
    home: number;
  } | null>(null);
  const simOn = sim !== null;
  const marketOn = market !== null;
  const raisedRef = useRef<Raised | null>(null);

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
      map.setFog(FOG);
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
  // Leaving the house for a neighbour is handled below.
  const wasInside = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (inside) map.flyTo({ ...INSIDE_CAMERA, duration: INSIDE_DIVE_MS, essential: true });
    else if (wasInside.current && !away)
      map.flyTo({ ...HOME_CAMERA, duration: INSIDE_DIVE_MS, essential: true });
    wasInside.current = inside;
  }, [inside, away]);

  // Off to the neighbours: fly across, then their buildings rise and the fibre lights up
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !away) return;
    add3dBuildings(map);
    const first = NEIGHBOURS[neighbourRef.current ?? 0] ?? NEIGHBOURS[0];
    if (first)
      map.flyTo({ ...neighbourCamera(first.at), duration: NEIGHBOUR_FLY_MS, essential: true });
    // Further neighbours' tiles load as the camera moves: look for them on every idle
    const onLater = () => {
      if (raisedRef.current?.resolve())
        setRoofs({ map, heights: { ...raisedRef.current.heights }, home: raisedRef.current.home });
    };
    // Building tiles may still be loading: try on the next few idles, then show the cards anyway
    let tries = 0;
    const onIdle = () => {
      const raised = raiseNeighbours(map, neighbourRef.current ?? 0);
      if (raised) {
        raisedRef.current = raised;
        setRoofs({ map, heights: { ...raised.heights }, home: raised.home });
        map.on("idle", onLater);
      } else if (++tries < 3) return void map.once("idle", onIdle);
      onArriveRef.current?.();
    };
    const onLand = () => map.once("idle", onIdle);
    map.once("moveend", onLand);
    return () => {
      map.off("moveend", onLand);
      map.off("idle", onIdle);
      map.off("idle", onLater);
      raisedRef.current?.cleanup();
      raisedRef.current = null;
      setRoofs(null);
    };
  }, [away]);

  // Which buildings are lit: the picked neighbour, or everyone signed up in the simulation
  const signedKey = sim?.signed.map((on) => (on ? 1 : 0)).join("") ?? "";
  useEffect(() => {
    if (!raisedRef.current || neighbour === null) return;
    raisedRef.current.select(
      simOn ? [...signedKey].flatMap((on, i) => (on === "1" ? [i] : [])) : [neighbour],
    );
  }, [neighbour, simOn, signedKey]);

  // Switching neighbours flies over; the simulation pulls back over the whole block and orbits
  useEffect(() => {
    const map = mapRef.current;
    const n = neighbour === null ? undefined : NEIGHBOURS[neighbour];
    if (!map || !n || !raisedRef.current || marketOn) return;
    if (!simOn) {
      map.flyTo({ ...neighbourCamera(n.at), duration: SWITCH_FLY_MS, essential: true });
      return;
    }
    map.flyTo({ ...OVERVIEW_CAMERA, duration: NEIGHBOUR_FLY_MS, essential: true });
    let frame = 0;
    let stopped = false;
    const orbit = () => {
      if (stopped) return;
      map.setBearing(map.getBearing() + ORBIT_SPEED);
      frame = requestAnimationFrame(orbit);
    };
    // Once landed and the new tiles are in, start orbiting; grabbing the map stops it
    const start = () => {
      if (!stopped) frame = requestAnimationFrame(orbit);
    };
    const onLand = () => map.once("idle", start);
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    map.once("moveend", onLand);
    map.on("mousedown", stop);
    map.on("wheel", stop);
    map.on("touchstart", stop);
    return () => {
      stop();
      map.off("moveend", onLand);
      map.off("idle", start);
      map.off("mousedown", stop);
      map.off("wheel", stop);
      map.off("touchstart", stop);
    };
  }, [neighbour, simOn, marketOn]);

  // Looking for compute, the neighbours are out of the picture: no colours, no lines
  useEffect(() => {
    raisedRef.current?.hide(marketOn);
  }, [marketOn, roofs]);

  // Looking for compute: frame every house in Basel, then fly to the picked one
  const houses = market?.houses ?? false;
  const picked = market?.picked ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marketOn) return;
    const at = pinsRef.current.find((p) => p.id === picked)?.at;
    if (houses && at) {
      map.flyTo({
        center: at,
        zoom: 15.4,
        pitch: 58,
        bearing: map.getBearing(),
        padding: { left: 340, right: 330, top: 90, bottom: 90 },
        duration: 2200,
        essential: true,
      });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const p of pinsRef.current) bounds.extend(p.at);
    map.fitBounds(bounds, {
      padding: houses
        ? { left: 380, right: 360, top: 120, bottom: 110 }
        : { left: 90, right: 90, top: 110, bottom: 140 },
      pitch: 45,
      bearing: -15,
      duration: 2600,
      essential: true,
    });
  }, [marketOn, houses, picked]);

  // The work from far away: its line into HOME, only in the simulation
  const remoteKw = sim ? Math.round(sim.remote * 10) / 10 : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || remoteKw === null || !roofs) return;
    drawRemoteLink(map, remoteKw);
  }, [remoteKw, roofs]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !simOn) return;
    return () => removeRemoteLink(map);
  }, [simOn]);

  // The simulated weather on the map: falling snow, rain, and a sky tinted by the temperature
  const weather = sim?.weather ?? null;
  const temp = sim ? Math.round(sim.temp) : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || weather === null || temp === null) return;
    // Snow and rain are still experimental in Mapbox GL: never let them break the map
    const safely = (f: () => void) => {
      try {
        f();
      } catch {
        // No weather effects then
      }
    };
    safely(() =>
      map.setSnow(
        weather === "snow"
          ? { density: 0.85, intensity: 1, vignette: 0.5, "vignette-color": "#9cc3ff" }
          : null,
      ),
    );
    safely(() =>
      map.setRain(
        weather === "rain"
          ? {
              density: 0.7,
              intensity: 0.9,
              opacity: 0.6,
              vignette: 0.5,
              "vignette-color": "#1e3a5f",
            }
          : null,
      ),
    );
    map.setFog(weatherFog(temp));
  }, [weather, temp]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !simOn) return;
    return () => {
      try {
        map.setSnow(null);
        map.setRain(null);
      } catch {
        // Never set
      }
      map.setFog(FOG);
    };
  }, [simOn]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {roofs && sim && (
        <OnRoof map={roofs.map} at={HOME} height={roofs.home} front>
          <HomeTag kw={sim.rack} temp={sim.temp} />
        </OnRoof>
      )}
      {roofs && sim && (
        <OnRoof map={roofs.map} at={REMOTE_TAG_AT} height={0}>
          <RemoteTag kw={sim.remote} />
        </OnRoof>
      )}
      {roofs &&
        market &&
        market.pins.map((p) => (
          <OnRoof key={p.id} map={roofs.map} at={p.at} height={12} front={p.id === market.picked}>
            <HousePin
              pin={p}
              picked={market.houses && p.id === market.picked}
              onPick={market.houses ? market.onPick : undefined}
            />
          </OnRoof>
        ))}
      {roofs &&
        neighbour !== null &&
        !market &&
        NEIGHBOURS.map((n, i) => {
          const height = roofs.heights[i];
          if (height === undefined) return null;
          return (
            <OnRoof key={n.id} map={roofs.map} at={n.at} height={height} front={i === neighbour}>
              {sim ? (
                <SimChip
                  i={i}
                  kw={sim.kw[i] ?? 0}
                  signed={sim.signed[i] ?? false}
                  onToggle={(j) => onPick?.(j)}
                />
              ) : i === neighbour ? (
                <Beacon key={`tag-${n.id}`} i={i} />
              ) : (
                <Pin key={`pin-${n.id}`} i={i} onPick={(j) => onPick?.(j)} />
              )}
            </OnRoof>
          );
        })}
    </div>
  );
}
