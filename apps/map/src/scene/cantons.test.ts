import { describe, expect, it } from "vitest";
import { parseCantons, simplify, type Ring } from "./cantons";

describe("canton borders", () => {
  it("drops points that lie on a straight line", () => {
    const line: Ring = [
      [8, 46],
      [8.001, 46.001],
      [8.002, 46.002],
      [8.1, 46.1],
    ];
    expect(simplify(line, 0.0027)).toEqual([
      [8, 46],
      [8.1, 46.1],
    ]);
  });

  it("keeps a corner", () => {
    const corner: Ring = [
      [8, 46],
      [8.05, 46],
      [8.1, 46],
      [8.1, 46.1],
    ];
    expect(simplify(corner, 0.0027)).toContainEqual([8.1, 46]);
  });

  it("reads every ring of a multipolygon", () => {
    const square: Ring = [
      [8, 46],
      [8.1, 46],
      [8.1, 46.1],
      [8, 46.1],
      [8, 46],
    ];
    const body = {
      results: [
        { geometry: { type: "MultiPolygon", coordinates: [[square], [square]] } },
        { geometry: { type: "Polygon", coordinates: [square] } },
      ],
    };
    expect(parseCantons(body)).toHaveLength(3);
  });
});
