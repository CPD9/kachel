// The scheduler's yearly balance for the reference buildings, for the apps (the map's building
// card, #67). The numbers come from services/scheduler/economics.py, which writes buildings.json;
// rebuild them there, never by hand. Sources: docs/economics/README.md.
import data from "./buildings.json" with { type: "json" };
import solarData from "./solar.json" with { type: "json" };

export type TariffId = keyof typeof data.tariffs;

export interface Tariff {
  name: string;
  chfPerKwh: number;
  source: string;
}

/** The yearly result for one building at one electricity price. CHF per building and year. */
export interface Result {
  electricityCostChf: number;
  heatCreditChf: number;
  computingIncomeChf: number;
  netBeforeHardwareChf: number;
  hardwareChfPerYear: number;
  netAfterHardwareChf: number;
  breakEvenChfPerServerHour: number | null;
  breakEvenInclHardwareChfPerServerHour: number;
}

export interface Building {
  id: string;
  name: string;
  kind: string;
  place: string;
  /** Energy reference area; null for the reference house, which the case brief gives no area. */
  areaM2: number | null;
  heatDemandKwh: number;
  tankKwh: number;
  servers: number;
  shareOfHeatCoveredPct: number;
  utilisationPct: number;
  serverHoursSold: number;
  defaultTariff: TariffId;
  source: string;
  results: Record<TariffId, Result>;
}

type RawResult = (typeof data.buildings)[number]["results"][TariffId];

const result = (r: RawResult): Result => ({
  electricityCostChf: r.electricity_cost_chf,
  heatCreditChf: r.value_of_heat_used_chf,
  computingIncomeChf: r.computing_income_chf,
  netBeforeHardwareChf: r.net_chf_before_hardware,
  hardwareChfPerYear: r.hardware_chf_per_year,
  netAfterHardwareChf: r.net_chf_after_hardware,
  breakEvenChfPerServerHour: r.break_even_chf_per_server_hour,
  breakEvenInclHardwareChfPerServerHour: r.break_even_chf_per_server_hour_incl_hardware,
});

const tariffIds = Object.keys(data.tariffs) as TariffId[];

export const TARIFFS: Record<TariffId, Tariff> = Object.fromEntries(
  tariffIds.map((id) => {
    const t = data.tariffs[id];
    return [id, { name: t.name, chfPerKwh: t.chf_per_kwh, source: t.source }];
  }),
) as Record<TariffId, Tariff>;

export const BUILDINGS: readonly Building[] = data.buildings.map((b) => ({
  id: b.id,
  name: b.name,
  kind: b.kind,
  place: b.place,
  areaM2: b.area_m2,
  heatDemandKwh: b.heat_demand_kwh,
  tankKwh: b.tank_kwh,
  servers: b.servers,
  shareOfHeatCoveredPct: b.share_of_heat_covered_pct,
  utilisationPct: b.utilisation_pct,
  serverHoursSold: b.server_hours_sold,
  defaultTariff: b.default_tariff as TariffId,
  source: b.source,
  results: Object.fromEntries(tariffIds.map((id) => [id, result(b.results[id])])) as Record<
    TariffId,
    Result
  >,
}));

/** What every figure assumes: the weather year, the compute price and the hardware case. */
export const BASIS = {
  weather: data.weather,
  computeChfPerServerHour: data.compute_chf_per_server_hour,
  hardwareCase: data.hardware_case,
} as const;

export function building(id: string): Building | undefined {
  return BUILDINGS.find((b) => b.id === id);
}

const reference = (): Building => {
  const ref = BUILDINGS.find((b) => b.id === "basel_house");
  if (!ref) throw new Error("buildings.json has no reference house");
  return ref;
};

/**
 * The Basel tariff a building pays by what it is used for: homes pay IWB's household price
 * (H4), everything else IWB's business price (C3). Both 2027, from ElCom.
 */
export function tariffFor(
  use: "house" | "flats" | "office" | "school" | "campus" | string,
): TariffId {
  return use === "house" || use === "flats" ? "iwb_h4_2027" : "iwb_c3_2027";
}

/** A rough estimate for any building from its yearly heat demand, scaled from the reference house. */
export interface Estimate {
  servers: number;
  shareOfHeatCoveredPct: number;
  netBeforeHardwareChf: number;
  netAfterHardwareChf: number;
  tariff: TariffId;
  scaledFrom: string;
}

/**
 * Servers and money for a building that has only a heat demand (kWh a year): the reference
 * house's servers per kWh of demand and its result per server, at the chosen tariff. The
 * simulated buildings above land within about 10% of this line.
 */
export function estimate(heatDemandKwh: number, tariff: TariffId = tariffFor("house")): Estimate {
  const ref = reference();
  const servers = Math.max(1, Math.round((heatDemandKwh * ref.servers) / ref.heatDemandKwh));
  const r = ref.results[tariff];
  return {
    servers,
    shareOfHeatCoveredPct: ref.shareOfHeatCoveredPct,
    netBeforeHardwareChf: Math.round((r.netBeforeHardwareChf * servers) / ref.servers),
    netAfterHardwareChf: Math.round((r.netAfterHardwareChf * servers) / ref.servers),
    tariff,
    scaledFrom: ref.name,
  };
}

export type SolarSetupId = "none" | "pv_plain" | "pv" | "pv_battery";

/** One roof setup on the reference house over a year, at one electricity price. */
export interface SolarSetup {
  setup: string;
  pvKwh: number;
  ownPvShareOfServerPowerPct: number;
  electricityCostChf: number;
  /** Electricity saved against no solar, CHF a year; null for no solar. */
  savingChfPerYear: number | null;
  /** What the roof (and battery) cost, and its yearly cost with upkeep; null for no solar. */
  solarCapexChf: number | null;
  solarChfPerYear: number | null;
  paybackYearsMid: number | null;
  netAfterHardwareAndSolarChf: number;
}

interface RawSetup {
  setup: string;
  electricity_chf_per_kwh: number;
  pv_kwh: number;
  own_pv_share_of_server_power_pct: number;
  electricity_cost_chf: number;
  saving_chf_per_year?: number;
  solar_capex_chf?: number;
  solar_chf_per_year?: number;
  payback_years_mid?: number;
  net_chf_after_hardware_and_solar: number;
}

const solarSetup = (s: RawSetup): SolarSetup => ({
  setup: s.setup,
  pvKwh: s.pv_kwh,
  ownPvShareOfServerPowerPct: s.own_pv_share_of_server_power_pct,
  electricityCostChf: s.electricity_cost_chf,
  savingChfPerYear: s.saving_chf_per_year ?? null,
  solarCapexChf: s.solar_capex_chf ?? null,
  solarChfPerYear: s.solar_chf_per_year ?? null,
  paybackYearsMid: s.payback_years_mid ?? null,
  netAfterHardwareAndSolarChf: s.net_chf_after_hardware_and_solar,
});

const solarPrices = solarData.by_price as Record<string, Record<SolarSetupId, RawSetup>>;

/**
 * Roof PV and a battery on the reference house (#27) at each electricity price the economics
 * page runs: what own power saves the servers and how long the roof takes to pay back.
 * Generated by services/scheduler/economics.py; charts 8 to 10 on docs/economics.
 */
export const SOLAR = {
  house: solarData.house,
  roofKwp: solarData.roof_kwp,
  batteryKwh: solarData.battery_kwh,
  feedInChfPerKwh: solarData.feed_in_chf_per_kwh,
  costCase: solarData.case,
  source: solarData.source,
  byPrice: Object.values(solarPrices).map((setups) => ({
    chfPerKwh: setups.none.electricity_chf_per_kwh,
    setups: Object.fromEntries(
      Object.entries(setups).map(([id, s]) => [id, solarSetup(s)]),
    ) as Record<SolarSetupId, SolarSetup>,
  })),
};
