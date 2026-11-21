import type { HouseAssumption, HouseHour } from "@kachel/db";

/** The house is in Basel, so its day and hours are Swiss local time, whatever the viewer's zone. */
export const ZONE = "Europe/Zurich";

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** The local date (YYYY-MM-DD), month (1 to 12) and hour (0 to 23) of an instant in Basel. */
export function local(at: Date) {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    date: `${p["year"]}-${p["month"]}-${p["day"]}`,
    month: Number(p["month"]),
    hour: Number(p["hour"]),
  };
}

export type Day = {
  date: string;
  month: number;
  /** One slot per local hour, 0 to 23; empty where heat_state has no row yet. */
  hours: (HouseHour | undefined)[];
};

/** heat_state's rows as whole local days, oldest first. */
export function toDays(rows: Iterable<HouseHour>): Day[] {
  const byDate = new Map<string, Day>();
  for (const row of rows) {
    const { date, month, hour } = local(new Date(row.time));
    let day = byDate.get(date);
    if (!day) {
      day = { date, month, hours: Array.from({ length: 24 }, () => undefined) };
      byDate.set(date, day);
    }
    day.hours[hour] = row;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The day to show. Today when heat_state has it (live); otherwise the one the host picked, or
 * the stored day nearest this time of year, shown as a replay.
 */
export function chooseDay(days: Day[], now: Date, picked?: string) {
  const today = local(now);
  const live = days.find((d) => d.date === today.date);
  const chosen = days.find((d) => d.date === picked);
  if (chosen) return { day: chosen, live: chosen === live };
  if (live) return { day: live, live: true };
  const apart = (m: number) => {
    const gap = Math.abs(m - today.month);
    return Math.min(gap, 12 - gap);
  };
  const nearest = days.reduce<Day | undefined>(
    (best, d) => (best === undefined || apart(d.month) < apart(best.month) ? d : best),
    undefined,
  );
  return nearest ? { day: nearest, live: false } : undefined;
}

/** The hour at the clock's local hour, or the latest one before it that has a row. */
export function hourAt(day: Day, now: Date): { hour: number; row: HouseHour } | undefined {
  for (let h = local(now).hour; h >= 0; h--) {
    const row = day.hours[h];
    if (row) return { hour: h, row };
  }
  return undefined;
}

export type Figure = { value: number; source: string; label: string };

/** The inputs the money needs, each with its source from the assumptions table. */
export type Prices = {
  compute: Figure;
  electricity: Figure;
  cop: Figure;
  power: Figure;
};

const NEEDED = {
  compute: ["prices", "compute_chf_per_server_hour"],
  electricity: ["prices", "electricity_chf_per_kwh"],
  cop: ["prices", "heat_pump_cop"],
  power: ["server", "power_kw"],
} as const;

/** The prices from the assumptions table, or undefined while any of them is missing. */
export function toPrices(rows: HouseAssumption[]): Prices | undefined {
  const out: Partial<Prices> = {};
  for (const [name, [section, key]] of Object.entries(NEEDED) as [
    keyof Prices,
    readonly [string, string],
  ][]) {
    const row = rows.find((r) => r.section === section && r.key === key);
    if (!row || typeof row.value !== "number") return undefined;
    out[name] = { value: row.value, source: row.source, label: `${section}.${key}` };
  }
  return out as Prices;
}

export type DayMoney = {
  serverHours: number;
  heatUsedKwh: number;
  earned: number;
  electricity: number;
  heatSaved: number;
  left: number;
};

/**
 * One day's money, the way the scheduler counts a year (services/scheduler: kpis.json):
 * earned is server-hours times the compute price; electricity is server-hours times the
 * server's power times the price per kWh; heat saved is the heat used times what a heat pump
 * would have spent on it (price per kWh over its COP).
 */
export function dayMoney(day: Day, prices: Prices): DayMoney {
  const rows = day.hours.filter((r): r is HouseHour => r !== undefined);
  const serverHours = rows.reduce((sum, r) => sum + r.server_hours, 0);
  const heatUsedKwh = rows.reduce((sum, r) => sum + r.heat_used, 0);
  const earned = serverHours * prices.compute.value;
  const electricity = serverHours * prices.power.value * prices.electricity.value;
  const heatSaved = (heatUsedKwh * prices.electricity.value) / prices.cop.value;
  return {
    serverHours,
    heatUsedKwh,
    earned,
    electricity,
    heatSaved,
    left: earned - electricity + heatSaved,
  };
}
