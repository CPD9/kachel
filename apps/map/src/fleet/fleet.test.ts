import { describe, expect, it } from "vitest";
import { FLEET, FLEET_SERVERS, fleetHouse } from "./fleet";

describe("fleet on real buildings", () => {
  it("places the Basel and Bern houses, each on its own building", () => {
    expect(FLEET.length).toBeGreaterThan(90);
    expect(new Set(FLEET.map((h) => h.egid)).size).toBe(FLEET.length);
    expect(new Set(FLEET.map((h) => h.city))).toEqual(new Set(["Basel", "Bern"]));
    expect(FLEET_SERVERS).toBeGreaterThan(FLEET.length);
  });

  it("keeps every house inside Switzerland and without an address", () => {
    for (const h of FLEET) {
      expect(h.lon).toBeGreaterThan(5.9);
      expect(h.lon).toBeLessThan(10.5);
      expect(h.lat).toBeGreaterThan(45.8);
      expect(h.lat).toBeLessThan(47.9);
      expect(Object.keys(h).sort()).toEqual([
        "city",
        "egid",
        "heatDemandKwh",
        "hectareHeatMwh",
        "id",
        "lat",
        "lon",
        "servers",
      ]);
    }
  });

  it("finds a house by its building", () => {
    const first = FLEET[0];
    expect(fleetHouse(first?.egid ?? null)?.id).toBe(first?.id);
    expect(fleetHouse(1)).toBeNull();
    expect(fleetHouse(null)).toBeNull();
  });
});
