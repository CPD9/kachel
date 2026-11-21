import { describe, expect, it } from "vitest";
import summary from "../../../docs/economics/data/summary.json" with { type: "json" };
import {
  BASIS,
  BUILDINGS,
  SERVER_SIZES,
  SOLAR,
  TARIFFS,
  building,
  estimate,
  tariffFor,
} from "./index";

describe("solar", () => {
  it("keeps the roof's saving and payback as on the economics page", () => {
    const base = SOLAR.byPrice.find((p) => p.chfPerKwh === 0.277);
    expect(base?.setups.pv.savingChfPerYear).toBe(2434);
    expect(base?.setups.pv.paybackYearsMid).toBe(8.2);
    expect(base?.setups.pv.ownPvShareOfServerPowerPct).toBe(18.6);
    expect(base?.setups.none.savingChfPerYear).toBeNull();
    expect(SOLAR.roofKwp).toBe(10);
  });

  it("matches the economics page's summary.json", () => {
    const solar = summary.solar as Record<string, Record<string, { saving_chf_per_year?: number }>>;
    for (const p of SOLAR.byPrice) {
      const page = solar[p.chfPerKwh.toFixed(4)];
      expect(p.setups.pv.savingChfPerYear).toBe(page?.["pv"]?.saving_chf_per_year);
      expect(p.setups.pv_battery.savingChfPerYear).toBe(page?.["pv_battery"]?.saving_chf_per_year);
    }
  });
});

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

  it("picks the business tariff for anything that is not a home", () => {
    expect(tariffFor("flats")).toBe("iwb_h4_2027");
    expect(tariffFor("office")).toBe("iwb_c3_2027");
    expect(estimate(144_000, tariffFor("office")).tariff).toBe("iwb_c3_2027");
    expect(estimate(31_231).tariff).toBe("iwb_h4_2027");
  });

  it("takes the server size: count follows, smaller servers pay for more water loops", () => {
    const house = building("basel_house");
    const demand = house?.heatDemandKwh ?? 0;
    const sizes = Object.fromEntries(SERVER_SIZES.map((s) => [s.id, s]));
    const half = estimate(demand, "swiss_median_2026", sizes["0.5kw"]);
    const two = estimate(demand, "swiss_median_2026", sizes["2kw"]);
    expect([half.servers, half.serverKw]).toEqual([12, 0.5]);
    expect([two.servers, two.serverKw]).toEqual([3, 2]);
    expect(half.netBeforeHardwareChf).toBe(9683);
    expect(half.netAfterHardwareChf).toBeLessThan(1415);
    expect(two.netAfterHardwareChf).toBeGreaterThan(1415);
    expect(estimate(demand, "swiss_median_2026", sizes["gpu"]).servers).toBe(9);
  });

  it("never gives a building fewer than one server", () => {
    expect(estimate(100).servers).toBe(1);
  });
});
