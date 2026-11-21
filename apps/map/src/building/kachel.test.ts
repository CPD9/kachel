import { describe, expect, it } from "vitest";
import summary from "../../../../docs/economics/data/summary.json";
import { formatChf, kachelEstimate } from "./kachel";

describe("Kachel estimate", () => {
  it("gives back the reference house for its own heat demand", () => {
    const e = kachelEstimate(31_231);
    expect(e?.servers).toBe(6);
    expect(e?.beforeHardwareChf).toBeCloseTo(summary.net_chf_per_house_before_hardware, -1);
    expect(e?.afterHardwareChf.mid).toBeCloseTo(summary.hardware.mid.net_chf_after_hardware, -1);
    expect(e?.paybackYears.mid).toBeCloseTo(summary.hardware.mid.payback_years, 1);
    expect(e?.electricityKwh).toBe(summary.base_case.server_hours_sold);
  });

  it("scales with whole servers", () => {
    const e = kachelEstimate(3 * 31_231);
    expect(e?.servers).toBe(18);
    // Within a few francs a house: summary.json rounds the flows.
    expect(
      Math.abs((e?.beforeHardwareChf ?? 0) - 3 * summary.net_chf_per_house_before_hardware),
    ).toBeLessThan(15);
    expect(e?.heatFromServersKwh).toBeCloseTo(3 * 31_231 * 0.796);
  });

  it("gives a small house only the heat its one server makes", () => {
    const e = kachelEstimate(7_000);
    expect(e?.servers).toBe(1);
    expect(e?.heatFromServersKwh).toBeCloseTo((31_231 * 0.796) / 6);
    expect(e?.sharePct).toBeCloseTo((100 * (31_231 * 0.796)) / 6 / 7_000);
  });

  it("has nothing for a building too small for one server", () => {
    expect(kachelEstimate(2_000)).toBeNull();
  });

  it("formats francs with a real minus sign", () => {
    expect(formatChf(-4_765)).toBe("−4,770 CHF");
    expect(formatChf(9_683)).toBe("9,680 CHF");
  });
});
