import { periodFactor, periodOf, type PeriodId } from "@kachel/economics/house";
import { hardware, kachelAt, type Kachel } from "@kachel/economics/model";
import { savedPrice, type Price } from "@kachel/economics/prices";
import { TARGET, type Published } from "./target";

/**
 * Sizing for the pitch: from a few answers about the home, how much heat it needs, which
 * Kachel rack fits and what it saves. Rough numbers, not an engineering calculation.
 *
 * Anchored on the demo building's published figures (target.ts): its heat a year from SFOE
 * Sonnendach, or our period estimate where SFOE has none, exactly as on the map's card. The default
 * answers give that demand; other answers scale it. Age and renovation scale it by the period
 * factors in packages/economics (SIA 2024 means; renovation halves space heating); windows,
 * emitters, insulation and people by Duc's factors, which are assumptions, to check. So are the
 * prices, install cost, subsidy and CO₂ figures, and the screen says so. Kachel's own model
 * (packages/economics) sizes in 1 kW servers; ourModel() shows its figures beside the racks.
 */

export type Windows = "single" | "double" | "triple";
export type Emitters = "radiators" | "underfloor" | "mixed";
export type Fuel = "oil" | "gas" | "heatpump" | "electric" | "district";
export type Insulation = "bare" | "attic" | "facade" | "thermos";
/** A school's hours: in term on weekdays, also evenings and weekends, or all year. */
export type Use = "term" | "evenings" | "allYear";
/** What a school uses hot water for: washbasins, a canteen, or a canteen and showers. */
export type HotWater = "basins" | "canteen" | "showers";

export type Answers = {
  windows: Windows;
  emitters: Emitters;
  fuel: Fuel;
  adults: number;
  children: number;
  /** Only asked for a school (the campus); a home leaves them out. */
  use?: Use;
  hotWater?: HotWater;
};

/** Where the questions start: a typical home, heated as the register says (district heating). */
export const answersFor = (b: Published): Answers => ({
  // A building of the last ten years has triple glazing; for older ones, an assumption
  windows: b.built > 2015 ? "triple" : "double",
  emitters: "radiators",
  fuel: b.heating,
  adults: 2,
  children: 2,
  // A school's figures are SIA 2024 means: term-time use and a canteen are taken as the mean
  ...(b.kind === "school" && { use: "term", hotWater: "canteen" }),
});
export const DEFAULT_ANSWERS: Answers = answersFor(TARGET.building);

export type Rack = { id: string; name: string; kw: number; servers: number; size: string };

/** Space heating need per m² and year, by how well the windows keep the heat in (kWh). */
const DEMAND_PER_M2: Record<Windows, number> = { single: 150, double: 115, triple: 90 };
/** Underfloor heating runs at a lower water temperature, so server heat covers more of it. */
const EMITTER_FACTOR: Record<Emitters, number> = { radiators: 1, mixed: 0.97, underfloor: 0.93 };
/** Hot water per person and year (kWh): children use a bit less than adults. */
const HOT_WATER_PER_ADULT = 800;
const HOT_WATER_PER_CHILD = 500;
/** A school's space heating against term-time use (the SIA mean). Assumptions, to check. */
export const USE_FACTOR: Record<Use, number> = { term: 1, evenings: 1.15, allYear: 1.3 };
/** A school's hot water against one with a canteen (the SIA mean). Assumptions, to check. */
export const HOT_WATER_FACTOR: Record<HotWater, number> = { basins: 0.5, canteen: 1, showers: 1.8 };
/** How much of the heat insulation keeps in: roof, outer walls, or both. */
export const INSULATION: Record<Insulation, { name: string; hint: string; factor: number }> = {
  bare: { name: "Bare", hint: "Heat slips out through roof and walls", factor: 1 },
  attic: { name: "Hat", hint: "A warm hat: the attic is insulated", factor: 0.9 },
  facade: { name: "Coat", hint: "A warm coat: the outer walls are wrapped", factor: 0.82 },
  thermos: { name: "Thermos", hint: "Roof and walls, sealed like a thermos", factor: 0.7 },
};
/** The year the questions are asked in, for turning the building's age into its period. */
const THIS_YEAR = new Date().getFullYear();
/** The construction period for an age in years (GWR periods, packages/economics). */
const periodAt = (age: number): PeriodId => periodOf(null, THIS_YEAR - age) ?? "after_2015";
/** Connecting the rack to the heating and hot water, in CHF, and the cantonal subsidy for leaving fossil heating. */
const INSTALL_COST = 6500;
const FOSSIL_SUBSIDY = 2000;
/** How many years the projection runs. */
export const YEARS = 10;
/** Full-load hours a year: turns yearly heat into the size of the heater. */
const FULL_LOAD_HOURS = 2000;

/** Cost of a kWh of heat today, in CHF, and CO₂ per kWh of heat, in kg. Assumptions, to check. */
export const FUELS: Record<Fuel, { name: string; price: number; co2: number }> = {
  oil: { name: "Oil boiler", price: 0.15, co2: 0.32 },
  gas: { name: "Gas boiler", price: 0.14, co2: 0.24 },
  heatpump: { name: "Heat pump", price: 0.09, co2: 0.03 },
  electric: { name: "Electric", price: 0.3, co2: 0.1 },
  district: { name: "District heating", price: 0.13, co2: 0.09 },
};
/** The assumptions behind the money side, adjustable on the result page. */
export type Params = {
  /** What a kWh of heat costs today, in CHF. */
  heatPrice: number;
  /** What Kachel heat costs: the computing customers pay for most of the electricity. */
  kachelPrice: number;
  /** Yearly rise of today's heating price, e.g. 0.03 for 3 %. */
  priceRise: number;
  /** Age of the building, in years. */
  age: number;
  /** Whether the building has been renovated. */
  renovated: boolean;
  /** How well roof and walls are insulated. */
  insulation: Insulation;
};

/** The building's age on the slider (steps of 5 years, at most 150), from the register. */
const ageOf = (b: Published) => Math.min(150, Math.round((THIS_YEAR - b.built) / 5) * 5);

/** The sliders' start: the building's age from the register; the money side is assumptions. */
export const defaultParams = (fuel: Fuel, b: Published = TARGET.building): Params => ({
  heatPrice: FUELS[fuel].price,
  kachelPrice: 0.05,
  priceRise: 0.03,
  age: ageOf(b),
  renovated: false,
  // A new building is sealed like a thermos; for older ones, bare is an assumption
  insulation: b.built > 2015 ? "thermos" : "bare",
});

/** The biggest set-up, for homes that need more than any single rack. */
const TWIN_XL: Rack = {
  id: "xl",
  name: "Kachel Twin XL",
  kw: 40,
  servers: 40,
  size: "Two racks · 1.6 m²",
};

export const RACKS: Rack[] = [
  { id: "s", name: "Kachel Tile S", kw: 8, servers: 8, size: "Half rack · 0.6 m²" },
  { id: "m", name: "Kachel Rack M", kw: 15, servers: 16, size: "One rack · 0.8 m²" },
  { id: "l", name: "Kachel Rack L", kw: 24, servers: 24, size: "One rack · 0.8 m²" },
  TWIN_XL,
];

export type Result = {
  spaceHeat: number;
  hotWater: number;
  demand: number;
  peakKw: number;
  /** The rack these numbers are for: the best fit, or the one picked instead. */
  rack: Rack;
  /** The smallest rack that covers the peak load. */
  bestFit: Rack;
  /** Share of the yearly heat the rack covers, 0–1; the old heating tops up the rest. */
  coverage: number;
  savingsPerYear: number;
  paybackYears: number;
  co2Tonnes: number;
  /** Money saved so far after each year, install cost already taken off (year 0 = −install). */
  cumulative: number[];
};

/** Hot water for these residents, in Duc's units; only its ratio to the default counts. */
const people = (a: Answers) => a.adults * HOT_WATER_PER_ADULT + a.children * HOT_WATER_PER_CHILD;

export function size(
  a: Answers,
  p: Params = defaultParams(a.fuel),
  pick: Rack | null = null,
  b: Published = TARGET.building,
): Result {
  // The published figure, scaled by each answer against the default answer
  const da = answersFor(b);
  const dp = defaultParams(da.fuel, b);
  const spaceHeat =
    b.spaceHeatingKwh *
    (DEMAND_PER_M2[a.windows] / DEMAND_PER_M2[da.windows]) *
    (EMITTER_FACTOR[a.emitters] / EMITTER_FACTOR[da.emitters]) *
    (periodFactor(periodAt(p.age), p.renovated) / periodFactor(periodAt(dp.age), dp.renovated)) *
    (INSULATION[p.insulation].factor / INSULATION[dp.insulation].factor) *
    (USE_FACTOR[a.use ?? "term"] / USE_FACTOR[da.use ?? "term"]);
  const hotWater =
    ((b.hotWaterKwh * people(a)) / people(da)) *
    (HOT_WATER_FACTOR[a.hotWater ?? "canteen"] / HOT_WATER_FACTOR[da.hotWater ?? "canteen"]);
  const demand = spaceHeat + hotWater;
  const peakKw = demand / FULL_LOAD_HOURS;
  const bestFit = RACKS.find((r) => r.kw >= peakKw) ?? TWIN_XL;
  const rack = pick ?? bestFit;
  // Servers run all year, but some heat lands when nobody needs it: cap what counts
  const coverage = Math.min(0.92, (rack.kw * FULL_LOAD_HOURS * 0.95) / demand);
  const covered = demand * coverage;
  const subsidy = a.fuel === "oil" || a.fuel === "gas" ? FOSSIL_SUBSIDY : 0;
  const net = Math.max(0, INSTALL_COST - subsidy);
  const savingsPerYear = covered * Math.max(0, p.heatPrice - p.kachelPrice);
  const cumulative = [-net];
  for (let y = 1; y <= YEARS; y++) {
    const yearly =
      covered * Math.max(0, p.heatPrice * (1 + p.priceRise) ** (y - 1) - p.kachelPrice);
    cumulative.push((cumulative[y - 1] ?? 0) + yearly);
  }
  return {
    spaceHeat,
    hotWater,
    demand,
    peakKw,
    rack,
    bestFit,
    coverage,
    savingsPerYear,
    paybackYears: savingsPerYear > 0 ? net / savingsPerYear : Infinity,
    co2Tonnes: (covered * FUELS[a.fuel].co2) / 1000,
    cumulative,
  };
}

/** What Kachel's own model says for this heat demand (packages/economics), as the map's card. */
export interface OurModel {
  kachel: Kachel | null;
  price: Price;
  /** The mid hardware case: its life and what the servers fetch when sold at the end of it. */
  lifeYears: number;
  resaleChf: number;
}

/** 1 kW servers at the municipality's ElCom 2027 household price, the mid hardware case. */
export function ourModel(demandKwh: number, b: Published = TARGET.building): OurModel {
  const price = savedPrice(b.bfs);
  const kachel = kachelAt(demandKwh, price.chfPerKwh);
  const hw = hardware("mid", kachel?.servers ?? 1);
  return { kachel, price, lifeYears: hw.lifeYears, resaleChf: hw.resaleChf };
}
