import { heatKwh, type LiveBuyer, type LiveJob, type LiveServer, type LiveSite } from "@kachel/db";
import { fixed1 } from "../format";
import { Pill } from "../shell/Shell";
import { card, th } from "../ui";

const KIND: Record<LiveJob["kind"], string> = {
  interactive: "Interactive",
  batch: "Batch",
  opportunistic: "Backlog",
};

/** Colour is for state only: running blue, paused orange, queued and done grey. */
const STATE: Record<LiveJob["state"], { label: string; tone: "blue" | "orange" | "grey" }> = {
  RUNNING: { label: "Running", tone: "blue" },
  PAUSED: { label: "Paused", tone: "orange" },
  QUEUED: { label: "Queued", tone: "grey" },
  GONE: { label: "Done", tone: "grey" },
};

const ORDER: LiveJob["state"][] = ["RUNNING", "PAUSED", "QUEUED", "GONE"];

export interface JobTableData {
  jobs: LiveJob[];
  buyers: LiveBuyer[];
  sites: Map<string, LiveSite>;
  servers: Map<string, LiveServer>;
}

/** "in 16 h", "2 h late", or a dash when the job has no deadline. */
export function due(deadline: string | null, now: number) {
  if (deadline === null) return "—";
  const h = Math.round((Date.parse(deadline) - now) / 3_600_000);
  return h >= 0 ? `in ${h} h` : `${-h} h late`;
}

const houseOf = (s: LiveSite | undefined) => s?.name.replace(/^Synthetic house, /, "") ?? "—";

/**
 * Every job: who it is for, what kind, where it runs, its state, the heat it has given the house
 * and its deadline. Running first. A list on a phone, a table from md up.
 */
export function JobsTable({
  data,
  now,
  caption,
}: {
  data: JobTableData;
  now: number;
  caption: string;
}) {
  const buyer = new Map(data.buyers.map((b) => [b.id, b.name]));
  const rows = [...data.jobs]
    .sort(
      (a, b) =>
        ORDER.indexOf(a.state) - ORDER.indexOf(b.state) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    )
    .map((j) => {
      const server = j.server_id ? data.servers.get(j.server_id) : undefined;
      const heat = heatKwh(j, server);
      const site = j.site_id ? data.sites.get(j.site_id) : undefined;
      return {
        j,
        buyer: (j.buyer_id && buyer.get(j.buyer_id)) || "—",
        house: j.moved_offsite ? "Data centre" : houseOf(site),
        city: site?.city ?? "",
        server: server?.name ?? "—",
        heat: heat === undefined ? "—" : `${fixed1(heat)} kWh`,
        deadline: due(j.deadline_at, now),
      };
    });

  return (
    <section aria-labelledby="all-jobs" className={`${card} overflow-hidden`}>
      <div className="px-4 pt-4 sm:px-5">
        <h2 id="all-jobs" className="text-[17px] font-semibold">
          All jobs
        </h2>
        <p data-jobs-caption className="mt-0.5 text-[14px] text-label-2">
          {caption}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-sep/60 border-t border-sep/60 md:hidden">
        {rows.map((r) => (
          <li key={r.j.id} data-job={r.j.id} data-state={r.j.state} className="px-4 py-3">
            <p className="flex items-start justify-between gap-3">
              <span className="font-semibold">{r.j.label}</span>
              <Pill tone={STATE[r.j.state].tone}>{STATE[r.j.state].label}</Pill>
            </p>
            <p className="mt-0.5 text-[13px] text-label-2">
              {r.buyer} · {KIND[r.j.kind]} · {r.house}
              {r.server !== "—" && `, ${r.server}`}
            </p>
            <p className="mt-0.5 text-[13px] tabular-nums">
              Heat {r.heat} · {r.deadline === "—" ? "No deadline" : `Deadline ${r.deadline}`}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="mt-3 w-full text-left text-[15px]">
          <thead>
            <tr className="border-y border-sep">
              <th className={`${th} pl-5`}>Job</th>
              <th className={th}>Buyer</th>
              <th className={th}>Kind</th>
              <th className={th}>House</th>
              <th className={th}>Server</th>
              <th className={th}>State</th>
              <th className={`${th} text-right`}>Heat delivered</th>
              <th className={`${th} pr-5 text-right`}>Deadline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sep/60">
            {rows.map((r) => (
              <tr key={r.j.id} data-job={r.j.id} data-state={r.j.state}>
                <td className="py-2.5 pr-4 pl-5 font-semibold">{r.j.label}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{r.buyer}</td>
                <td className="py-2.5 pr-4 text-label-2">{KIND[r.j.kind]}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {r.house}
                  {r.city && <span className="ml-1.5 text-label-2">{r.city}</span>}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-label-2">{r.server}</td>
                <td className="py-2.5 pr-4">
                  <Pill tone={STATE[r.j.state].tone}>{STATE[r.j.state].label}</Pill>
                </td>
                <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">{r.heat}</td>
                <td className="py-2.5 pr-5 text-right whitespace-nowrap tabular-nums">
                  {r.deadline}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
