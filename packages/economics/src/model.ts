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
/** Job types a buyer can send beyond the reference house's (config.json: workloads, #159). */
export const JOB_TYPES = config.workloads;

export const HARDWARE_CASES = Object.keys(config.hardware.cases) as HardwareCase[];

/** A server size the card offers (#159): its power, and whether it is the GPU workstation. */
export interface ServerSize {
  id: string;
  kw: number;
  gpu: boolean;
  label: string;
}

const fmtKw = (kw: number) => `${kw} kW`;

/** 0.5, 1 and 2 kW servers, and the GPU workstation (config.json: server). 1 kW is the reference. */
export const SERVER_SIZES: readonly ServerSize[] = [
  ...config.server.sizes_kw.map((kw) => ({
    id: `${kw}kw`,
    kw,
    gpu: false,
    label: fmtKw(kw),
  })),
  {
    id: "gpu",
    kw: config.server.gpu_workstation_kw,
    gpu: true,
    label: `GPU workstation, ${fmtKw(config.server.gpu_workstation_kw)}`,
  },
];

export const REFERENCE_SIZE: ServerSize = SERVER_SIZES.find((s) => s.kw === 1 && !s.gpu) ?? {
  id: "1kw",
  kw: 1,
  gpu: false,
  label: "1 kW",
};

export interface Hardware {
  capexChf: number;
  upkeepChfPerYear: number;
  rate: number;
  lifeYears: number;
  /** What the servers fetch when sold at the end of their life, CHF (#159). */
  resaleChf: number;
  /** The capex less the resale, discounted to today: what payback and the annuity repay. */
  netCapexChf: number;
  /** Annuity on the net capex plus upkeep, CHF a year. */
  perYearChf: number;
}

/**
 * Hardware for one case (economics.py hardware()): `servers` of `size`, each at its case's price
 * per kW (the GPU workstation at its full price) with its own water loop; fitting and upkeep as
 * the reference house's per kW installed; the servers sold at the end of their life for their
 * case's resale share; the annuity at the case's rate over its lifetime.
 */
export function hardware(
  c: HardwareCase,
  servers: number = PER_HOUSE,
  size: ServerSize = REFERENCE_SIZE,
): Hardware {
  const hw = config.hardware;
  const h = hw.cases[c];
  const unit = size.gpu ? h.server_chf : h.server_chf * size.kw;
  const perKw = (servers * size.kw) / PER_HOUSE;
  const capex =
    servers * (unit + h.cooling_kit_chf) +
    perKw *
      (h.fitter_hours_per_house * h.fitter_chf_per_hour +
        h.electrician_hours_per_house * h.electrician_chf_per_hour);
  const upkeep =
    perKw *
    h.service_visits_per_year *
    (h.service_hours_per_visit * hw.service_chf_per_hour + hw.service_callout_chf);
  const r = h.discount_rate;
  const annuity = r / (1 - (1 + r) ** -h.lifetime_years);
  const resale = servers * unit * h.resale_share;
  const netCapex = capex - resale * (1 + r) ** -h.lifetime_years;
  return {
    capexChf: capex,
    upkeepChfPerYear: upkeep,
    rate: r,
    lifeYears: h.lifetime_years,
    resaleChf: resale,
    netCapexChf: netCapex,
    perYearChf: netCapex * annuity + upkeep,
  };
}

/** Discounted payback (economics.py payback_years): years until the cash has repaid the capex. */
export function paybackYears(capexChf: number, cashChfPerYear: number, rate: number): number {
  if (cashChfPerYear <= 0 || rate * capexChf >= cashChfPerYear) return Infinity;
  return -Math.log(1 - (rate * capexChf) / cashChfPerYear) / Math.log(1 + rate);
}

export interface Kachel {
  servers: number;
  size: ServerSize;
  /** Server heat the building would use, kWh a year. */
  heatFromServersKwh: number;
  sharePct: number;
  /** Electricity the servers draw, kWh a year. */
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
 * Servers and money for a building that needs `heatKwh` a year, at `chfPerKwh` for electricity,
 * with servers of `size`. The kW follow the heat as in the reference house (6 kW for 31,231 kWh);
 * whole servers of that size; every flow in proportion to the kW installed (a kW earns, draws and
 * heats the same in any size); the heat used never more than the building needs. Null when it
 * needs too little heat for one server.
 */
export function kachelAt(
  heatKwh: number,
  chfPerKwh: number = P0,
  size: ServerSize = REFERENCE_SIZE,
): Kachel | null {
  const kwNeeded = (PER_HOUSE * heatKwh) / REF.heat_demand_kwh;
  const servers = Math.round(kwNeeded / size.kw);
  if (servers < 1) return null;
  const scale = (servers * size.kw) / PER_HOUSE;
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
    const h = hardware(c, servers, size);
    after[c] = beforeHardwareChf - h.perYearChf;
    payback[c] = paybackYears(h.netCapexChf, beforeHardwareChf - h.upkeepChfPerYear, h.rate);
  }
  return {
    servers,
    size,
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
