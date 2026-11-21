import { expect, it } from "vitest";
import { defaultParams, RACKS, size } from "./sizing";

const base = {
  windows: "double",
  emitters: "radiators",
  fuel: "oil",
  adults: 2,
  children: 2,
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
  expect(size(base, { ...p, insulation: "thermos" }).spaceHeat).toBeLessThan(
    size(base, p).spaceHeat,
  );
  expect(size(base, { ...p, renovated: true }).spaceHeat).toBeLessThan(size(base, p).spaceHeat);
  expect(size(base, { ...p, age: 10 }).spaceHeat).toBeLessThan(size(base, p).spaceHeat);
  expect(size(base, { ...p, heatPrice: 0.25 }).savingsPerYear).toBeGreaterThan(
    size(base, p).savingsPerYear,
  );
  expect(size(base, p).cumulative).toHaveLength(11);
});
