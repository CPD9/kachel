import { expect, it } from "vitest";
import { RACKS, size } from "./sizing";

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
