import type { HouseAssumption, HouseFeed, HouseHour, HouseRows } from "@kachel/db";

export const SITE = "00000000-0000-4000-8000-000000000100";

/** A January hour as the seed has it (supabase/seed.sql, out/day_january.csv). */
export function janHour(hour: number, over: Partial<HouseHour> = {}): HouseHour {
  return {
    site_id: SITE,
    time: `2025-01-13T${String(hour).padStart(2, "0")}:00:00+01:00`,
    temp_c: -3.8,
    demand_kwh: 9.8,
    server_hours: 6,
    heat_produced: 4.8,
    heat_used: 4.8,
    backup_kwh: 5.0,
    dumped_kwh: 0,
    soc_kwh: 0,
    reason: "heat needed",
    ...over,
  };
}

export function julHour(hour: number, over: Partial<HouseHour> = {}): HouseHour {
  return {
    ...janHour(hour),
    time: `2025-07-15T${String(hour).padStart(2, "0")}:00:00+02:00`,
    temp_c: 22.8,
    demand_kwh: 0.5,
    server_hours: 1,
    heat_produced: 0.8,
    heat_used: 0.8,
    backup_kwh: 0,
    soc_kwh: 34.4,
    reason: "tank full / no heat sink: backlog paused",
    ...over,
  };
}

export const ASSUMPTIONS: HouseAssumption[] = [
  { section: "prices", key: "compute_chf_per_server_hour", value: 0.5, source: "OUR assumption" },
  { section: "prices", key: "electricity_chf_per_kwh", value: 0.277, source: "ElCom 2026 median" },
  { section: "prices", key: "heat_pump_cop", value: 2.5, source: "Case brief" },
  { section: "server", key: "power_kw", value: 1.0, source: "Case brief" },
];

export const YEAR: NonNullable<HouseRows["year"]> = {
  site_id: SITE,
  profile_source: "Open-Meteo archive, Basel 2025",
  servers_per_house: 6,
  heat_demand_kwh: 31231,
  share_of_heat_covered_pct: 79.6,
  backup_heat_kwh: 6380,
  server_hours_sold: 31075,
  electricity_cost_chf: 8608,
  value_of_heat_used_chf: 2753,
  computing_income_chf: 15538,
  computed_at: "2026-11-21T12:00:00+00:00",
};

/** A house feed the test drives by hand, as the scheduler would through Supabase. */
export function fakeHouse(hours: HouseHour[]) {
  const listeners: Parameters<HouseFeed["subscribe"]>[0][] = [];
  const feed: HouseFeed = {
    load: () =>
      Promise.resolve({
        site: { id: SITE, name: "Reference house", city: "Basel", tank_kwh: 35 },
        hours,
        year: YEAR,
        assumptions: ASSUMPTIONS,
      }),
    subscribe(on) {
      listeners.push(on);
      return () => listeners.splice(listeners.indexOf(on), 1);
    },
  };
  return { feed, listeners, push: (hour: HouseHour) => listeners.forEach((on) => on.hour(hour)) };
}
