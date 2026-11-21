import type { Job, KachelClient, Server } from "@kachel/db";

export type LiveServer = Pick<Server, "id" | "slot" | "name" | "state" | "updated_at">;
export type LiveJob = Pick<Job, "id" | "label" | "state" | "server_id" | "updated_at">;

/** Where the live screen gets its servers and jobs: Supabase in the app, a fake in tests. */
export interface JobFeed {
  load(): Promise<{ servers: LiveServer[]; jobs: LiveJob[] }>;
  /** Calls back on every job or server change; returns a function that stops listening. */
  subscribe(on: { job(job: LiveJob): void; server(server: LiveServer): void }): () => void;
}

const SERVER_COLUMNS = "id, slot, name, state, updated_at";
const JOB_COLUMNS = "id, label, state, server_id, updated_at";

/** The feed on Supabase: one read, then Realtime changes on jobs and servers (#6). */
export function supabaseFeed(db: KachelClient): JobFeed {
  return {
    async load() {
      const [servers, jobs] = await Promise.all([
        db.from("servers").select(SERVER_COLUMNS).order("slot"),
        db.from("jobs").select(JOB_COLUMNS).not("server_id", "is", null),
      ]);
      if (servers.error || jobs.error) throw new Error("Could not read servers and jobs.");
      return { servers: servers.data, jobs: jobs.data };
    },
    subscribe(on) {
      const channel = db
        .channel("host-live-jobs")
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
