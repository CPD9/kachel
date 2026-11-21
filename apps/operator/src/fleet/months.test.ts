import { describe, expect, it } from "vitest";
import { fleetMonth, fleetYear, money, MONTHS } from "./months";

describe("the fleet month by month", () => {
  it("holds the whole Basel and Bern fleet, synthetic, with a what-if at 0 °C", () => {
    expect(MONTHS.synthetic).toBe(true);
    expect(MONTHS.houses).toHaveLength(100);
    expect(MONTHS.offsets_c).toContain(0);
    expect(MONTHS.hours.reduce((a, b) => a + b, 0)).toBe(8760);
  });

  it("adds every house up to the fleet, and splits by city", () => {
    const all = fleetMonth(MONTHS, { month: 0, offset: 0 });
    const basel = fleetMonth(MONTHS, { month: 0, offset: 0 }, "Basel");
    const bern = fleetMonth(MONTHS, { month: 0, offset: 0 }, "Bern");
    expect(basel.houses).toHaveLength(50);
    expect(basel.demandKwh + bern.demandKwh).toBeCloseTo(all.demandKwh);
    // Each house's monthly sums are rounded to whole kWh.
    expect(Math.abs(all.servedKwh + all.backupKwh - all.demandKwh)).toBeLessThanOrEqual(100);
    expect(all.running).toBeLessThanOrEqual(all.servers);
    expect(all.peakRunning).toBeGreaterThanOrEqual(all.running);
  });

  it("needs less heat and fewer servers in summer and in a warmer year", () => {
    const january = fleetMonth(MONTHS, { month: 0, offset: 0 });
    const july = fleetMonth(MONTHS, { month: 6, offset: 0 });
    const warmer = fleetMonth(MONTHS, { month: 0, offset: 4 });
    expect(july.demandKwh).toBeLessThan(january.demandKwh / 3);
    expect(july.running).toBeLessThan(january.running);
    expect(warmer.demandKwh).toBeLessThan(january.demandKwh);
    expect(warmer.money.revenue).toBeLessThan(january.money.revenue);
    expect(warmer.temp.Basel).toBeCloseTo((january.temp.Basel ?? 0) + 4);
  });

  it("counts money as the scheduler's kpis do", () => {
    const p = MONTHS.prices;
    const m = money(MONTHS, 100, 80);
    expect(m.revenue).toBeCloseTo(100 * p.compute_chf_per_server_hour);
    expect(m.electricity).toBeCloseTo(100 * p.server_power_kw * p.electricity_chf_per_kwh);
    expect(m.heatValue).toBeCloseTo((80 * p.electricity_chf_per_kwh) / p.heat_pump_cop);
    expect(m.margin).toBeCloseTo(m.revenue - m.electricity + m.heatValue);
  });

  it("makes the year the sum of its months", () => {
    const year = fleetYear(MONTHS, 0);
    const total = MONTHS.houses.reduce(
      (s, h) => s + (h.server_hours[MONTHS.offsets_c.indexOf(0)] ?? []).reduce((a, b) => a + b, 0),
      0,
    );
    expect(year.serverHours).toBe(total);
    expect(() => fleetMonth(MONTHS, { month: 0, offset: 99 })).toThrow();
  });
});
