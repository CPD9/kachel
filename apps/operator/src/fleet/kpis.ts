import { fleetMonth, MONTH_NAMES, type FleetMonth, type MonthsFile, type View } from "./months";
import { stateOf } from "./state";

/** The month before, in the same what-if; January compares with December of the same model year. */
export const previous = (view: View): View => ({ ...view, month: (view.month + 11) % 12 });

export const previousName = (month: number) => MONTH_NAMES[(month + 11) % 12] ?? "";

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/**
 * Where the servers' electricity went: the share the model captures as heat (heat_recovery),
 * what the homes took, and what was vented because the tank was full and the house warm.
 */
export function energy(file: MonthsFile, m: FleetMonth) {
  const p = file.prices;
  const electricityKwh = m.serverHours * p.server_power_kw;
  const capturedKwh = electricityKwh * p.heat_recovery;
  const notCapturedKwh = electricityKwh - capturedKwh;
  const homesKwh = m.servedKwh;
  const ventedKwh = m.dumpedKwh;
  return {
    electricityKwh,
    capturedKwh,
    notCapturedKwh,
    homesKwh,
    ventedKwh,
    /** Of the server heat that left the racks, the share the homes used rather than vented. */
    used: share(homesKwh, homesKwh + ventedKwh),
  };
}

/** The month's money as the scheduler's kpis count it, and the margin's share of what buyers paid. */
export function moneyKpis(m: FleetMonth) {
  const { revenue, electricity, heatValue, margin } = m.money;
  return {
    revenue,
    electricity,
    heatCredit: heatValue,
    margin,
    marginShare: share(margin, revenue),
    electricityShare: share(electricity, revenue),
    heatCreditShare: share(heatValue, revenue),
  };
}

/** The morning check in three figures: homes warm, servers running, heat covered. */
export function todayKpis(m: FleetMonth) {
  const warm = m.houses.filter((h) => stateOf(h) === "warm").length;
  return {
    homes: m.houses.length,
    warm,
    warmShare: share(warm, m.houses.length),
    servers: m.servers,
    running: m.running,
    runningShare: share(m.running, m.servers),
    coveredShare: share(m.servedKwh, m.demandKwh),
    backupShare: share(m.backupKwh, m.demandKwh),
  };
}

/** This month and the one before, for the deltas. */
export function withPrevious(file: MonthsFile, view: View) {
  return { now: fleetMonth(file, view), before: fleetMonth(file, previous(view)) };
}
