import { describe, expect, it } from "vitest";
import { energy, moneyKpis, previous, previousName, todayKpis, withPrevious } from "./kpis";
import { MONTHS } from "./months";

describe("the dashboard figures", () => {
  it("compares January with December of the same model year", () => {
    expect(previous({ month: 0, offset: 2 })).toEqual({ month: 11, offset: 2 });
    expect(previousName(6)).toBe("June");
  });

  it("splits the servers' electricity into heat captured and not, and the heat into homes and vented", () => {
    const { now } = withPrevious(MONTHS, { month: 0, offset: 0 });
    const e = energy(MONTHS, now);
    expect(e.capturedKwh + e.notCapturedKwh).toBeCloseTo(e.electricityKwh);
    expect(e.capturedKwh).toBeCloseTo(e.electricityKwh * MONTHS.prices.heat_recovery);
    expect(e.used).toBeGreaterThan(0.9);
    expect(e.used).toBeLessThanOrEqual(1);
  });

  it("keeps the margin the scheduler counts: paid − electricity + heat credit", () => {
    const { now } = withPrevious(MONTHS, { month: 6, offset: 0 });
    const k = moneyKpis(now);
    expect(k.revenue - k.electricity + k.heatCredit).toBeCloseTo(k.margin);
    expect(k.marginShare).toBeCloseTo(k.margin / k.revenue);
  });

  it("counts the homes warm on server heat and the servers running", () => {
    const { now } = withPrevious(MONTHS, { month: 0, offset: 0 });
    const t = todayKpis(now);
    expect(t.homes).toBe(100);
    expect(t.warm).toBeLessThanOrEqual(100);
    expect(t.runningShare).toBeLessThanOrEqual(1);
    expect(t.coveredShare + t.backupShare).toBeCloseTo(1, 2);
  });
});
