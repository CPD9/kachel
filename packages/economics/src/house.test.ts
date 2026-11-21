import { describe, expect, it } from "vitest";
import { PERIODS, heatDemand, kindOf, periodOf, type PeriodId } from "./house";

/** Space heating per m², single-family house: 156 kWh times the period's factor. */
const TABLE: Record<PeriodId, number> = {
  before_1919: 138.84,
  "1919_1945": 182.52,
  "1946_1960": 182.52,
  "1961_1970": 179.4,
  "1971_1980": 179.4,
  "1981_1990": 126.36,
  "1991_2000": 82.68,
  "2001_2005": 65.52,
  "2006_2010": 65.52,
  "2011_2015": 51.48,
  after_2015: 48.36,
};

describe("heat demand by construction period", () => {
  it("matches the table for every period", () => {
    expect(PERIODS.map((p) => p.id)).toEqual(Object.keys(TABLE));
    for (const { id } of PERIODS) {
      const d = heatDemand(1, id);
      expect(d.spaceHeatingKwh).toBeCloseTo(TABLE[id], 6);
      expect(d.hotWaterKwh).toBe(12);
    }
  });

  it("gives a 150 m² 1960s house more than three times a new one's heating", () => {
    const old = heatDemand(150, "1961_1970");
    const fresh = heatDemand(150, "after_2015");
    expect(Math.round(old.totalKwh)).toBe(28_710);
    expect(old.spaceHeatingKwh / fresh.spaceHeatingKwh).toBeCloseTo(1.15 / 0.31, 6);
  });

  it("halves space heating after a renovation, never below a new building", () => {
    const old = heatDemand(200, "1961_1970");
    const done = heatDemand(200, "1961_1970", true);
    expect(done.spaceHeatingKwh).toBeCloseTo(old.spaceHeatingKwh / 2, 6);
    expect(done.hotWaterKwh).toBe(old.hotWaterKwh);
    expect(heatDemand(200, "2011_2015", true).spaceHeatingKwh).toBeCloseTo(
      heatDemand(200, "after_2015").spaceHeatingKwh,
      6,
    );
  });

  it("uses the flats' figures for blocks", () => {
    const d = heatDemand(1000, "1971_1980", false, "multi");
    expect(d.totalKwh).toBeCloseTo(1000 * (94 * 1.15 + 16), 6);
  });

  it("reads the period from the register", () => {
    expect(periodOf(null, 1874)).toBe("before_1919");
    expect(periodOf(null, 1919)).toBe("1919_1945");
    expect(periodOf(null, 1985)).toBe("1981_1990");
    expect(periodOf(null, 2024)).toBe("after_2015");
    expect(periodOf(8018)).toBe("1991_2000");
    expect(periodOf(8023, 1999)).toBe("1991_2000");
    expect(periodOf(null)).toBeNull();
    expect(periodOf(9999)).toBeNull();
    expect(kindOf(1110)).toBe("single");
    expect(kindOf(1122)).toBe("multi");
    expect(kindOf(1220)).toBe("office");
    expect(kindOf(1242)).toBeNull(); // a garage
    expect(kindOf(null)).toBeNull();
  });
});
