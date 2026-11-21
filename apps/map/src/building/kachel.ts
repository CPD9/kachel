import summary from "../../../../docs/economics/data/summary.json";

/**
 * What Kachel servers could do in a building, scaled from the scheduler's Basel reference house
 * (services/scheduler/economics.py → docs/economics/data/summary.json): six 1 kW servers for
 * 31,231 kWh of heat a year, on Basel's 2025 weather.
 *
 * The scaling is deliberately plain: whole servers in proportion to the building's heat demand,
 * and every result in proportion to the servers. It keeps the reference house's assumptions,
 * above all an unlimited backlog of interruptible work, and its demand shape over the year.
 */
const REF = summary.base_case;
const PER_HOUSE = REF.servers_per_house;

export interface KachelEstimate {
  readonly servers: number;
  /** Server heat the building would use, kWh a year. */
  readonly heatFromServersKwh: number;
  readonly sharePct: number;
  /** Electricity the servers would draw, kWh a year (1 kW per server-hour). */
  readonly electricityKwh: number;
  /** Yearly result before hardware, CHF: computing income − electricity + heat credit. */
  readonly beforeHardwareChf: number;
  /** Yearly result after hardware, CHF, for the low, mid and high hardware cases. */
  readonly afterHardwareChf: { low: number; mid: number; high: number };
  readonly paybackYearsMid: number;
}

/** Null when the building needs too little heat for even one server. */
export function kachelEstimate(heatKwh: number): KachelEstimate | null {
  const servers = Math.round((PER_HOUSE * heatKwh) / REF.heat_demand_kwh);
  if (servers < 1) return null;
  const scale = servers / PER_HOUSE;
  const hw = summary.hardware;
  return {
    servers,
    heatFromServersKwh: (heatKwh * REF.share_of_heat_covered_pct) / 100,
    sharePct: REF.share_of_heat_covered_pct,
    electricityKwh: REF.server_hours_sold * scale,
    beforeHardwareChf: summary.net_chf_per_house_before_hardware * scale,
    afterHardwareChf: {
      low: hw.low.net_chf_after_hardware * scale,
      mid: hw.mid.net_chf_after_hardware * scale,
      high: hw.high.net_chf_after_hardware * scale,
    },
    paybackYearsMid: hw.mid.payback_years,
  };
}

/** "12,300 CHF" or "−4,770 CHF", to three significant figures. */
export function formatChf(chf: number): string {
  const rounded = Number(Math.abs(chf).toPrecision(3)).toLocaleString("en-GB");
  return `${chf < 0 ? "−" : ""}${rounded} CHF`;
}

/** The model's assumptions, for the card's link. */
export const ASSUMPTIONS_URL = "https://github.com/CPD9/kachel/blob/main/docs/economics/README.md";
