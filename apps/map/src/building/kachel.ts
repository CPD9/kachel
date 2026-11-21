import { kachelAt, type Kachel, type ServerSize } from "@kachel/economics/model";

/**
 * What Kachel servers could do in a building, scaled from the scheduler's Basel reference house
 * (services/scheduler/economics.py → docs/economics/data/summary.json): six 1 kW servers for
 * 31,231 kWh of heat a year, on Basel's 2025 weather. The model is `kachelAt` in
 * @kachel/economics, at the building's own electricity price.
 *
 * The scaling is deliberately plain: whole servers in proportion to the building's heat demand,
 * and every result in proportion to the servers. It keeps the reference house's assumptions,
 * above all an unlimited backlog of interruptible work, and its demand shape over the year.
 */
export type KachelEstimate = Kachel;

/** Null when the building needs too little heat for even one server. */
export function kachelEstimate(
  heatKwh: number,
  chfPerKwh?: number,
  size?: ServerSize,
): KachelEstimate | null {
  return kachelAt(heatKwh, chfPerKwh, size);
}

/** "12,300 CHF" or "−4,770 CHF", to three significant figures. */
export function formatChf(chf: number): string {
  const rounded = Number(Math.abs(chf).toPrecision(3)).toLocaleString("en-GB");
  return `${chf < 0 ? "−" : ""}${rounded} CHF`;
}

/** "4.0 years", or "never" when it does not pay back within 50 years. */
export function formatYears(years: number): string {
  return Number.isFinite(years) && years <= 50 ? `${years.toFixed(1)} years` : "never";
}

/** The model's assumptions, for the card's link. */
export const ASSUMPTIONS_URL = "https://github.com/CPD9/kachel/blob/main/docs/economics/README.md";
