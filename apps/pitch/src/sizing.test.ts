import { expect, it } from "vitest";
import { heatDemand } from "@kachel/economics/house";
import { answersFor, DEFAULT_ANSWERS, defaultParams, ourModel, RACKS, size } from "./sizing";
import { targetFor } from "./target";

it("gives Byfangweg 18's SFOE heat demand for the default answers", () => {
  // SFOE Sonnendach: 30,321 kWh space heating + 9,288 kWh hot water, as on the map's card
  expect(DEFAULT_ANSWERS.fuel).toBe("district");
  expect(Math.round(size(DEFAULT_ANSWERS).demand)).toBe(39_609);
});

it("gives FHNW Campus Dreispitz our period estimate for its default answers", () => {
  const fhnw = targetFor("?at=fhnw").building;
  const a = answersFor(fhnw);
  const r = size(a, defaultParams(a.fuel, fhnw), null, fhnw);
  expect(r.demand).toBeCloseTo(heatDemand(14_436, "after_2015", false, "school").totalKwh);
  // Built 2026: new on the age slider, whatever year the demo runs in
  expect(defaultParams(a.fuel, fhnw).age).toBe(
    Math.min(150, Math.round((new Date().getFullYear() - 2026) / 5) * 5),
  );
});

it("shows Kachel's own model in 1 kW servers at Basel's ElCom 2027 price", () => {
  const m = ourModel(39_609);
  expect(m.kachel?.servers).toBe(8);
  expect(m.price.municipality).toBe("Basel");
  expect(m.price.chfPerKwh).toBeCloseTo(0.3342);
  expect(m.lifeYears).toBe(6);
  expect(m.resaleChf).toBeGreaterThan(0);
});

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

it("asks a school about its use and hot water, and scales the campus's heat by them", () => {
  const fhnw = targetFor("?at=fhnw").building;
  const a = answersFor(fhnw);
  expect(a).toMatchObject({
    windows: "triple",
    fuel: "district",
    use: "term",
    hotWater: "canteen",
  });
  const p = defaultParams(a.fuel, fhnw);
  const at = (more: Partial<typeof a>) => size({ ...a, ...more }, p, null, fhnw);
  expect(at({ use: "allYear" }).spaceHeat).toBeGreaterThan(at({}).spaceHeat);
  expect(at({ hotWater: "sports" }).hotWater).toBeGreaterThan(at({}).hotWater);
  expect(at({ hotWater: "basins" }).spaceHeat).toBeCloseTo(at({}).spaceHeat);
  // A home is not asked: its answers leave both out
  expect(DEFAULT_ANSWERS.use).toBeUndefined();
});
