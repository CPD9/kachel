import type { Fetch } from "../building/geoadmin";

/**
 * SFOE's register of thermal networks (district heating), `ch.bfe.thermische-netze` on
 * api3.geo.admin.ch, data status 18.11.2026. One point per network. Loaded once for the
 * area in view when the layer is switched on, and cached.
 */
const API = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
export const NETWORK_LAYER = "ch.bfe.thermische-netze";
/** The most networks one request returns; at this many the list may be cut short. */
export const NETWORK_LIMIT = 500;

export interface Network {
  readonly id: string;
  readonly name: string;
  readonly operator: string | null;
  readonly place: string | null;
  readonly lon: number;
  readonly lat: number;
  readonly source: string | null;
  readonly powerMw: number | null;
  readonly energyMwh: number | null;
  readonly connections: number | null;
  readonly since: number | null;
}

export interface Area {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function parseNetworks(body: unknown): Network[] {
  if (typeof body !== "object" || body === null || !("results" in body)) return [];
  const list = (body as { results: unknown }).results;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r: unknown): Network[] => {
    const f = r as {
      id?: unknown;
      geometry?: { coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const c = f.geometry?.coordinates;
    const p = f.properties;
    if (!Array.isArray(c) || p === undefined) return [];
    const [lon, lat] = c.map(Number);
    if (lon === undefined || lat === undefined || !Number.isFinite(lon) || !Number.isFinite(lat))
      return [];
    return [
      {
        id: String(f.id),
        name: str(p.name) ?? "Thermal network",
        operator: str(p.operator),
        place: str(p.place),
        lon,
        lat,
        source: str(p.en_energysource) ?? str(p.en_enersource_main),
        powerMw: num(p.power),
        energyMwh: num(p.energy),
        connections: num(p.houseconnections),
        since: num(p.beginningofoperation),
      },
    ];
  });
}

/** The area rounded outwards to 0.1°, so small pans reuse the same request. */
export function roundArea(a: Area): Area {
  const down = (v: number) => Math.floor(v * 10) / 10;
  const up = (v: number) => Math.ceil(v * 10) / 10;
  return { west: down(a.west), south: down(a.south), east: up(a.east), north: up(a.north) };
}

export function networksUrl(a: Area): string {
  const box = [a.west, a.south, a.east, a.north].map((v) => v.toFixed(1)).join(",");
  const q = new URLSearchParams({
    geometryType: "esriGeometryEnvelope",
    geometry: box,
    sr: "4326",
    tolerance: "0",
    mapExtent: box,
    imageDisplay: "500,500,96",
    returnGeometry: "true",
    geometryFormat: "geojson",
    layers: `all:${NETWORK_LAYER}`,
    limit: String(NETWORK_LIMIT),
    lang: "en",
  });
  return `${API}?${q}`;
}

const cache = new Map<string, Promise<Network[]>>();

/** Networks in the area; an empty list if the request fails (and then it is not cached). */
export function loadNetworks(area: Area, fetcher: Fetch = fetch): Promise<Network[]> {
  const url = networksUrl(roundArea(area));
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  const job = fetcher(url)
    .then(async (res) => (res.ok ? parseNetworks(await res.json()) : []))
    .catch(() => []);
  cache.set(url, job);
  void job.then((list) => {
    if (list.length === 0) cache.delete(url);
  });
  return job;
}

export function clearNetworkCache(): void {
  cache.clear();
}
