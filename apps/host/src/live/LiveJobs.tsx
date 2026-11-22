import {
  EMPTY,
  newest,
  watch,
  type JobState as DbJobState,
  type JobFeed,
  type LiveJob,
  type LiveServer,
} from "@kachel/db";
import { StatePill, type JobState } from "@kachel/ui";
import { useEffect, useState } from "react";

/** The pill has no GONE: a job whose process has ended shows as done. QUEUED is not shown. */
const PILL: Record<Exclude<DbJobState, "QUEUED">, JobState> = {
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  GONE: "DONE",
};

const SERVER_LABELS: Record<LiveServer["state"], string> = {
  RUNNING: "Heating",
  PAUSED: "Holding its job",
  OFF: "Off",
};

/** The host's servers and the job on each, updating as the agent pauses and resumes it. */
export function LiveJobs({ feed }: { feed: JobFeed }) {
  const [{ status, servers, jobs }, setState] = useState(EMPTY);
  useEffect(() => watch(feed, setState), [feed]);

  if (status === "error") {
    return (
      <p role="alert" className="text-sm">
        The servers cannot be reached right now. Is the local database running? Start it with make
        dev.
      </p>
    );
  }

  const ordered = [...servers.values()].sort((a, b) => a.slot - b.slot);
  return (
    <section aria-labelledby="live-jobs">
      <h2 id="live-jobs" className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        Your servers now
        {status === "live" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-normal text-secondary">
            <span aria-hidden className="size-2 rounded-full bg-[#34c759]" />
            Live
          </span>
        )}
      </h2>
      <p className="mt-2 text-[15px] text-secondary">
        What each server in your basement is doing this minute, as the agent pauses and resumes its
        job.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-separator text-xs text-secondary">
            <th scope="col" className="py-2 pr-3 text-left font-normal">
              Server
            </th>
            <th scope="col" className="py-2 pr-3 text-left font-normal">
              Job
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              State
            </th>
          </tr>
        </thead>
        <tbody aria-live="polite" className="divide-y divide-separator">
          {ordered.map((server) => {
            const job = [...jobs.values()]
              .filter((j) => j.server_id === server.id && j.state !== "QUEUED")
              .reduce<LiveJob | undefined>((a, b) => (a ? newest(a, b) : b), undefined);
            return (
              <tr key={server.id}>
                <th
                  scope="row"
                  className="py-3 pr-3 text-left align-top font-semibold whitespace-nowrap"
                >
                  {server.name}
                </th>
                {job && job.state !== "QUEUED" ? (
                  <>
                    <td className="py-3 pr-3 align-top">{job.label}</td>
                    <td className="py-3 text-right align-top">
                      <StatePill state={PILL[job.state]} />
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="py-3 align-top text-secondary">
                    {SERVER_LABELS[server.state]}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
