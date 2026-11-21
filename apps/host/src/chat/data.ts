import type { HouseFeed, JobFeed, KachelClient } from "@kachel/db";
import type { ChatData, JobRun } from "./tools";

/**
 * The chat's reads on Supabase: the app's own house and job feeds, and job_runs for why a job was
 * last paused or resumed. Row level security (#3) keeps every read to the host's own house.
 */
export function supabaseChatData(db: KachelClient, house: HouseFeed, jobs: JobFeed): ChatData {
  return {
    house,
    jobs,
    async runs(jobIds) {
      const res = await db
        .from("job_runs")
        .select("job_id, tick, at, state, reason")
        .in("job_id", jobIds)
        .order("at", { ascending: false })
        .order("tick", { ascending: false });
      if (res.error) throw new Error("Could not read the job runs.");
      const newest = new Map<string, JobRun>();
      for (const run of res.data) if (!newest.has(run.job_id)) newest.set(run.job_id, run);
      return [...newest.values()];
    },
    now: () => new Date(),
  };
}
