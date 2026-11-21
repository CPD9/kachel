import { describe, expect, it } from "vitest";
import summary from "../../../../docs/economics/data/summary.json";
import { formatChf, kachelEstimate } from "./kachel";

describe("Kachel estimate", () => {
  it("gives back the reference house for its own heat demand", () => {
    const e = kachelEstimate(31_231);
    expect(e?.servers).toBe(6);
    expect(e?.beforeHardwareChf).toBe(summary.net_chf_per_house_before_hardware);
    expect(e?.afterHardwareChf.mid).toBe(summary.hardware.mid.net_chf_after_hardware);
    expect(e?.electricityKwh).toBe(summary.base_case.server_hours_sold);
  });

  it("scales with whole servers", () => {
    const e = kachelEstimate(3 * 31_231);
    expect(e?.servers).toBe(18);
    expect(e?.beforeHardwareChf).toBeCloseTo(3 * summary.net_chf_per_house_before_hardware);
    expect(e?.heatFromServersKwh).toBeCloseTo(3 * 31_231 * 0.796);
  });

  it("has nothing for a building too small for one server", () => {
    expect(kachelEstimate(2_000)).toBeNull();
  });

  it("formats francs with a real minus sign", () => {
    expect(formatChf(-4_765)).toBe("−4,770 CHF");
    expect(formatChf(9_683)).toBe("9,680 CHF");
  });
});
