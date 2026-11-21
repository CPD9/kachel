/**
 * The hand-over from this intro to the real map (apps/map): one page load to the map, opened at
 * the presenter's building with its card. The map reads the building register (BFS GWR), SFOE's
 * Sonnendach estimate and the Kachel estimate itself, with no token.
 */

/**
 * Byfangweg 18, 4051 Basel, in the federal building register (BFS GWR, EGID 442141), looked up on
 * api3.geo.admin.ch on 21 Nov 2026. The same building as Globe.tsx's HOME.
 */
export const HOME_EGID = 442141;

/** Where the map app runs: `make dev` serves it on port 5175 (VITE_MAP_URL overrides it). */
export const DEFAULT_MAP_URL = "http://localhost:5175";

/** The map, opened at a building with its card (`?egid=…&card=1`, see apps/map/src/start.ts). */
export function mapUrl(base: string, egid: number = HOME_EGID): string {
  const url = new URL(base);
  url.searchParams.set("egid", String(egid));
  url.searchParams.set("card", "1");
  return url.toString();
}

/** Without a Mapbox token: how long the "finding your building" pills show before the hand-over. */
export const NO_GLOBE_HOLD_MS = 2200;
/** The fade to the map's background colour, before the page changes. */
export const FADE_MS = 600;
