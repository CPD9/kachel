import type { FleetMonth, HouseMonth } from "./months";

/**
 * A house needs the operator when its servers covered less than this share of its heat in the
 * month: the backup heater carried the rest. OUR threshold for the console, not the model's.
 */
export const ATTENTION_BELOW = 0.2;

/** Servers busy this share of the month or more count as running flat out. */
const FLAT_OUT = 0.95;

export type BuildingState = "warm" | "attention" | "onboarding";

export const STATE_LABEL: Record<BuildingState, string> = {
  warm: "Warm",
  attention: "Needs attention",
  onboarding: "Onboarding",
};

/** Share of the house's heat the servers and tank delivered this month. */
export const covered = (h: HouseMonth) => (h.demandKwh > 0 ? h.servedKwh / h.demandKwh : 1);

export const stateOf = (h: HouseMonth): BuildingState =>
  covered(h) < ATTENTION_BELOW ? "attention" : "warm";

/** "Synthetic Bern house 07" reads as "House 07"; the zone shows beside it. */
export const houseName = (h: HouseMonth) =>
  h.house.name.replace(/^Synthetic (Bern )?house/, "House");

export interface Attention {
  row: HouseMonth;
  what: string;
  /** The one thing to do about it. */
  action: string;
}

/**
 * The houses that need the operator this month, least covered first. Servers running flat out
 * with the backup still carrying the house: the rack is too small. Servers idle while the backup
 * runs: the house lacks jobs.
 */
export function needsAttention(month: FleetMonth, monthName: string): Attention[] {
  return month.houses
    .filter((h) => stateOf(h) === "attention")
    .sort((a, b) => covered(a) - covered(b))
    .map((row) => {
      const flatOut = row.running / row.house.servers >= FLAT_OUT;
      return {
        row,
        what: `Servers covered ${Math.round(covered(row) * 100)} % of its heat in ${monthName}${
          flatOut ? ", running flat out" : ""
        }. The backup heater made the rest.`,
        action: flatOut ? "Add a server" : "Move jobs here",
      };
    });
}
