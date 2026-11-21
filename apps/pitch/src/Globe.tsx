import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

/** One full turn every this many seconds. */
const SECONDS_PER_REVOLUTION = 120;
/** Above this zoom the globe stops spinning. */
const MAX_SPIN_ZOOM = 5;
/** Between this zoom and MAX_SPIN_ZOOM the spin slows down. */
const SLOW_SPIN_ZOOM = 3;

/** The presenter's home, hard-coded for the demo: [lng, lat]. */
const HOME: [number, number] = [7.58215, 47.55212];

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
function findHomeBuildingId(map: mapboxgl.Map): string | number | undefined {
  const features = map.querySourceFeatures("composite", {
    sourceLayer: "building",
    filter: EXTRUDED,
  });
  const withId = features.filter((f) => f.id !== undefined);
  const containing = withId.find((f) => inGeometry(HOME, f.geometry));
  if (containing) return containing.id;
  // HOME sits on a street or courtyard: fall back to the building with the closest corner
  let best: { id: string | number | undefined; d: number } = { id: undefined, d: Infinity };
  for (const f of withId) {
    const g = f.geometry;
    const rings =
      g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
    for (const [x = Infinity, y = Infinity] of rings.flat()) {
      const d = (x - HOME[0]) ** 2 + (y - HOME[1]) ** 2;
      if (d < best.d) best = { id: f.id, d };
    }
  }
  return best.id;
}

/**
 * Replace the building under HOME with a solid coloured block: take it out of the grey layer
 * and draw it again in HOME_COLOR. Returns false if no building has loaded there yet.
 */
function highlightHome(map: mapboxgl.Map): boolean {
  if (map.getLayer(HOME_BUILDING)) return true;
  const id = findHomeBuildingId(map);
  if (id === undefined) return false;

  map.setFilter(BUILDINGS, ["all", EXTRUDED, ["!=", ["id"], id]]);
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
export function Globe({ token, onStage }: { token: string; onStage?: (stage: Stage) => void }) {
  const container = useRef<HTMLDivElement>(null);
  // Latest callback without re-running the map effect
  const onStageRef = useRef(onStage);
  useEffect(() => {
    onStageRef.current = onStage;
  });

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
      map.remove();
    };
  }, [token]);

  return <div ref={container} className="h-full w-full" />;
}
