import { useState } from "react";
import { count, fixed1, mwh, pct } from "../format";
import type { FleetMonth } from "../fleet/months";
import { covered, houseName, stateOf, STATE_LABEL, type BuildingState } from "../fleet/state";
import { href } from "../shell/route";
import { PageHead, Pill, Sources } from "../shell/Shell";
import { card, field, fieldLabel, primary, th } from "../ui";

/** A building added in this session; it waits for its rack, so it has no figures yet. */
export interface NewBuilding {
  id: string;
  address: string;
  zone: string;
  servers: number;
  heatKwhYear: number | null;
}

const TONE = { warm: "green", attention: "orange", onboarding: "blue" } as const;

interface Row {
  id: string;
  name: string;
  zone: string;
  servers: number;
  heatMwh: string;
  covered: string;
  running: string;
  state: BuildingState;
}

/** Every building: a filter row, then a table (a list of cards on a phone). */
export function Buildings({
  month,
  monthName,
  added,
  query,
}: {
  month: FleetMonth;
  monthName: string;
  added: NewBuilding[];
  query: URLSearchParams;
}) {
  const [q, setQ] = useState(query.get("q") ?? "");
  const [zone, setZone] = useState("all");
  const [state, setState] = useState(query.get("state") ?? "all");

  const rows: Row[] = [
    ...added.map((b): Row => ({
      id: b.id,
      name: b.address,
      zone: b.zone,
      servers: b.servers,
      heatMwh: b.heatKwhYear === null ? "–" : mwh(b.heatKwhYear),
      covered: "not live yet",
      running: "–",
      state: "onboarding",
    })),
    ...month.houses.map((h): Row => ({
      id: h.house.id,
      name: houseName(h),
      zone: h.house.city,
      servers: h.house.servers,
      heatMwh: mwh(h.house.heat_demand_kwh_2025),
      covered: pct(covered(h)),
      running: fixed1(h.running),
      state: stateOf(h),
    })),
  ];
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (zone === "all" || r.zone === zone) &&
      (state === "all" || r.state === state) &&
      (!needle || r.name.toLowerCase().includes(needle) || r.id.includes(needle)),
  );

  return (
    <>
      <PageHead
        title="Buildings"
        action={
          <a href={href("buildings/new")} className={primary}>
            Add building
          </a>
        }
      />
      <section aria-label="Buildings" className={`${card} mt-6 overflow-hidden`}>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_180px_200px] sm:p-5">
          <label className="col-span-2 sm:col-span-1">
            <span className={fieldLabel}>Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or ID"
              className={`${field} mt-1`}
            />
          </label>
          <label>
            <span className={fieldLabel}>Zone</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={`${field} mt-1`}
            >
              <option value="all">Basel and Bern</option>
              <option value="Basel">Basel</option>
              <option value="Bern">Bern</option>
            </select>
          </label>
          <label>
            <span className={fieldLabel}>State</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={`${field} mt-1`}
            >
              <option value="all">Any state</option>
              {(Object.keys(STATE_LABEL) as BuildingState[]).map((s) => (
                <option key={s} value={s}>
                  {STATE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul
          aria-label="Buildings, phone"
          className="divide-y divide-sep/60 border-t border-sep md:hidden"
        >
          {shown.map((r) => (
            <li key={r.id} data-building-card={r.id} className="px-4 py-3">
              <p className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {r.name}
                  <span className="ml-2 font-normal text-label-2">{r.zone}</span>
                </span>
                <Pill tone={TONE[r.state]}>{STATE_LABEL[r.state]}</Pill>
              </p>
              <p className="mt-1 text-[14px] text-label-2 tabular-nums">
                {r.servers} servers · {r.heatMwh} MWh a year · heat covered {r.covered}
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-y border-sep">
                <th className={`${th} pl-5`}>Name</th>
                <th className={th}>ID</th>
                <th className={th}>Zone</th>
                <th className={`${th} text-right`}>Servers</th>
                <th className={`${th} text-right`}>Running, {monthName}</th>
                <th className={`${th} text-right`}>Heat a year, MWh</th>
                <th className={`${th} text-right`}>Heat covered, {monthName}</th>
                <th className={`${th} pr-5`}>State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sep/60">
              {shown.map((r) => (
                <tr key={r.id} data-building={r.id}>
                  <td className="py-2.5 pr-4 pl-5 font-semibold whitespace-nowrap">{r.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-[13px] text-label-2">{r.id}</td>
                  <td className="py-2.5 pr-4">{r.zone}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{count(r.servers)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.running}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.heatMwh}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.covered}</td>
                  <td className="py-2.5 pr-5">
                    <Pill tone={TONE[r.state]}>{STATE_LABEL[r.state]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-showing className="border-t border-sep px-4 py-3 text-[14px] text-label-2 sm:px-5">
          {shown.length === 0
            ? "No building matches. Clear the search or pick another zone or state."
            : `Showing ${shown.length} of ${rows.length} buildings. The ${month.houses.length} homes with an ID like house-01 are synthetic.`}
        </p>
      </section>
      <Sources>
        <p>
          Houses, servers and heat a year: the scheduler&apos;s synthetic fleet
          (heatsched/fleet_scenario.py, fleet_basel_bern_sites.csv), drawn from the ranges in
          config.json: fleet.
        </p>
        <p>
          Running and heat covered: servers running on average and the share of the house&apos;s
          heat the servers and tank delivered in {monthName}, from the scheduler&apos;s run of every
          house on the 2025 weather (make months).
        </p>
      </Sources>
    </>
  );
}
