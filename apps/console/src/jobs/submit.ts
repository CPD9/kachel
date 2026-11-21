import type { JobFeed, JobKind, KachelClient, LiveJob, TablesInsert } from "@kachel/db";

export type NewJob = {
  label: string;
  kind: JobKind;
  /** Server-hours the job needs. */
  size: number;
  /** When a batch job must be done, as an ISO time; other kinds have none. */
  deadline: string | null;
};

const JOB_COLUMNS =
  "id, label, kind, state, site_id, server_id, server_hours, deadline_at, active_cpu_s, created_at, updated_at";

/** Writes a job as QUEUED and returns the row as the database stored it. */
export type SubmitJob = (job: NewJob) => Promise<LiveJob>;

/** Submits as the signed-in buyer; row level security (#73) refuses anyone else. */
export function supabaseSubmit(db: KachelClient): SubmitJob {
  return async (job) => {
    const { data: session } = await db.auth.getSession();
    const buyer = session.session?.user.id;
    if (!buyer) throw new Error("Nobody is signed in.");
    const row: TablesInsert<"jobs"> = {
      buyer_id: buyer,
      label: job.label,
      kind: job.kind,
      // Only interactive sessions cannot wait (services/scheduler/config.json: jobs).
      interruptible: job.kind !== "interactive",
      server_hours: job.size,
      deadline_at: job.deadline,
      state: "QUEUED",
    };
    const { data, error } = await db.from("jobs").insert(row).select(JOB_COLUMNS).single();
    if (error) throw new Error("The job could not be saved.");
    return data;
  };
}

/**
 * The feed with one more source of changes: the jobs this console has just submitted, so a new
 * job shows at once even before Realtime brings it. Newer copies still win, as everywhere.
 */
export function withSubmitted(feed: JobFeed) {
  const listeners = new Set<Parameters<JobFeed["subscribe"]>[0]>();
  return {
    feed: {
      load: () => feed.load(),
      subscribe(on) {
        listeners.add(on);
        const stop = feed.subscribe(on);
        return () => {
          listeners.delete(on);
          stop();
        };
      },
    } satisfies JobFeed,
    announce(job: LiveJob) {
      listeners.forEach((on) => on.job(job));
    },
  };
}
