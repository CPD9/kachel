import { describe, expect, it } from "vitest";
import summary from "../../../docs/economics/data/summary.json" with { type: "json" };
import { HARDWARE_CASES, SERVER_SIZES, hardware, kachelAt, paybackYears } from "./model";

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

describe("hardware life and resale", () => {
  it("lasts six years in the mid case and sells the servers for 7.5% at the end", () => {
    const h = hardware("mid");
    expect(h.lifeYears).toBe(6);
    expect(h.resaleChf).toBeCloseTo(6 * 5034 * 0.075, 6);
    expect(h.netCapexChf).toBeCloseTo(h.capexChf - h.resaleChf / 1.0375 ** 6, 6);
    expect(Math.round(h.resaleChf)).toBe(summary.hardware.mid.resale_chf);
  });

  it("pays back sooner with the resale than without", () => {
    const h = hardware("mid");
    const cash = summary.net_chf_per_house_before_hardware - h.upkeepChfPerYear;
    expect(paybackYears(h.netCapexChf, cash, h.rate)).toBeLessThan(
      paybackYears(h.capexChf, cash, h.rate),
    );
  });
});

describe("server size", () => {
  const size = (id: string) => {
    const s = SERVER_SIZES.find((x) => x.id === id);
    if (s === undefined) throw new Error(`no size ${id}`);
    return s;
  };

  it("offers 0.5, 1 and 2 kW and the 0.7 kW GPU workstation", () => {
    expect(SERVER_SIZES.map((s) => s.kw)).toEqual([0.5, 1, 2, 0.7]);
    expect(size("gpu").gpu).toBe(true);
  });

  it("counts servers by size for the same heat", () => {
    expect(kachelAt(REF.heat_demand_kwh, 0.277, size("0.5kw"))?.servers).toBe(12);
    expect(kachelAt(REF.heat_demand_kwh, 0.277, size("2kw"))?.servers).toBe(3);
    // 6 kW of GPU workstations at 0.7 kW: 8.57, so 9.
    expect(kachelAt(REF.heat_demand_kwh, 0.277, size("gpu"))?.servers).toBe(9);
  });

  it("keeps the flows per kW, and charges each server its own water loop", () => {
    const one = kachelAt(REF.heat_demand_kwh, 0.277, size("1kw"));
    const half = kachelAt(REF.heat_demand_kwh, 0.277, size("0.5kw"));
    expect(half?.beforeHardwareChf).toBeCloseTo(one?.beforeHardwareChf ?? 0, 6);
    const kit = hardware("mid", 12, size("0.5kw")).capexChf - hardware("mid").capexChf;
    expect(kit).toBeCloseTo(6 * 633, 6);
    expect(half?.afterHardwareChf.mid).toBeLessThan(one?.afterHardwareChf.mid ?? 0);
  });

  it("prices the GPU workstation at its case's full server price", () => {
    const gpu = hardware("mid", 9, size("gpu"));
    const labour = (35_655 - 6 * (5034 + 633)) * ((9 * 0.7) / 6);
    expect(gpu.capexChf).toBeCloseTo(9 * (5034 + 633) + labour, 0);
  });

  it("gives a small house one 0.5 kW server where 1 kW would be too much", () => {
    expect(kachelAt(2_000)).toBeNull();
    expect(kachelAt(2_000, 0.277, size("0.5kw"))?.servers).toBe(1);
  });
});

describe("any building", () => {
  it("needs at least one server's heat", () => {
    expect(kachelAt(100)).toBeNull();
  });
});
