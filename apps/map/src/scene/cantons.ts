import type { Fetch } from "../building/geoadmin";

/**
 * Canton borders from swissBOUNDARIES3D (swisstopo, data status 01.01.2026), read once from
 * api3.geo.admin.ch when the map first zooms out far enough, then simplified to about 300 m,
 * which is under a pixel at country scale.
 */
const URL_CANTONS =
  "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?" +
  new URLSearchParams({
    geometryType: "esriGeometryEnvelope",
    geometry: "5.9,45.8,10.5,47.9",
    sr: "4326",
    tolerance: "0",
    mapExtent: "5.9,45.8,10.5,47.9",
    imageDisplay: "200,100,96",
    returnGeometry: "true",
    geometryFormat: "geojson",
    layers: "all:ch.swisstopo.swissboundaries3d-kanton-flaeche.fill",
    limit: "50",
    lang: "en",
  }).toString();

/** A ring of [lon, lat] points. */
export type Ring = Array<[number, number]>;

/** Douglas–Peucker on lon/lat, with the tolerance in degrees of latitude. */
export function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length < 4) return ring;
  const cosLat = Math.cos(((ring[0]?.[1] ?? 46.8) * Math.PI) / 180);
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = ring[a] as [number, number];
    const [bx, by] = ring[b] as [number, number];
    const dx = (bx - ax) * cosLat;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i] as [number, number];
      const ex = (px - ax) * cosLat;
      const ey = py - ay;
      const d = len === 0 ? Math.hypot(ex, ey) : Math.abs(ex * dy - ey * dx) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i] === 1);
}

/** Every outer and inner ring of every canton, simplified. */
export function parseCantons(body: unknown, tolerance = 0.0027): Ring[] {
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const rings: Ring[] = [];
  for (const r of results) {
    const g = (r as { geometry?: { type?: string; coordinates?: unknown } }).geometry;
    if (g === undefined) continue;
    const polygons =
      g.type === "MultiPolygon"
        ? (g.coordinates as Ring[][])
        : g.type === "Polygon"
          ? [g.coordinates as Ring[]]
          : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const s = simplify(ring, tolerance);
        if (s.length >= 3) rings.push(s);
      }
    }
  }
  return rings;
}

let loading: Promise<Ring[]> | null = null;

/** The canton rings, fetched once per session. */
export function loadCantons(fetcher: Fetch = fetch): Promise<Ring[]> {
  loading ??= fetcher(URL_CANTONS)
    .then(async (res) => (res.ok ? parseCantons(await res.json()) : []))
    .catch(() => [])
    .then((rings) => {
      if (rings.length === 0) loading = null;
      return rings;
    });
  return loading;
}
