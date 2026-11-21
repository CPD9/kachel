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
});
