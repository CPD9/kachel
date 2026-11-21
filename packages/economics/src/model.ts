// What Kachel servers could do in any building, scaled from the scheduler's Basel reference house
// (services/scheduler/economics.py → docs/economics/data/summary.json), at any electricity price.
// The money follows economics.py: income − electricity + heat credit, and the hardware's annuity,
// upkeep and discounted payback from config.json's hardware cases. Tests hold it to summary.json.
import config from "../../../services/scheduler/config.json" with { type: "json" };
import summary from "../../../docs/economics/data/summary.json" with { type: "json" };

const REF = summary.base_case;
const PER_HOUSE = REF.servers_per_house;
const P0 = config.prices.electricity_chf_per_kwh;
const COP = config.prices.heat_pump_cop;

export type HardwareCase = keyof typeof config.hardware.cases;
export const HARDWARE_CASES = Object.keys(config.hardware.cases) as HardwareCase[];

export interface Hardware {
  capexChf: number;
  upkeepChfPerYear: number;
  rate: number;
  lifeYears: number;
  /** Annuity on the capex plus upkeep, CHF a year. */
  perYearChf: number;
}

/**
 * The reference house's hardware for one case (economics.py hardware()): servers and their water
 * loops, fitting, upkeep, and the annuity at the case's discount rate over its lifetime.
 */
export function hardware(c: HardwareCase, servers: number = PER_HOUSE): Hardware {
  const hw = config.hardware;
  const h = hw.cases[c];
  const house =
    PER_HOUSE * (h.server_chf + h.cooling_kit_chf) +
    h.fitter_hours_per_house * h.fitter_chf_per_hour +
    h.electrician_hours_per_house * h.electrician_chf_per_hour;
  const upkeep =
    h.service_visits_per_year *
    (h.service_hours_per_visit * hw.service_chf_per_hour + hw.service_callout_chf);
  const r = h.discount_rate;
  const annuity = r / (1 - (1 + r) ** -h.lifetime_years);
  // A building of other size takes the house's costs per server, fitting and upkeep included.
  const scale = servers / PER_HOUSE;
  return {
    capexChf: house * scale,
    upkeepChfPerYear: upkeep * scale,
    rate: r,
    lifeYears: h.lifetime_years,
    perYearChf: (house * annuity + upkeep) * scale,
  };
}

/** Discounted payback (economics.py payback_years): years until the cash has repaid the capex. */
export function paybackYears(capexChf: number, cashChfPerYear: number, rate: number): number {
  if (cashChfPerYear <= 0 || rate * capexChf >= cashChfPerYear) return Infinity;
  return -Math.log(1 - (rate * capexChf) / cashChfPerYear) / Math.log(1 + rate);
}

export interface Kachel {
  servers: number;
  /** Server heat the building would use, kWh a year. */
  heatFromServersKwh: number;
  sharePct: number;
  /** Electricity the servers draw, kWh a year (1 kW per server-hour). */
  electricityKwh: number;
  chfPerKwh: number;
  electricityCostChf: number;
  /** What the heat the servers replace would have cost a heat pump, CHF a year. */
  heatCreditChf: number;
  computingIncomeChf: number;
  /** Income − electricity + heat credit, CHF a year. */
  beforeHardwareChf: number;
  afterHardwareChf: Record<HardwareCase, number>;
  paybackYears: Record<HardwareCase, number>;
}

/**
 * Servers and money for a building that needs `heatKwh` a year, at `chfPerKwh` for electricity.
 * Whole servers in proportion to the heat; every flow in proportion to the servers; the heat
 * used never more than the building needs. Null when it needs too little heat for one server.
 */
export function kachelAt(heatKwh: number, chfPerKwh: number = P0): Kachel | null {
  const servers = Math.round((PER_HOUSE * heatKwh) / REF.heat_demand_kwh);
  if (servers < 1) return null;
  const scale = servers / PER_HOUSE;
  const refHeatUsed = (REF.heat_demand_kwh * REF.share_of_heat_covered_pct) / 100;
  const heatFromServersKwh = Math.min(heatKwh, refHeatUsed * scale);
  const electricityKwh = REF.server_hours_sold * scale;
  const electricityCostChf = electricityKwh * chfPerKwh;
  const heatCreditChf = (heatFromServersKwh * chfPerKwh) / COP;
  const computingIncomeChf = REF.computing_income_chf * scale;
  const beforeHardwareChf = computingIncomeChf - electricityCostChf + heatCreditChf;
  const after = {} as Record<HardwareCase, number>;
  const payback = {} as Record<HardwareCase, number>;
  for (const c of HARDWARE_CASES) {
    const h = hardware(c, servers);
    after[c] = beforeHardwareChf - h.perYearChf;
    payback[c] = paybackYears(h.capexChf, beforeHardwareChf - h.upkeepChfPerYear, h.rate);
  }
  return {
    servers,
    heatFromServersKwh,
    sharePct: (100 * heatFromServersKwh) / heatKwh,
    electricityKwh,
    chfPerKwh,
    electricityCostChf,
    heatCreditChf,
    computingIncomeChf,
    beforeHardwareChf,
    afterHardwareChf: after,
    paybackYears: payback,
  };
}

/** The price the reference results are at: config.json's electricity price. */
export const REFERENCE_CHF_PER_KWH = P0;
