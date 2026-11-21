import { describe, expect, it } from "vitest";
import { DEFAULT_SIM, demandKw, simulateDay, simulateMonth } from "./simulation";

describe("simulation", () => {
  it("needs more heat when it's colder", () => {
    expect(demandKw(-5)).toBeGreaterThan(demandKw(5));
    expect(demandKw(25)).toBeGreaterThan(0); // hot water only
  });

  it("runs batch jobs only while the house wants heat, within the rack", () => {
    for (const h of simulateDay(0, DEFAULT_SIM)) {
      expect(h.customers + h.batch).toBeLessThanOrEqual(DEFAULT_SIM.rackKw + 1e-9);
      expect(h.used).toBeLessThanOrEqual(h.demand + 1e-9);
    }
    expect(simulateDay(25, DEFAULT_SIM).every((h) => h.batch === 0)).toBe(true);
  });

  it("earns more in a cold snap than in summer", () => {
    const jan = simulateMonth(0, "snow", DEFAULT_SIM);
    const jul = simulateMonth(6, "clear", DEFAULT_SIM);
    expect(jan.net).toBeGreaterThan(jul.net);
    expect(jan.coverage).toBeGreaterThan(0.5);
  });

  it("counts only the neighbours who signed up", () => {
    const none = { ...DEFAULT_SIM, signed: DEFAULT_SIM.signed.map(() => false) };
    expect(simulateMonth(0, "clear", none).subscriptions).toBe(0);
    expect(simulateMonth(0, "clear", DEFAULT_SIM).subscriptions).toBeGreaterThan(0);
  });

  it("runs only as much far-away work as there is demand for", () => {
    const none = { ...DEFAULT_SIM, remote: 0 };
    expect(simulateDay(0, none).every((h) => h.batch === 0)).toBe(true);
    expect(simulateDay(0, { ...DEFAULT_SIM, remote: 2 }).every((h) => h.batch <= 2)).toBe(true);
    expect(simulateMonth(0, "clear", DEFAULT_SIM).net).toBeGreaterThan(
      simulateMonth(0, "clear", none).net,
    );
  });

  it("earns less whenever a neighbour switches off, at any prices", () => {
    const prices = [
      { power: 0.27, batch: 0.34, heat: 0.14 },
      { power: 0.12, batch: 0.6, heat: 0.3 },
      { power: 0.45, batch: 0.15, heat: 0.06 },
      { power: 0.12, batch: 0.6, heat: 0.06 },
    ];
    for (const price of prices)
      for (const weather of ["clear", "rain", "snow"] as const)
        for (let m = 0; m < 12; m++)
          DEFAULT_SIM.signed.forEach((_, i) => {
            const all = { ...DEFAULT_SIM, ...price };
            const off = { ...all, signed: all.signed.map((on, j) => on && j !== i) };
            expect(simulateMonth(m, weather, off).net).toBeLessThan(
              simulateMonth(m, weather, all).net,
            );
          });
  });
});
