export { DEMO_BUYER, DEMO_HOST, isLocalStack, supabaseAuth, type AppAuth } from "./auth";
export { createKachelClient, type KachelClient } from "./client";
export {
  EMPTY,
  heatKwh,
  newest,
  supabaseFeed,
  upsert,
  watch,
  type JobFeed,
  type LiveJob,
  type LiveServer,
  type LiveSite,
  type LiveState,
} from "./live";
export {
  NO_HOUSE,
  placeHour,
  supabaseHouseFeed,
  watchHouse,
  type HouseAssumption,
  type HouseFeed,
  type HouseHour,
  type HouseRows,
  type HouseSite,
  type HouseState,
  type HouseYear,
} from "./house";
export {
  Constants,
  type Database,
  type Enums,
  type Json,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
} from "./database.types";

import type { Enums, Tables } from "./database.types";

export type Site = Tables<"sites">;
export type Server = Tables<"servers">;
export type Job = Tables<"jobs">;
export type JobRun = Tables<"job_runs">;
export type HeatState = Tables<"heat_state">;
export type Kpis = Tables<"kpis">;
export type Measurement = Tables<"measurements">;
export type Assumption = Tables<"assumptions">;
export type JobState = Enums<"job_state">;
export type JobKind = Enums<"job_kind">;
export type ServerState = Enums<"server_state">;
