import { NEIGHBOURS } from "./neighbours";

/**
 * A simple hour-by-hour model of the rack at HOME over a year, for the pitch: the neighbours'
 * computing runs on it, Kachel tops it up with batch jobs whenever the house needs more heat,
 * and the heat replaces what the house would otherwise buy. Demo numbers, not a forecast.
 */

/** Basel, monthly mean outdoor temperature (°C, rounded long-term averages). */
export const MONTHS = [
  { name: "Jan", temp: 1.5, days: 31 },
  { name: "Feb", temp: 2.5, days: 28 },
  { name: "Mar", temp: 6.5, days: 31 },
  { name: "Apr", temp: 10, days: 30 },
  { name: "May", temp: 14, days: 31 },
  { name: "Jun", temp: 17.5, days: 30 },
  { name: "Jul", temp: 19.5, days: 31 },
  { name: "Aug", temp: 19, days: 31 },
  { name: "Sep", temp: 15, days: 30 },
  { name: "Oct", temp: 10.5, days: 31 },
  { name: "Nov", temp: 5.5, days: 30 },
  { name: "Dec", temp: 2.5, days: 31 },
] as const;

export type Weather = "clear" | "rain" | "snow";
/** Weather shifts the picked month's temperature. */
export const WEATHER: Record<Weather, { label: string; offset: number }> = {
  clear: { label: "Clear", offset: 0 },
  rain: { label: "Rain", offset: -2 },
  snow: { label: "Cold snap", offset: -9 },
};

export type SimParams = {
  /** Electricity for the rack, CHF/kWh. */
  power: number;
  /** What Kachel's batch jobs (rendering, AI training, science) pay, CHF per kWh they use. */
  batch: number;
  /** What the heat would cost otherwise, CHF/kWh. */
  heat: number;
  /** Rack size, kW. */
  rackKw: number;
  /** How much batch work from far away (outside Basel) is waiting for the rack, kW. */
  remote: number;
  /** Which neighbours have signed up (by index into NEIGHBOURS). */
  signed: boolean[];
};
export const DEFAULT_SIM: SimParams = {
  power: 0.27,
  batch: 0.34,
  heat: 0.14,
  rackKw: 15,
  remote: 8,
  signed: NEIGHBOURS.map(() => true),
};

// The house: heat loss proportional to inside − outside, no heating above the heating limit
const INDOOR = 20;
const HEATING_LIMIT = 16;
const DESIGN_TEMP = -8;
const PEAK_KW = 12;
const LOSS_KW_PER_K = PEAK_KW / (INDOOR - DESIGN_TEMP);
const HOT_WATER_KW = 0.35;
/** A customer's load outside the hours they've listed. */
const IDLE = 0.1;
/** Day swing around the mean: coldest at 03:00, warmest at 15:00. */
const SWING = 4;

export function outdoor(mean: number, h: number): number {
  return mean + SWING * Math.sin((2 * Math.PI * (h - 9)) / 24);
}

/** What the house needs at this outdoor temperature, kW: space heating plus hot water. */
export function demandKw(t: number): number {
  return (t < HEATING_LIMIT ? LOSS_KW_PER_K * (INDOOR - t) : 0) + HOT_WATER_KW;
}

/** 24 loads (0–1) per neighbour, from their listed hours; gaps take the hour next to them. */
const PROFILES = NEIGHBOURS.map((n) => {
  const at = new Map(n.load.map((l) => [Number(l.h), l.v]));
  return Array.from(
    { length: 24 },
    (_, h) => at.get(h) ?? at.get((h + 23) % 24) ?? at.get((h + 1) % 24) ?? IDLE,
  );
});

/** Neighbour i's load on the rack at hour h, kW (on their middle plan). */
export function neighbourKw(i: number, h: number): number {
  return (NEIGHBOURS[i]?.plans[1].kw ?? 0) * (PROFILES[i]?.[h] ?? 0);
}

export type Hour = {
  h: number;
  temp: number;
  /** House heat demand, kW. */
  demand: number;
  /** The neighbours' computing, kW. */
  customers: number;
  /** Kachel's batch jobs, run only while the house wants more heat, kW. */
  batch: number;
  /** Heat used by the house, kW; the rest is vented. */
  used: number;
  spare: number;
  /** CHF this hour from computing and heat, minus electricity (plans come monthly). */
  earn: number;
};

/** The colour of the work from far away, on the map and in the cards. */
export const REMOTE_COLOR = "#2f9e6b";
/** Where the far-away work comes in from on the map: Zürich, off-screen to the east. */
export const REMOTE_FROM: [number, number] = [8.5417, 47.3769];

/** Kachel's cut of everything the computing earns (plans, usage, batch jobs). */
export const KACHEL_FEE = 0.42;

/**
 * What the neighbours pay per kWh they compute, on top of their plan: the batch rate, but never
 * so little that the owner's share falls below the electricity. So a neighbour is always worth
 * more than the batch jobs they push out in winter, and never costs money in summer.
 */
export function usageRate(p: SimParams): number {
  return Math.max(p.batch, p.power / (1 - KACHEL_FEE));
}

export function simulateDay(mean: number, p: SimParams): Hour[] {
  return Array.from({ length: 24 }, (_, h) => {
    const temp = outdoor(mean, h);
    const demand = demandKw(temp);
    const wanted = NEIGHBOURS.reduce((s, _, i) => s + (p.signed[i] ? neighbourKw(i, h) : 0), 0);
    const customers = Math.min(p.rackKw, wanted);
    const batch = Math.max(0, Math.min(demand - customers, p.rackKw - customers, p.remote));
    const heat = customers + batch;
    const used = Math.min(heat, demand);
    return {
      h,
      temp,
      demand,
      customers,
      batch,
      used,
      spare: heat - used,
      earn:
        (customers * usageRate(p) + batch * p.batch) * (1 - KACHEL_FEE) +
        used * p.heat -
        heat * p.power,
    };
  });
}

export type Month = {
  /** The neighbours' plans plus their computing. */
  subscriptions: number;
  batch: number;
  /** Kachel's cut of the plans, usage and batch jobs. */
  fee: number;
  heatSaved: number;
  power: number;
  net: number;
  /** Share of the house's heat that came from computing. */
  coverage: number;
};

export function simulateMonth(i: number, weather: Weather, p: SimParams): Month {
  const m = MONTHS[i] ?? MONTHS[0];
  const day = simulateDay(m.temp + WEATHER[weather].offset, p);
  const sum = (f: (h: Hour) => number) => day.reduce((s, h) => s + f(h), 0) * m.days;
  const subscriptions =
    NEIGHBOURS.reduce((s, n, j) => s + (p.signed[j] ? n.plans[1].price : 0), 0) +
    sum((h) => h.customers) * usageRate(p);
  const batch = sum((h) => h.batch) * p.batch;
  const heatSaved = sum((h) => h.used) * p.heat;
  const power = sum((h) => h.customers + h.batch) * p.power;
  const demand = sum((h) => h.demand);
  const fee = (subscriptions + batch) * KACHEL_FEE;
  return {
    subscriptions,
    batch,
    fee,
    heatSaved,
    power,
    net: subscriptions + batch - fee + heatSaved - power,
    coverage: demand > 0 ? sum((h) => h.used) / demand : 0,
  };
}

/** Twelve months: the picked one in the picked weather, the rest in a normal year. */
export function simulateYear(month: number, weather: Weather, p: SimParams): Month[] {
  return MONTHS.map((_, i) => simulateMonth(i, i === month ? weather : "clear", p));
}

/** What the map shows of the simulation right now. */
export type SimView = {
  signed: boolean[];
  weather: Weather;
  temp: number;
  /** Each neighbour's average load on the rack, kW. */
  kw: number[];
  /** Heat the rack gives off on average, kW. */
  rack: number;
  /** Batch work from far away actually running on the rack, on average, kW. */
  remote: number;
};
