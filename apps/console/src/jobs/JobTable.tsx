import {
  EMPTY,
  heatKwh,
  watch,
  type JobFeed,
  type JobKind,
  type JobState as DbJobState,
  type LiveJob,
  type LiveServer,
  type LiveSite,
} from "@kachel/db";
import { StatePill, type JobState } from "@kachel/ui";
import { useEffect, useState, useSyncExternalStore } from "react";

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

/** 22 Nov, 10:04: a 24-hour clock in the houses' own time zone, whatever the browser's. */
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Zurich",
});

const kwh = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Below Tailwind's sm breakpoint (640 px) the jobs read as cards rather than a table. */
const NARROW = "(max-width: 639.98px)";

function subscribeNarrow(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on a phone-width screen; false where the browser cannot tell (as in jsdom). */
function useNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches,
    () => false,
  );
}

type Row = {
  job: LiveJob;
  site: LiveSite | undefined;
  server: LiveServer | undefined;
  heat: number | undefined;
};

function House({ job, site }: Row) {
  if (job.moved_offsite) {
    return (
      <>
        Data centre
        <span className="block text-xs text-secondary">No house could use its heat in time</span>
      </>
    );
  }
  return site ? (
    `${site.name}, ${site.city}`
  ) : (
    <span className="text-secondary">Not placed yet</span>
  );
}

function Heat({ heat }: Row) {
  return heat === undefined ? <span className="text-secondary">–</span> : `${kwh.format(heat)} kWh`;
}

function Deadline({ job }: Row) {
  return job.deadline_at ? (
    when.format(new Date(job.deadline_at))
  ) : (
    <span className="text-secondary">None</span>
  );
}

/** The jobs as a table, one column per fact. */
function JobRows({ rows, empty }: { rows: Row[]; empty: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-secondary">
          <tr className="border-b border-separator">
            <th className="py-2.5 pr-4 pl-5 font-normal sm:pl-6">Job</th>
            <th className="py-2.5 pr-4 font-normal">Kind</th>
            <th className="py-2.5 pr-4 font-normal">State</th>
            <th className="py-2.5 pr-4 font-normal">House</th>
            <th className="py-2.5 pr-4 font-normal">Server</th>
            <th className="py-2.5 pr-4 text-right font-normal">Heat delivered</th>
            <th className="py-2.5 pr-5 font-normal sm:pr-6">Deadline</th>
          </tr>
        </thead>
        <tbody aria-live="polite" className="divide-y divide-separator">
          {empty && (
            <tr>
              <td colSpan={7} className="px-5 py-4 text-secondary sm:px-6">
                No jobs yet. Submit one above.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.job.id}>
              <td className="py-3.5 pr-4 pl-5 font-semibold sm:pl-6">{row.job.label}</td>
              <td className="py-3.5 pr-4">{KINDS[row.job.kind]}</td>
              <td className="py-3.5 pr-4">
                <StatePill state={PILL[row.job.state]} />
              </td>
              <td className="py-3.5 pr-4">
                <House {...row} />
              </td>
              <td className="py-3.5 pr-4">
                {row.server ? row.server.name : <span className="text-secondary">–</span>}
              </td>
              <td className="py-3.5 pr-4 text-right tabular-nums">
                <Heat {...row} />
              </td>
              <td className="py-3.5 pr-5 whitespace-nowrap sm:pr-6">
                <Deadline {...row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same jobs as a list of small cards: name and state first, then labelled lines. */
function JobCards({ rows, empty }: { rows: Row[]; empty: boolean }) {
  return (
    <ul
      aria-labelledby="jobs"
      aria-live="polite"
      className="mt-2 divide-y divide-separator text-sm"
    >
      {empty && <li className="px-5 py-4 text-secondary">No jobs yet. Submit one above.</li>}
      {rows.map((row) => (
        <li key={row.job.id} className="px-5 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-semibold break-words">{row.job.label}</p>
            <span className="shrink-0">
              <StatePill state={PILL[row.job.state]} />
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-secondary">Kind</dt>
            <dd>{KINDS[row.job.kind]}</dd>
            <dt className="text-secondary">House and server</dt>
            <dd className="break-words">
              <House {...row} />
              {row.server && !row.job.moved_offsite && ` · ${row.server.name}`}
            </dd>
            <dt className="text-secondary">Heat delivered</dt>
            <dd className="tabular-nums">
              <Heat {...row} />
            </dd>
            <dt className="text-secondary">Deadline</dt>
            <dd>
              <Deadline {...row} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every job with its state, the home it ran in and the heat it gave, updating live.
 * A table on a wide screen; on a phone, a list of cards so nothing scrolls sideways.
 */
export function JobTable({ feed }: { feed: JobFeed }) {
  const [{ status, sites, servers, jobs }, setState] = useState(EMPTY);
  useEffect(() => watch(feed, setState), [feed]);
  const narrow = useNarrow();

  if (status === "error") {
    return (
      <p role="alert" className="rounded-2xl bg-white px-5 py-4 text-sm">
        The jobs cannot be reached right now. Is the local database running? Start it with make dev.
      </p>
    );
  }

  // Newest first; jobs created together (as in the seed) by label, so the order is the same
  // on every load.
  const rows: Row[] = [...jobs.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.label.localeCompare(b.label))
    .map((job) => {
      const site = job.site_id ? sites.get(job.site_id) : undefined;
      const server = job.server_id ? servers.get(job.server_id) : undefined;
      return { job, site, server, heat: heatKwh(job, server) };
    });
  const empty = status === "live" && rows.length === 0;
  const Jobs = narrow ? JobCards : JobRows;
  return (
    <section aria-labelledby="jobs" className="overflow-hidden rounded-2xl bg-white pt-5">
      <h2
        id="jobs"
        className="flex items-center gap-2 px-5 text-xl font-semibold tracking-tight sm:px-6"
      >
        Your jobs
        {status === "live" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-normal text-secondary">
            <span aria-hidden className="size-2 rounded-full bg-[#34c759]" />
            Live
          </span>
        )}
      </h2>
      <Jobs rows={rows} empty={empty} />
      <details className="border-t border-separator px-5 py-4 text-sm sm:px-6">
        <summary className="cursor-pointer text-action marker:text-action">
          How heat delivered is counted
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          Heat delivered is the job&apos;s run time on its server, times the server&apos;s power and
          the share of that power recovered as heat. A job goes to a data centre only when no house
          can use its heat before its deadline.
        </p>
      </details>
    </section>
  );
}
