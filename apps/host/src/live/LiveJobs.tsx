import type { JobState as DbJobState } from "@kachel/db";
import { StatePill, type JobState } from "@kachel/ui";
import { useEffect, useState } from "react";
import type { JobFeed, LiveJob, LiveServer } from "./feed";

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

type Row = { updated_at: string; id: string };

/** Keep whichever copy of a row is newer, so a late read never undoes a live change. */
function upsert<T extends Row>(rows: Map<string, T>, row: T): Map<string, T> {
  const old = rows.get(row.id);
  if (old && newest(old, row) === old) return rows;
  return new Map(rows).set(row.id, row);
}

function newest<T extends Row>(a: T, b: T): T {
  return Date.parse(a.updated_at) > Date.parse(b.updated_at) ? a : b;
}

function merge<T extends Row>(rows: Map<string, T>, more: T[]): Map<string, T> {
  return more.reduce(upsert, rows);
}

/** The host's servers and the job on each, updating as the agent pauses and resumes it. */
export function LiveJobs({ feed }: { feed: JobFeed }) {
  const [servers, setServers] = useState(new Map<string, LiveServer>());
  const [jobs, setJobs] = useState(new Map<string, LiveJob>());
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    // Listen first, then read, so no change between the two is lost.
    const stop = feed.subscribe({
      job: (job) => setJobs((rows) => upsert(rows, job)),
      server: (server) => setServers((rows) => upsert(rows, server)),
    });
    let current = true;
    feed.load().then(
      (first) => {
        if (!current) return;
        setServers((rows) => merge(rows, first.servers));
        setJobs((rows) => merge(rows, first.jobs));
        setStatus("live");
      },
      () => {
        if (current) setStatus("error");
      },
    );
    return () => {
      current = false;
      stop();
    };
  }, [feed]);

  if (status === "error") {
    return (
      <p role="alert" className="px-6 py-4 text-sm">
        The servers cannot be reached right now. Is the local database running? Start it with make
        dev.
      </p>
    );
  }

  const ordered = [...servers.values()].sort((a, b) => a.slot - b.slot);
  return (
    <section aria-labelledby="live-jobs" className="px-6 py-4">
      <h2 id="live-jobs" className="text-lg font-semibold">
        Your servers {status === "live" && <span className="text-sm text-heat">· live</span>}
      </h2>
      <ul aria-live="polite" className="mt-3 divide-y divide-idle/30">
        {ordered.map((server) => {
          const job = [...jobs.values()]
            .filter((j) => j.server_id === server.id && j.state !== "QUEUED")
            .reduce<LiveJob | undefined>((a, b) => (a ? newest(a, b) : b), undefined);
          return (
            <li key={server.id} className="flex items-center gap-3 py-2">
              <span className="w-20 font-medium">{server.name}</span>
              {job && job.state !== "QUEUED" ? (
                <>
                  <span className="flex-1 text-sm">{job.label}</span>
                  <StatePill state={PILL[job.state]} />
                </>
              ) : (
                <span className="flex-1 text-sm text-idle">{SERVER_LABELS[server.state]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
