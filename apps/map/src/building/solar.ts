/**
 * Solar already mapped in OpenStreetMap near a building, from the Overpass API
 * (overpass-api.de, © OpenStreetMap contributors, ODbL). One small query per clicked building.
 */
const OVERPASS = "https://overpass-api.de/api/interpreter";
/** Metres around the building's centre: enough for its roof, not the neighbours'. */
export const SOLAR_RADIUS_M = 40;

export interface OsmSolar {
  readonly photovoltaic: number;
  readonly thermal: number;
  /** Mapped but without saying which kind. */
  readonly other: number;
}

export function solarUrl(lon: number, lat: number): string {
  const at = `around:${SOLAR_RADIUS_M},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const query =
    `[out:json][timeout:10];(` +
    `nwr(${at})["generator:source"="solar"];` +
    `nwr(${at})["power"="plant"]["plant:source"="solar"];` +
    `);out tags 50;`;
  return `${OVERPASS}?${new URLSearchParams({ data: query })}`;
}

export function parseSolar(body: unknown): OsmSolar | null {
  const elements = (body as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return null;
  let photovoltaic = 0;
  let thermal = 0;
  let other = 0;
  for (const e of elements) {
    const tags = (e as { tags?: Record<string, string> }).tags ?? {};
    const method = tags["generator:method"] ?? tags["plant:method"] ?? "";
    if (method === "photovoltaic") photovoltaic++;
    else if (method === "thermal") thermal++;
    else other++;
  }
  return { photovoltaic, thermal, other };
}

/** "1 photovoltaic and 1 solar thermal", for the card. */
export function describeSolar(s: OsmSolar): string {
  const parts = [
    s.photovoltaic > 0 ? `${s.photovoltaic} photovoltaic` : null,
    s.thermal > 0 ? `${s.thermal} solar thermal` : null,
    s.other > 0 ? `${s.other} of unknown kind` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return "none";
  if (parts.length === 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}
