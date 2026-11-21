import {
  EMPTY,
  heatKwh,
  watch,
  type JobFeed,
  type JobKind,
  type JobState as DbJobState,
} from "@kachel/db";
import { StatePill, type JobState } from "@kachel/ui";
import { useEffect, useState } from "react";

/** The pill has no GONE: a job whose process has ended shows as done. */
const PILL: Record<DbJobState, JobState> = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  GONE: "DONE",
};

export const KINDS: Record<JobKind, string> = {
  interactive: "Interactive",
  batch: "Batch",
  opportunistic: "Backlog",
};

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const kwh = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Every job with its state, the home it ran in and the heat it gave, updating live. */
export function JobTable({ feed }: { feed: JobFeed }) {
  const [{ status, sites, servers, jobs }, setState] = useState(EMPTY);
  useEffect(() => watch(feed, setState), [feed]);

  if (status === "error") {
    return (
      <p role="alert" className="px-6 py-4 text-sm">
        The jobs cannot be reached right now. Is the local database running? Start it with make dev.
      </p>
    );
  }

  const rows = [...jobs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <section aria-labelledby="jobs" className="px-6 py-4">
      <h2 id="jobs" className="text-lg font-semibold">
        Your jobs {status === "live" && <span className="text-sm text-heat">· live</span>}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-idle">
            <tr className="border-b border-idle/40">
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Kind</th>
              <th className="py-2 pr-4 font-medium">State</th>
              <th className="py-2 pr-4 font-medium">Home</th>
              <th className="py-2 pr-4 text-right font-medium">Heat delivered</th>
              <th className="py-2 font-medium">Deadline</th>
            </tr>
          </thead>
          <tbody aria-live="polite" className="divide-y divide-idle/30">
            {rows.map((job) => {
              const site = job.site_id ? sites.get(job.site_id) : undefined;
              const server = job.server_id ? servers.get(job.server_id) : undefined;
              const heat = heatKwh(job, server);
              return (
                <tr key={job.id}>
                  <td className="py-2 pr-4 font-medium">{job.label}</td>
                  <td className="py-2 pr-4">{KINDS[job.kind]}</td>
                  <td className="py-2 pr-4">
                    <StatePill state={PILL[job.state]} />
                  </td>
                  <td className="py-2 pr-4">
                    {site ? (
                      `${site.name}, ${site.city}${server ? ` · ${server.name}` : ""}`
                    ) : (
                      <span className="text-idle">Not placed yet</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {heat === undefined ? (
                      <span className="text-idle">–</span>
                    ) : (
                      `${kwh.format(heat)} kWh`
                    )}
                  </td>
                  <td className="py-2">
                    {job.deadline_at ? (
                      when.format(new Date(job.deadline_at))
                    ) : (
                      <span className="text-idle">None</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-idle">
        Heat delivered is the job&apos;s run time on its server, times the server&apos;s power and
        the share of that power recovered as heat.
      </p>
    </section>
  );
}
