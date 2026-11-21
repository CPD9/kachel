import { expect, it } from "vitest";
import { DEFAULT_ANSWERS, defaultParams, ourModel, RACKS, size } from "./sizing";

it("gives Byfangweg 18's SFOE heat demand for the default answers", () => {
  // SFOE Sonnendach: 30,321 kWh space heating + 9,288 kWh hot water, as on the map's card
  expect(Math.round(size(DEFAULT_ANSWERS).demand)).toBe(39_609);
});

it("shows Kachel's own model in 1 kW servers at IWB's 2027 household price", () => {
  const m = ourModel(39_609);
  expect(m.servers).toBe(8);
  expect(m.tariff).toBe("iwb_h4_2027");
  expect(m.chfPerKwh).toBeCloseTo(0.3342);
});

const base = {
  windows: "double",
  emitters: "radiators",
  fuel: "oil",
  residents: 4,
  hotWater: true,
} as const;

it("picks the smallest rack that covers the peak load", () => {
  const r = size(base);
  expect(r.rack.kw).toBeGreaterThanOrEqual(r.peakKw);
  const smaller = RACKS.filter((k) => k.kw < r.rack.kw);
  expect(smaller.every((k) => k.kw < r.peakKw)).toBe(true);
});

it("needs a bigger rack with worse windows and saves less against a heat pump", () => {
  expect(size({ ...base, windows: "single" }).rack.kw).toBeGreaterThan(
    size({ ...base, windows: "triple" }).rack.kw,
  );
  expect(size({ ...base, fuel: "heatpump" }).savingsPerYear).toBeLessThan(
    size(base).savingsPerYear,
  );
});

it("starts the projection at minus the install cost and pays back over time", () => {
  const r = size(base);
  expect(r.cumulative[0]).toBeLessThan(0);
  expect(r.cumulative.at(-1)).toBeGreaterThan(0);
});

it("follows the adjustable assumptions", () => {
  const p = defaultParams(base.fuel);
  expect(size(base, { ...p, subsidy: 4000 }).paybackYears).toBeLessThan(size(base, p).paybackYears);
  expect(size(base, { ...p, heatPrice: 0.25 }).savingsPerYear).toBeGreaterThan(
    size(base, p).savingsPerYear,
  );
  expect(size(base, { ...p, years: 20 }).cumulative).toHaveLength(21);
});
