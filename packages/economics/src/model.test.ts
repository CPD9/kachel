import { describe, expect, it } from "vitest";
import summary from "../../../docs/economics/data/summary.json" with { type: "json" };
import { HARDWARE_CASES, hardware, kachelAt, paybackYears } from "./model";

const REF = summary.base_case;

describe("the reference house at its own price", () => {
  it("matches economics.py's summary.json for every hardware case", () => {
    const k = kachelAt(REF.heat_demand_kwh);
    expect(k?.servers).toBe(6);
    // Within a few francs: summary.json rounds the flows it is built from.
    expect(k?.beforeHardwareChf ?? 0).toBeCloseTo(summary.net_chf_per_house_before_hardware, -1);
    for (const c of HARDWARE_CASES) {
      const s = summary.hardware[c];
      expect(Math.round(hardware(c).capexChf)).toBe(s.capex_chf);
      expect(Math.round(hardware(c).perYearChf)).toBe(s.hardware_chf_per_year);
      expect(Math.round(k?.afterHardwareChf[c] ?? 0)).toBeCloseTo(s.net_chf_after_hardware, -1);
      const pb = k?.paybackYears[c] ?? Infinity;
      expect(Number.isFinite(pb) ? Math.round(pb * 10) / 10 : null).toBe(
        Number.isFinite(s.payback_years) ? s.payback_years : null,
      );
    }
  });

  it("balances income, electricity and the heat credit", () => {
    const k = kachelAt(REF.heat_demand_kwh);
    expect(Math.round(k?.electricityCostChf ?? 0)).toBeCloseTo(REF.electricity_cost_chf, -1);
    expect(Math.round(k?.heatCreditChf ?? 0)).toBeCloseTo(REF.value_of_heat_used_chf, -1);
  });
});

describe("another electricity price", () => {
  it("costs the electricity less the heat credit at the new price", () => {
    const at = (p: number) => kachelAt(REF.heat_demand_kwh, p)?.beforeHardwareChf ?? 0;
    const k = kachelAt(REF.heat_demand_kwh);
    const perRp = ((k?.electricityKwh ?? 0) - (k?.heatFromServersKwh ?? 0) / 2.5) / 100;
    expect(at(0.3342) - at(0.277)).toBeCloseTo(-perRp * 5.72, 6);
    expect(at(0.2)).toBeGreaterThan(at(0.3342));
  });

  it("pays back later when power is dearer", () => {
    const cheap = kachelAt(REF.heat_demand_kwh, 0.2)?.paybackYears.mid ?? 0;
    const dear = kachelAt(REF.heat_demand_kwh, 0.3342)?.paybackYears.mid ?? 0;
    expect(dear).toBeGreaterThan(cheap);
  });
});

describe("payback", () => {
  it("never pays back when the cash does not cover the interest", () => {
    expect(paybackYears(10_000, 0, 0.05)).toBe(Infinity);
    expect(paybackYears(10_000, 500, 0.05)).toBe(Infinity);
  });
});

describe("any building", () => {
  it("needs at least one server's heat", () => {
    expect(kachelAt(100)).toBeNull();
  });
});
