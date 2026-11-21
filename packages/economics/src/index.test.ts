import { describe, expect, it } from "vitest";
import { BASIS, BUILDINGS, TARIFFS, building, estimate } from "./index";

describe("reference buildings", () => {
  it("keeps the reference house as on the economics page", () => {
    const house = building("basel_house");
    expect(house?.servers).toBe(6);
    expect(house?.shareOfHeatCoveredPct).toBe(79.6);
    expect(house?.results.swiss_median_2026.netBeforeHardwareChf).toBe(9683);
    expect(house?.results.swiss_median_2026.netAfterHardwareChf).toBe(1415);
  });

  it("has every building at every tariff, with the books balanced", () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(4);
    for (const b of BUILDINGS) {
      expect(b.defaultTariff in TARIFFS).toBe(true);
      for (const r of Object.values(b.results)) {
        expect(r.netBeforeHardwareChf).toBeCloseTo(
          r.computingIncomeChf - r.electricityCostChf + r.heatCreditChf,
          -1,
        );
        expect(r.netAfterHardwareChf).toBeCloseTo(
          r.netBeforeHardwareChf - r.hardwareChfPerYear,
          -1,
        );
      }
    }
  });

  it("charges more for power at IWB than at the Swiss median", () => {
    const house = building("basel_house");
    expect(TARIFFS.iwb_h4_2027.chfPerKwh).toBe(0.3342);
    expect(house?.results.iwb_h4_2027.electricityCostChf).toBeGreaterThan(
      house?.results.swiss_median_2026.electricityCostChf ?? Infinity,
    );
  });

  it("says what the figures assume", () => {
    expect(BASIS.computeChfPerServerHour).toBe(0.5);
    expect(BASIS.hardwareCase).toBe("mid");
  });
});

describe("estimate", () => {
  it("gives the reference house back for its own demand", () => {
    const house = building("basel_house");
    const e = estimate(house?.heatDemandKwh ?? 0, "swiss_median_2026");
    expect(e.servers).toBe(6);
    expect(e.netAfterHardwareChf).toBe(1415);
  });

  it("scales servers with heat demand and lands near the simulated buildings", () => {
    for (const b of BUILDINGS) {
      const e = estimate(b.heatDemandKwh, b.defaultTariff);
      expect(Math.abs(e.servers - b.servers) / b.servers).toBeLessThan(0.1);
    }
  });

  it("never gives a building fewer than one server", () => {
    expect(estimate(100).servers).toBe(1);
  });
});
