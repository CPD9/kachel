/**
 * Mock sizing for the pitch: from a few answers about the home, how much heat it needs, which
 * Kachel rack fits and what it saves. Rough, plausible numbers, not an engineering calculation.
 */

export type Windows = "single" | "double" | "triple";
export type Emitters = "radiators" | "underfloor" | "mixed";
export type Fuel = "oil" | "gas" | "heatpump" | "electric";

export type Answers = {
  windows: Windows;
  emitters: Emitters;
  fuel: Fuel;
  residents: number;
  hotWater: boolean;
};

/** Where the questions start: a typical home. */
export const DEFAULT_ANSWERS: Answers = {
  windows: "double",
  emitters: "radiators",
  fuel: "oil",
  residents: 4,
  hotWater: true,
};

export type Rack = { id: string; name: string; kw: number; servers: number; size: string };

/** Heated area of the demo building, in m². */
export const AREA = 300;

/** Space heating need per m² and year, by how well the windows keep the heat in (kWh). */
const DEMAND_PER_M2: Record<Windows, number> = { single: 150, double: 115, triple: 90 };
/** Underfloor heating runs at a lower water temperature, so server heat covers more of it. */
const EMITTER_FACTOR: Record<Emitters, number> = { radiators: 1, mixed: 0.97, underfloor: 0.93 };
/** Hot water per person and year (kWh). */
const HOT_WATER_PER_PERSON = 800;
/** Full-load hours a year: turns yearly heat into the size of the heater. */
const FULL_LOAD_HOURS = 2000;

/** Cost of a kWh of heat today, in CHF, and CO₂ per kWh of heat, in kg. */
export const FUELS: Record<Fuel, { name: string; price: number; co2: number }> = {
  oil: { name: "Oil boiler", price: 0.15, co2: 0.32 },
  gas: { name: "Gas boiler", price: 0.14, co2: 0.24 },
  heatpump: { name: "Heat pump", price: 0.09, co2: 0.03 },
  electric: { name: "Electric", price: 0.3, co2: 0.1 },
};
/** The assumptions behind the money side, adjustable on the result page. */
export type Params = {
  /** What a kWh of heat costs today, in CHF. */
  heatPrice: number;
  /** What Kachel heat costs: the computing customers pay for most of the electricity. */
  kachelPrice: number;
  /** Yearly rise of today's heating price, e.g. 0.03 for 3 %. */
  priceRise: number;
  /** One-off cost of connecting the rack to the heating and hot water, in CHF. */
  installCost: number;
  /** Cantonal subsidy for leaving fossil heating, taken off the install cost, in CHF. */
  subsidy: number;
  /** How many years the projection runs. */
  years: number;
};

export const defaultParams = (fuel: Fuel): Params => ({
  heatPrice: FUELS[fuel].price,
  kachelPrice: 0.05,
  priceRise: 0.03,
  installCost: 6500,
  subsidy: fuel === "oil" || fuel === "gas" ? 2000 : 0,
  years: 10,
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

export function size(
  a: Answers,
  p: Params = defaultParams(a.fuel),
  pick: Rack | null = null,
): Result {
  const spaceHeat = AREA * DEMAND_PER_M2[a.windows] * EMITTER_FACTOR[a.emitters];
  const hotWater = a.hotWater ? a.residents * HOT_WATER_PER_PERSON : 0;
  const demand = spaceHeat + hotWater;
  const peakKw = demand / FULL_LOAD_HOURS;
  const bestFit = RACKS.find((r) => r.kw >= peakKw) ?? TWIN_XL;
  const rack = pick ?? bestFit;
  // Servers run all year, but some heat lands when nobody needs it: cap what counts
  const coverage = Math.min(0.92, (rack.kw * FULL_LOAD_HOURS * 0.95) / demand);
  const covered = demand * coverage;
  const net = Math.max(0, p.installCost - p.subsidy);
  const savingsPerYear = covered * Math.max(0, p.heatPrice - p.kachelPrice);
  const cumulative = [-net];
  for (let y = 1; y <= p.years; y++) {
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
