import type { KachelClient } from "./client";
import type { Tables } from "./database.types";

type Site = Tables<"sites">;
type Server = Tables<"servers">;
type Job = Tables<"jobs">;

export type LiveSite = Pick<Site, "id" | "name" | "city">;
export type LiveServer = Pick<
  Server,
  "id" | "site_id" | "slot" | "name" | "state" | "power_kw" | "heat_recovery" | "updated_at"
>;
export type LiveJob = Pick<
  Job,
  | "id"
  | "label"
  | "kind"
  | "state"
  | "site_id"
  | "server_id"
  | "server_hours"
  | "deadline_at"
  | "active_cpu_s"
  | "moved_offsite"
  | "created_at"
  | "updated_at"
>;

/** Where both apps get their houses, servers and jobs: Supabase in the app, a fake in tests. */
export interface JobFeed {
  load(): Promise<{ sites: LiveSite[]; servers: LiveServer[]; jobs: LiveJob[] }>;
  /** Calls back on every job or server change; returns a function that stops listening. */
  subscribe(on: { job(job: LiveJob): void; server(server: LiveServer): void }): () => void;
}

const SITE_COLUMNS = "id, name, city";
const SERVER_COLUMNS = "id, site_id, slot, name, state, power_kw, heat_recovery, updated_at";
const JOB_COLUMNS =
  "id, label, kind, state, site_id, server_id, server_hours, deadline_at, active_cpu_s, moved_offsite, created_at, updated_at";

let channels = 0;

/** The feed on Supabase: one read, then Realtime changes on jobs and servers (#6). */
export function supabaseFeed(db: KachelClient): JobFeed {
  return {
    async load() {
      const [sites, servers, jobs] = await Promise.all([
        db.from("sites").select(SITE_COLUMNS).order("name"),
        db.from("servers").select(SERVER_COLUMNS).order("slot"),
        db.from("jobs").select(JOB_COLUMNS).order("created_at", { ascending: false }),
      ]);
      if (sites.error || servers.error || jobs.error) {
        throw new Error("Could not read houses, servers and jobs.");
      }
      return { sites: sites.data, servers: servers.data, jobs: jobs.data };
    },
    subscribe(on) {
      // A fresh name each time, so a quick unmount and remount (React's StrictMode) never
      // reuses a channel that is still being removed.
      const channel = db
        .channel(`kachel-live-${++channels}`)
        .on<Job>("postgres_changes", { event: "*", schema: "public", table: "jobs" }, (change) => {
          if (change.eventType !== "DELETE") on.job(change.new);
        })
        .on<Server>(
          "postgres_changes",
          { event: "*", schema: "public", table: "servers" },
          (change) => {
            if (change.eventType !== "DELETE") on.server(change.new);
          },
        )
        .subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },
  };
}

type Row = { id: string; updated_at: string };

/** The newer of two copies of a row; a tie goes to the one that arrived last. */
export function newest<T extends Row>(a: T, b: T): T {
  return Date.parse(a.updated_at) > Date.parse(b.updated_at) ? a : b;
}

/** Keep whichever copy of a row is newer, so a late read never undoes a live change. */
export function upsert<T extends Row>(rows: Map<string, T>, row: T): Map<string, T> {
  const old = rows.get(row.id);
  if (old && newest(old, row) === old) return rows;
  return new Map(rows).set(row.id, row);
}

export type LiveState = {
  status: "loading" | "live" | "error";
  sites: Map<string, LiveSite>;
  servers: Map<string, LiveServer>;
  jobs: Map<string, LiveJob>;
};

export const EMPTY: LiveState = {
  status: "loading",
  sites: new Map(),
  servers: new Map(),
  jobs: new Map(),
};

/**
 * Listen first, then read, so no change between the two is lost; call `update` with each new
 * state. Returns a function that stops listening and ignores a read still on its way.
 */
export function watch(feed: JobFeed, update: (next: (state: LiveState) => LiveState) => void) {
  let current = true;
  const stop = feed.subscribe({
    job: (job) => update((s) => ({ ...s, jobs: upsert(s.jobs, job) })),
    server: (server) => update((s) => ({ ...s, servers: upsert(s.servers, server) })),
  });
  feed.load().then(
    (first) => {
      if (!current) return;
      update((s) => ({
        status: "live",
        sites: new Map(first.sites.map((site) => [site.id, site])),
        servers: first.servers.reduce(upsert, s.servers),
        jobs: first.jobs.reduce(upsert, s.jobs),
      }));
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

/**
 * Heat a job has given the house so far, in kWh: its run time on the server times the server's
 * power and heat recovery (services/scheduler/config.json: server). Unknown until it has a server.
 */
export function heatKwh(job: LiveJob, server: LiveServer | undefined): number | undefined {
  if (!server) return undefined;
  return (job.active_cpu_s / 3600) * server.power_kw * server.heat_recovery;
}
