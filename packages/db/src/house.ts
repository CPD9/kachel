import type { KachelClient } from "./client";
import type { Json, Tables } from "./database.types";

type HeatState = Tables<"heat_state">;

export type HouseSite = Pick<Tables<"sites">, "id" | "name" | "city" | "tank_kwh">;
export type HouseHour = Pick<
  HeatState,
  | "site_id"
  | "time"
  | "temp_c"
  | "demand_kwh"
  | "server_hours"
  | "heat_produced"
  | "heat_used"
  | "backup_kwh"
  | "dumped_kwh"
  | "soc_kwh"
  | "reason"
>;
export type HouseYear = Pick<
  Tables<"kpis">,
  | "site_id"
  | "profile_source"
  | "servers_per_house"
  | "heat_demand_kwh"
  | "share_of_heat_covered_pct"
  | "backup_heat_kwh"
  | "server_hours_sold"
  | "electricity_cost_chf"
  | "value_of_heat_used_chf"
  | "computing_income_chf"
  | "computed_at"
>;
export type HouseAssumption = { section: string; key: string; value: Json; source: string };

export type HouseRows = {
  site: HouseSite | null;
  hours: HouseHour[];
  year: HouseYear | null;
  assumptions: HouseAssumption[];
};

/** Where the host screen gets its house, its hours and its money: Supabase, or a fake in tests. */
export interface HouseFeed {
  load(): Promise<HouseRows>;
  /** Calls back on every new or changed hour of heat_state; returns a function that stops. */
  subscribe(on: { hour(hour: HouseHour): void }): () => void;
}

const SITE_COLUMNS = "id, name, city, tank_kwh";
const HOUR_COLUMNS =
  "site_id, time, temp_c, demand_kwh, server_hours, heat_produced, heat_used, backup_kwh, dumped_kwh, soc_kwh, reason";
const YEAR_COLUMNS =
  "site_id, profile_source, servers_per_house, heat_demand_kwh, share_of_heat_covered_pct, backup_heat_kwh, server_hours_sold, electricity_cost_chf, value_of_heat_used_chf, computing_income_chf, computed_at";

let channels = 0;

/**
 * The house on Supabase: the first house the reader may see (row level security, #73, narrows
 * that to the host's own), its hours, its newest yearly balance and the model's assumptions.
 * Then Realtime changes on heat_state (#6).
 */
export function supabaseHouseFeed(db: KachelClient): HouseFeed {
  return {
    async load() {
      const sites = await db.from("sites").select(SITE_COLUMNS).order("name").limit(1);
      if (sites.error) throw new Error("Could not read the house.");
      const site = sites.data[0] ?? null;
      if (site === null) return { site, hours: [], year: null, assumptions: [] };
      const [hours, year, assumptions] = await Promise.all([
        db.from("heat_state").select(HOUR_COLUMNS).eq("site_id", site.id).order("time"),
        db
          .from("kpis")
          .select(YEAR_COLUMNS)
          .eq("site_id", site.id)
          .order("computed_at", { ascending: false })
          .limit(1),
        db.from("assumptions").select("section, key, value, source"),
      ]);
      if (hours.error || year.error || assumptions.error) {
        throw new Error("Could not read the house's heat and money.");
      }
      return { site, hours: hours.data, year: year.data[0] ?? null, assumptions: assumptions.data };
    },
    subscribe(on) {
      const channel = db
        .channel(`kachel-house-${++channels}`)
        .on<HeatState>(
          "postgres_changes",
          { event: "*", schema: "public", table: "heat_state" },
          (change) => {
            if (change.eventType !== "DELETE") on.hour(change.new);
          },
        )
        .subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },
  };
}

export type HouseState = {
  status: "loading" | "live" | "error";
  site: HouseSite | null;
  /** Keyed by the hour's instant (Date.parse of time), for the shown house only. */
  hours: Map<number, HouseHour>;
  year: HouseYear | null;
  assumptions: HouseAssumption[];
};

export const NO_HOUSE: HouseState = {
  status: "loading",
  site: null,
  hours: new Map(),
  year: null,
  assumptions: [],
};

/** Put an hour in its place; a change for another house is ignored. */
export function placeHour(state: HouseState, hour: HouseHour): HouseState {
  if (state.site !== null && hour.site_id !== state.site.id) return state;
  return { ...state, hours: new Map(state.hours).set(Date.parse(hour.time), hour) };
}

/**
 * Listen first, then read, so no hour that changes between the two is lost. Returns a function
 * that stops listening and ignores a read still on its way.
 */
export function watchHouse(
  feed: HouseFeed,
  update: (next: (state: HouseState) => HouseState) => void,
) {
  let current = true;
  const early: HouseHour[] = [];
  let loaded = false;
  const stop = feed.subscribe({
    hour: (hour) => {
      if (!loaded) early.push(hour);
      else update((s) => placeHour(s, hour));
    },
  });
  feed.load().then(
    (first) => {
      if (!current) return;
      loaded = true;
      update(() => {
        const read: HouseState = {
          status: "live",
          site: first.site,
          hours: new Map(),
          year: first.year,
          assumptions: first.assumptions,
        };
        return [...first.hours, ...early].reduce(placeHour, read);
      });
    },
    () => {
      if (current) update((s) => ({ ...s, status: "error" }));
    },
  );
  return () => {
    current = false;
    stop();
  };
}
