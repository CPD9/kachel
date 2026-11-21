import { BUILD_PERIOD, ENERGY_SOURCE, sourceKind, type SourceKind } from "./codes";
import { parseSolar, solarUrl, type OsmSolar } from "./solar";

/**
 * Lookups on api3.geo.admin.ch, the federal geodata API (free, "fair use"; see apps/map/README.md).
 * One request per layer and building, only on click, and each answer is cached for the session.
 */
const API = "https://api3.geo.admin.ch/rest/services/ech/MapServer";
export const GWR_LAYER = "ch.bfs.gebaeude_wohnungs_register";
export const SOLAR_ROOF_LAYER = "ch.bfe.solarenergie-eignung-daecher";
export const HEAT_DEMAND_LAYER = "ch.bfe.fernwaerme-nachfrage_wohn_dienstleistungsgebaeude";

export type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** The building register entry, in the words the card uses. */
export interface Register {
  readonly egid: number;
  readonly address: string;
  readonly built: string | null;
  readonly heatedAreaM2: number | null;
  readonly floors: number | null;
  readonly dwellings: number | null;
  readonly heating: string;
  readonly heatingKind: SourceKind;
  readonly hotWater: string;
  /** Date the register was exported, as published ("19.11.2026"). */
  readonly asOf: string | null;
}

/** SFOE's estimate for the building, from Sonnendach (computed from GWR data). */
export interface RoofEstimate {
  readonly heatingKwh: number;
  readonly hotWaterKwh: number;
  /** Heating degree days for this roof, January to December. */
  readonly degreeDays: readonly number[];
  readonly solarKwh: number;
}

/** SFOE heat demand of the hectare around the building (2013/2014 statistics). */
export interface Hectare {
  readonly totalMwh: number;
  readonly districtSharePct: number | null;
}

type Attributes = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function results(body: unknown): Attributes[] {
  if (typeof body !== "object" || body === null || !("results" in body)) return [];
  const list = (body as { results: unknown }).results;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r: unknown) => {
    if (typeof r !== "object" || r === null) return [];
    const a =
      (r as { attributes?: unknown; properties?: unknown }).attributes ??
      (r as { properties?: unknown }).properties;
    return typeof a === "object" && a !== null ? [a as Attributes] : [];
  });
}

export function parseRegister(a: Attributes): Register | null {
  const egid = Number(a.egid);
  if (!Number.isFinite(egid)) return null;
  const genh = num(a.genh1);
  const genw = num(a.genw1);
  const year = num(a.gbauj);
  const period = num(a.gbaup);
  return {
    egid,
    address: str(a.strname_deinr) ?? str(a.label) ?? `EGID ${egid}`,
    built: year !== null ? String(year) : period !== null ? (BUILD_PERIOD[period] ?? null) : null,
    heatedAreaM2: num(a.gebf),
    floors: num(a.gastw),
    dwellings: num(a.ganzwhg),
    heating: genh !== null ? (ENERGY_SOURCE[genh] ?? "other") : "not recorded",
    heatingKind: sourceKind(genh),
    hotWater: genw !== null ? (ENERGY_SOURCE[genw] ?? "other") : "not recorded",
    asOf: str(a.gexpdat),
  };
}

/** Sonnendach lists one row per roof face; the building's demand repeats on each. */
export function parseRoofs(rows: Attributes[]): RoofEstimate | null {
  const first = rows.find((r) => num(r.bedarf_heizung) !== null);
  if (first === undefined) return null;
  const sameBuilding = rows.filter((r) => r.building_id === first.building_id);
  const months = Array.isArray(first.monate) ? first.monate.map(Number) : [];
  const hdd = Array.isArray(first.heizgradtage) ? first.heizgradtage.map(Number) : [];
  const degreeDays = Array.from({ length: 12 }, (_, i) => {
    const at = months.indexOf(i + 1);
    return at >= 0 ? (hdd[at] ?? 0) : 0;
  });
  return {
    heatingKwh: num(first.bedarf_heizung) ?? 0,
    hotWaterKwh: num(first.bedarf_warmwasser) ?? 0,
    degreeDays,
    solarKwh: sameBuilding.reduce((s, r) => s + (num(r.stromertrag) ?? 0), 0),
  };
}

export function parseHectare(a: Attributes | undefined): Hectare | null {
  if (a === undefined) return null;
  const total = num(a.needtotal);
  return total === null ? null : { totalMwh: total, districtSharePct: num(a.percentremoteheat) };
}

/** An identify request around a point. `tolerance` is in pixels of a 100 × 100 image of ±0.0005°. */
export function identifyUrl(layer: string, lon: number, lat: number, tolerance: number): string {
  const d = 0.0005;
  const q = new URLSearchParams({
    geometryType: "esriGeometryPoint",
    geometry: `${lon.toFixed(6)},${lat.toFixed(6)}`,
    sr: "4326",
    tolerance: String(tolerance),
    mapExtent: [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(6)).join(","),
    imageDisplay: "100,100,96",
    returnGeometry: "false",
    layers: `all:${layer}`,
    lang: "en",
  });
  return `${API}/identify?${q}`;
}

export function registerUrl(egid: number): string {
  const q = new URLSearchParams({
    layer: GWR_LAYER,
    searchText: String(egid),
    searchField: "egid",
    contains: "false",
    returnGeometry: "false",
  });
  return `${API}/find?${q}`;
}

/** Everything the card shows about one building. Missing pieces are null, never an error. */
export interface BuildingFacts {
  readonly register: Register | null;
  readonly roof: RoofEstimate | null;
  readonly hectare: Hectare | null;
  /** Solar already mapped in OpenStreetMap around the building; null if Overpass did not answer. */
  readonly osmSolar: OsmSolar | null;
}

export interface Picked {
  readonly egid: number | null;
  readonly lon: number;
  readonly lat: number;
}

/** How long the card waits for Overpass before showing everything else. */
export const SOLAR_WAIT_MS = 6000;

type Official = Omit<BuildingFacts, "osmSolar">;
const official = new Map<string, Promise<Official>>();
const solar = new Map<string, Promise<OsmSolar | null>>();

/**
 * Caches a job under a key, and forgets it again when its answer counts as a failure,
 * so that the next click asks again.
 */
function cached<T>(
  store: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
  failed: (value: T) => boolean,
): Promise<T> {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const job = make();
  store.set(key, job);
  void job.then((value) => {
    if (failed(value)) store.delete(key);
  });
  return job;
}

/**
 * Looks a building up in the three federal layers and in OpenStreetMap. Cached by EGID, or by
 * position without one. An empty federal answer (perhaps a dropped connection) and a missing
 * Overpass answer (Overpass is often busy) are each asked again on the next click, on their own.
 */
export function lookUp(picked: Picked, fetcher: Fetch = fetch): Promise<BuildingFacts> {
  const key = String(picked.egid ?? `${picked.lon.toFixed(5)},${picked.lat.toFixed(5)}`);
  const get = async (url: string): Promise<Attributes[]> => {
    try {
      const res = await fetcher(url);
      return res.ok ? results(await res.json()) : [];
    } catch {
      return [];
    }
  };
  const facts = cached(
    official,
    key,
    () =>
      Promise.all([
        picked.egid !== null
          ? get(registerUrl(picked.egid))
          : get(identifyUrl(GWR_LAYER, picked.lon, picked.lat, 20)),
        get(identifyUrl(SOLAR_ROOF_LAYER, picked.lon, picked.lat, 4)),
        get(identifyUrl(HEAT_DEMAND_LAYER, picked.lon, picked.lat, 0)),
      ]).then(([gwr, roofs, hectare]) => ({
        register: gwr[0] === undefined ? null : parseRegister(gwr[0]),
        roof: parseRoofs(roofs),
        hectare: parseHectare(hectare[0]),
      })),
    (f) => f.register === null && f.roof === null && f.hectare === null,
  );
  const osm = cached(
    solar,
    key,
    // Overpass is often busy: give it six seconds, so it never holds up the heat figures.
    () =>
      Promise.race([
        fetcher(solarUrl(picked.lon, picked.lat))
          .then(async (res) => (res.ok ? parseSolar(await res.json()) : null))
          .catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SOLAR_WAIT_MS)),
      ]),
    (s) => s === null,
  );
  return Promise.all([facts, osm]).then(([f, osmSolar]) => ({ ...f, osmSolar }));
}

/** For tests. */
export function clearCache(): void {
  official.clear();
  solar.clear();
}
