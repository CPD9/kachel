import { describe, expect, it } from "vitest";
import { fit, place, tiles, tileUrl, world } from "./project";

describe("the map's projection", () => {
  it("puts lon 0, lat 0 in the middle of the world and north up", () => {
    expect(world(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(world(47.5, 7.6, 10).y).toBeLessThan(world(46.9, 7.4, 10).y);
  });

  it("fits every point inside the box, with room around", () => {
    const pts = [
      { lat: 47.54, lon: 7.56 },
      { lat: 47.58, lon: 7.63 },
    ];
    const frame = fit(pts, 440, 640, 40);
    for (const p of pts) {
      const at = place(frame, p);
      expect(at.x).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(at.x).toBeLessThanOrEqual(400 + 1e-6);
      expect(at.y).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(at.y).toBeLessThanOrEqual(600 + 1e-6);
    }
  });

  it("covers the box with tiles from swisstopo", () => {
    const frame = fit(
      [
        { lat: 47.56, lon: 7.59 },
        { lat: 47.57, lon: 7.6 },
      ],
      440,
      640,
    );
    const ts = tiles(frame);
    expect(ts.some((t) => t.left <= 0 && t.top <= 0)).toBe(true);
    expect(ts.some((t) => t.left + t.size >= 440 && t.top + t.size >= 640)).toBe(true);
    expect(tileUrl(ts[0] ?? { z: 1, x: 0, y: 0 })).toMatch(/^https:\/\/wmts\.geo\.admin\.ch\//);
  });
});
