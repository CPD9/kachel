import { beforeEach, describe, expect, it } from "vitest";
import type { Fetch } from "../building/geoadmin";
import { clearNetworkCache, loadNetworks, parseNetworks, roundArea } from "./thermal";

// As api3.geo.admin.ch returned it on 21 Nov 2026.
const BODY = {
  results: [
    {
      type: "Feature",
      id: "tn1222",
      geometry: { type: "Point", coordinates: [7.546481, 47.553914] },
      properties: {
        name: "Wärmeverbund Baselmattweg",
        operator: null,
        place: "Allschwil",
        en_energysource: "Wood chips",
        power: 0.978,
        energy: null,
        houseconnections: null,
        beginningofoperation: 2015,
      },
    },
    { type: "Feature", id: "broken", geometry: null, properties: {} },
  ],
};

beforeEach(clearNetworkCache);

describe("thermal networks", () => {
  it("reads name, place, source and power, and skips features without a point", () => {
    const [n, ...rest] = parseNetworks(BODY);
    expect(rest).toHaveLength(0);
    expect(n?.name).toBe("Wärmeverbund Baselmattweg");
    expect(n?.source).toBe("Wood chips");
    expect(n?.powerMw).toBe(0.978);
    expect(n?.operator).toBeNull();
  });

  it("rounds the area outwards, so a small pan asks nothing new", () => {
    expect(roundArea({ west: 7.53, south: 47.51, east: 7.66, north: 47.6 })).toEqual({
      west: 7.5,
      south: 47.5,
      east: 7.7,
      north: 47.6,
    });
  });

  it("asks once per area", async () => {
    let calls = 0;
    const f: Fetch = async () => {
      calls++;
      return { ok: true, json: async () => BODY };
    };
    const area = { west: 7.53, south: 47.51, east: 7.66, north: 47.6 };
    await loadNetworks(area, f);
    await loadNetworks({ ...area, west: 7.52 }, f);
    expect(calls).toBe(1);
  });
});
