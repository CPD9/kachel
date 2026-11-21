/**
 * Sonnendach's heat demand belongs to a building of swissBUILDINGS3D 2.0, and one such building
 * can cover several GWR buildings: SFOE's data model says "if several GWR records were assigned
 * to the building, one is chosen at random" (Dokumentation Geodatenmodell Solarenergie, field
 * GWR_EGID). In dense blocks the figure is for the whole block. This finds the GWR buildings
 * under the same roof outline, so the heat can be divided by their floor area.
 */

/** A ring of [lon, lat] points. */
type Ring = ReadonlyArray<readonly [number, number]>;

export interface BuildingGroup {
  /** GWR buildings whose point lies under the roof outline. */
  readonly egids: readonly number[];
  /** Their heated floor area (GWR energy reference area), m². */
  readonly floorM2: number;
}

/** Ray casting: is the point inside the ring? */
export function inside(x: number, y: number, ring: Ring): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as readonly [number, number];
    const [xj, yj] = ring[j] as readonly [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Every outer ring of the roof faces in a find answer. */
export function roofRings(body: unknown): Ring[] {
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r: unknown): Ring[] => {
    const g = (r as { geometry?: { type?: string; coordinates?: unknown } }).geometry;
    if (g?.type === "Polygon") return [(g.coordinates as Ring[])[0] ?? []];
    if (g?.type === "MultiPolygon") return (g.coordinates as Ring[][]).map((p) => p[0] ?? []);
    return [];
  });
}

/** The bounding box of the rings, as "west,south,east,north"; null without points. */
export function envelope(rings: readonly Ring[]): string | null {
  const pts = rings.flat();
  if (pts.length === 0) return null;
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    .map((v) => v.toFixed(6))
    .join(",");
}

/** The GWR buildings (from an identify answer with geometry) whose point lies under the roof. */
export function groupUnder(body: unknown, rings: readonly Ring[]): BuildingGroup {
  const results = (body as { results?: unknown }).results;
  const seen = new Map<number, number>();
  if (Array.isArray(results)) {
    for (const r of results) {
      const f = r as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
      const c = f.geometry?.coordinates;
      const egid = Number(f.properties?.egid);
      if (!Array.isArray(c) || !Number.isFinite(egid)) continue;
      const [x, y] = c.map(Number) as [number, number];
      if (!rings.some((ring) => inside(x, y, ring))) continue;
      const area = Number(f.properties?.gebf);
      seen.set(egid, Number.isFinite(area) && area > 0 ? area : 0);
    }
  }
  return { egids: [...seen.keys()], floorM2: [...seen.values()].reduce((a, b) => a + b, 0) };
}

/**
 * Adds the clicked building when its point fell outside the outline (it happens: GWR points and
 * roof outlines come from different surveys), so the group always contains it.
 */
export function withBuilding(
  group: BuildingGroup,
  egid: number,
  floorM2: number | null,
): BuildingGroup {
  if (group.egids.includes(egid)) return group;
  return { egids: [...group.egids, egid], floorM2: group.floorM2 + (floorM2 ?? 0) };
}

/**
 * This building's share of the group's heat, in proportion to heated floor area (our split;
 * SFOE gives only the group figure). Null when either area is unknown.
 */
export function shareOf(group: BuildingGroup, floorM2: number | null): number | null {
  if (floorM2 === null || floorM2 <= 0 || group.floorM2 <= 0) return null;
  return Math.min(1, floorM2 / group.floorM2);
}
