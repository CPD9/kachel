import { describe, expect, it } from "vitest";
import { envelope, groupUnder, inside, roofRings, shareOf, withBuilding } from "./group";

const SQUARE: Array<[number, number]> = [
  [7.6, 47.56],
  [7.601, 47.56],
  [7.601, 47.561],
  [7.6, 47.561],
  [7.6, 47.56],
];

describe("building group under one Sonnendach roof", () => {
  it("knows inside from outside", () => {
    expect(inside(7.6005, 47.5605, SQUARE)).toBe(true);
    expect(inside(7.602, 47.5605, SQUARE)).toBe(false);
  });

  it("reads roof rings and their envelope", () => {
    const rings = roofRings({
      results: [
        { geometry: { type: "Polygon", coordinates: [SQUARE] } },
        { geometry: { type: "MultiPolygon", coordinates: [[SQUARE]] } },
      ],
    });
    expect(rings).toHaveLength(2);
    expect(envelope(rings)).toBe("7.600000,47.560000,7.601000,47.561000");
    expect(envelope([])).toBeNull();
  });

  it("sums the floor area of the GWR buildings under the roof, each once", () => {
    // Bleichestrasse, Basel, on 21 Nov 2026: one roof outline over ten GWR buildings.
    const gwr = {
      results: [
        { geometry: { coordinates: [7.6002, 47.5602] }, properties: { egid: "456839", gebf: 996 } },
        { geometry: { coordinates: [7.6002, 47.5602] }, properties: { egid: "456839", gebf: 996 } },
        {
          geometry: { coordinates: [7.6008, 47.5608] },
          properties: { egid: "456832", gebf: 3584 },
        },
        { geometry: { coordinates: [7.603, 47.5608] }, properties: { egid: "1", gebf: 99999 } },
      ],
    };
    const g = groupUnder(gwr, [SQUARE]);
    expect(g.egids).toEqual([456839, 456832]);
    expect(g.floorM2).toBe(4580);
  });

  it("always includes the clicked building, and splits by floor area", () => {
    const g = withBuilding({ egids: [2], floorM2: 300 }, 1, 100);
    expect(g).toEqual({ egids: [2, 1], floorM2: 400 });
    expect(shareOf(g, 100)).toBe(0.25);
    expect(shareOf(g, null)).toBeNull();
    expect(withBuilding(g, 2, 300)).toBe(g);
  });
});
