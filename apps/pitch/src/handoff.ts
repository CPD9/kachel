import { TARGET } from "./target";

/**
 * The hand-over from this intro to the real map (apps/map): one page load to the map, opened at
 * the demo target's building with its card (Byfangweg 18, or FHNW Campus Dreispitz with
 * `?at=fhnw`). The map reads the building register (BFS GWR), SFOE's Sonnendach estimate and the
 * Kachel estimate itself, with no token.
 */

/** Where the map app runs: `make dev` serves it on port 5175 (VITE_MAP_URL overrides it). */
export const DEFAULT_MAP_URL = "http://localhost:5175";

/**
 * The map's address: VITE_MAP_URL, else the local one in dev. A deployed build without
 * VITE_MAP_URL has none (null), and the intro says so instead of opening localhost.
 */
export function mapBaseFor(configured: string | undefined, dev: boolean): string | null {
  if (configured) return configured;
  return dev ? DEFAULT_MAP_URL : null;
}

/** The map, opened at a building with its card (`?egid=…&card=1`, see apps/map/src/start.ts). */
export function mapUrl(base: string, egid: number = TARGET.building.egid): string {
  const url = new URL(base);
  url.searchParams.set("egid", String(egid));
  url.searchParams.set("card", "1");
  return url.toString();
}

/** Without a Mapbox token: how long the "finding your building" pills show before the hand-over. */
export const NO_GLOBE_HOLD_MS = 2200;
/** The fade to the map's background colour, before the page changes. */
export const FADE_MS = 600;
