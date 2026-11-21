#!/usr/bin/env node
// Puts the scheduler's synthetic fleet on real residential buildings, for the map's illustration.
//
// Each synthetic house in services/scheduler/out/fleet_basel_bern_sites.csv sits at a random point.
// This asks the federal building register (GWR) for residential buildings within about 150 m,
// looks up SFOE's heat demand for the hectare of each, and keeps the building in the hungriest
// hectare. It stores only EGID and position, never an address. Run once when the fleet changes:
//
//   node scripts/place-fleet.mjs            writes apps/map/src/fleet/sites.json
//
// About 450 requests to api3.geo.admin.ch, a quarter of a second apart.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const SITES = "services/scheduler/out/fleet_basel_bern_sites.csv";
const OUT = "apps/map/src/fleet/sites.json";
/** GWR building categories with homes: only homes, homes with other use, partly homes. */
export const RESIDENTIAL = new Set([1020, 1030, 1040]);
const CANDIDATES = 8;

/** Rows of a simple CSV with a header line and no quoted commas. */
export function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const keys = head.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
}

/** Residential GWR entries, nearest first, at most `n`, one per EGID. */
export function residentialNearest(results, lon, lat, n) {
  const seen = new Set();
  return results
    .map((r) => r.properties ?? r.attributes ?? {})
    .filter((p) => RESIDENTIAL.has(Number(p.gkat)) && p.egid != null)
    .map((p) => {
      const [x, y] = [Number(p.dkode ?? p.gkode), Number(p.dkodn ?? p.gkodn)];
      return { egid: Number(p.egid), lv95: [x, y], wgs: wgs84(x, y) };
    })
    .filter((b) => !seen.has(b.egid) && seen.add(b.egid))
    .sort((a, b) => dist(a.wgs, [lon, lat]) - dist(b.wgs, [lon, lat]))
    .slice(0, n);
}

function dist([ax, ay], [bx, by]) {
  return Math.hypot((ax - bx) * Math.cos((ay * Math.PI) / 180), ay - by);
}

/** LV95 to WGS84, swisstopo's approximate formulas (about a metre). */
export function wgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat =
    16.9023892 +
    3.238272 * x -
    0.270978 * y * y -
    0.002528 * x * x -
    0.0447 * y * y * x -
    0.014 * x * x * x;
  return [(lon * 100) / 36, (lat * 100) / 36];
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function identify(layer, lon, lat, tolerance, d) {
  const q = new URLSearchParams({
    geometryType: "esriGeometryPoint",
    geometry: `${lon},${lat}`,
    sr: "4326",
    tolerance: String(tolerance),
    mapExtent: [lon - d, lat - d, lon + d, lat + d].join(","),
    imageDisplay: "100,100,96",
    returnGeometry: "false",
    layers: `all:${layer}`,
    limit: "200",
  });
  await pause(250);
  const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": "kachel-map/0.1" } });
  if (!res.ok) throw new Error(`${layer}: HTTP ${res.status}`);
  return (await res.json()).results ?? [];
}

async function main() {
  const sites = parseCsv(readFileSync(SITES, "utf8"));
  const placed = [];
  const hectares = new Map();
  for (const s of sites) {
    const lon = Number(s.longitude);
    const lat = Number(s.latitude);
    // 50 of 100 px around ±0.002° is about 150 m; if no home is that close (a field, the
    // harbour, a border), look again within about 450 m.
    let near = [];
    for (const d of [0.002, 0.006]) {
      const hits = await identify("ch.bfs.gebaeude_wohnungs_register", lon, lat, 50, d);
      near = residentialNearest(hits, lon, lat, CANDIDATES).filter(
        (b) => !placed.some((p) => p.egid === b.egid),
      );
      if (near.length > 0) break;
    }
    let best = null;
    for (const b of near) {
      const cell = `${Math.floor(b.lv95[0] / 100)},${Math.floor(b.lv95[1] / 100)}`;
      if (!hectares.has(cell)) {
        const r = await identify(
          "ch.bfe.fernwaerme-nachfrage_wohn_dienstleistungsgebaeude",
          b.wgs[0],
          b.wgs[1],
          0,
          0.0005,
        );
        hectares.set(cell, Number(r[0]?.attributes?.needtotal ?? 0));
      }
      const mwh = hectares.get(cell);
      if (best === null || mwh > best.mwh) best = { ...b, mwh };
    }
    if (best === null) {
      console.error(`${s.id}: no free residential building nearby, left out`);
      continue;
    }
    placed.push({
      id: s.id,
      city: s.city,
      servers: Number(s.servers),
      heatDemandKwh: Number(s.heat_demand_kwh_2025),
      egid: best.egid,
      lon: Number(best.wgs[0].toFixed(6)),
      lat: Number(best.wgs[1].toFixed(6)),
      hectareHeatMwh: Math.round(best.mwh),
    });
    console.log(`${s.id} → EGID ${best.egid} (hectare ${Math.round(best.mwh)} MWh/a)`);
  }
  writeFileSync(OUT, `${JSON.stringify(placed, null, 2)}\n`);
  console.log(`${placed.length} of ${sites.length} houses placed → ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
