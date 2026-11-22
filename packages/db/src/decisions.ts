import type { KachelClient } from "./client";
import type { Tables } from "./database.types";

type Row = Tables<"decisions">;

/** One logged decision of the live loop (services/scheduler/live.py), as the apps show it. */
export type LiveDecision = Pick<
  Row,
  | "hash"
  | "prev_hash"
  | "seq"
  | "site_id"
  | "time"
  | "temp_c"
  | "demand_kwh"
  | "soc_kwh"
  | "tank_kwh"
  | "interactive"
  | "batch"
  | "opportunistic"
  | "reason"
  | "placed"
  | "written_at"
> & { run: string[] };

/** Where the apps get the newest decisions: Supabase, or a fake in tests. */
export interface DecisionFeed {
  load(): Promise<LiveDecision[]>;
  /** Calls back on every decision the loop appends; returns a function that stops. */
  subscribe(on: (decision: LiveDecision) => void): () => void;
}

const COLUMNS =
  "hash, prev_hash, seq, site_id, time, temp_c, demand_kwh, soc_kwh, tank_kwh, interactive, batch, opportunistic, reason, run, placed, written_at";

/** How many decisions the panels keep. */
export const SHOWN = 6;

const asDecision = (row: Omit<LiveDecision, "run"> & { run: unknown }): LiveDecision => ({
  ...row,
  run: Array.isArray(row.run) ? row.run.filter((id): id is string => typeof id === "string") : [],
});

let channels = 0;

/**
 * The newest decisions the reader may see (row level security: a host's own house, or every house
 * for the operator), then each one the loop appends, over Realtime.
 */
export function supabaseDecisions(db: KachelClient, limit = SHOWN): DecisionFeed {
  return {
    async load() {
      const { data, error } = await db
        .from("decisions")
        .select(COLUMNS)
        .order("written_at", { ascending: false })
        .order("seq", { ascending: false })
        .limit(limit);
      if (error) throw new Error("Could not read the scheduler's decisions.");
      return data.map(asDecision);
    },
    subscribe(on) {
      const channel = db
        .channel(`kachel-decisions-${++channels}`)
        .on<Row>(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "decisions" },
          (change) => on(asDecision(change.new)),
        )
        .subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },
  };
}

export type DecisionState = {
  status: "loading" | "live" | "error";
  /** Newest first. */
  decisions: LiveDecision[];
};

export const NO_DECISIONS: DecisionState = { status: "loading", decisions: [] };

/** Add a decision, keep the newest `limit` (by when they were written, then by seq), once each. */
export function keepNewest(list: LiveDecision[], add: LiveDecision, limit = SHOWN): LiveDecision[] {
  return [add, ...list.filter((d) => d.hash !== add.hash)]
    .sort((a, b) => Date.parse(b.written_at) - Date.parse(a.written_at) || b.seq - a.seq)
    .slice(0, limit);
}

/** Listen first, then read, so a decision appended in between is not lost. Returns a stop. */
export function watchDecisions(
  feed: DecisionFeed,
  update: (next: (state: DecisionState) => DecisionState) => void,
  limit = SHOWN,
) {
  let current = true;
  const stop = feed.subscribe((d) =>
    update((s) => ({ ...s, decisions: keepNewest(s.decisions, d, limit) })),
  );
  feed.load().then(
    (first) => {
      if (!current) return;
      update((s) => ({
        status: "live",
        decisions: first.reduce((list, d) => keepNewest(list, d, limit), s.decisions),
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
