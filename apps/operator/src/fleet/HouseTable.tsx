import { Sourced } from "@kachel/ui";
import { useState, type ReactNode } from "react";
import { count, fixed1, mwh } from "../format";
import type { HouseMonth } from "./months";

type Sort = "demand" | "name";

function Head({
  children,
  source,
  right = false,
}: {
  children: ReactNode;
  source: ReactNode;
  right?: boolean;
}) {
  return (
    <th className={`py-2 pr-4 font-medium whitespace-nowrap ${right ? "text-right" : ""}`}>
      <Sourced source={source} align={right ? "right" : "left"}>
        {children}
      </Sourced>
    </th>
  );
}

/**
 * Every fleet house in the chosen month: its servers, its size, its tank, and its heat as
 * averages per hour (kW): what it needs, what the servers gave it and what the backup made.
 */
export function HouseTable({ rows, monthName }: { rows: HouseMonth[]; monthName: string }) {
  const [sort, setSort] = useState<Sort>("demand");
  const sorted = [...rows].sort((a, b) =>
    sort === "demand" ? b.demandKw - a.demandKw : a.house.id.localeCompare(b.house.id),
  );
  const inMonth = `average over every hour of ${monthName} in the scheduler's run (make months)`;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {rows.length} houses · averages per hour of {monthName}
        </p>
        <div role="group" aria-label="Sort" className="flex rounded-md border border-grid p-0.5">
          {(["demand", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={`rounded px-2.5 py-1 text-xs ${sort === s ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {s === "demand" ? "Most heat first" : "By name"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 max-h-[32rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs text-muted">
            <tr className="border-b border-grid">
              <Head source="A synthetic house of the scheduler's fleet (heatsched/fleet_scenario.py).">
                House
              </Head>
              <Head
                right
                source={
                  <>
                    Servers running on average (server-hours ÷ hours, {inMonth}) / servers installed
                    (<code>fleet_basel_bern_sites.csv</code>).
                  </>
                }
              >
                Servers
              </Head>
              <Head
                right
                source="Heat demand of the house in 2025 as it was: its space heating scale × the reference house, plus its hot water (fleet_basel_bern_sites.csv)."
              >
                Size, MWh/yr
              </Head>
              <Head right source="Hot-water tank of the house (config.json: fleet.tank_kwh range).">
                Tank, kWh
              </Head>
              <Head
                right
                source={<>Space heat by the 20/12 heating-degree rule plus hot water, {inMonth}.</>}
              >
                Demand, kW
              </Head>
              <Head
                right
                source={<>Heat the servers and the tank delivered to the house, {inMonth}.</>}
              >
                Servers, kW
              </Head>
              <Head
                right
                source={<>What the house still needed after the servers and the tank, {inMonth}.</>}
              >
                Backup, kW
              </Head>
            </tr>
          </thead>
          <tbody className="divide-y divide-grid">
            {sorted.map((r) => (
              <tr key={r.house.id} data-house={r.house.id}>
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  <span className="font-medium">
                    {r.house.name.replace(/^Synthetic (Bern )?house/, "House")}
                  </span>
                  <span className="ml-2 text-xs text-muted">{r.house.city}</span>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {fixed1(r.running)}
                  <span className="text-muted"> / {r.house.servers}</span>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {mwh(r.house.heat_demand_kwh_2025)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(r.house.tank_kwh)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{fixed1(r.demandKw)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{fixed1(r.servedKw)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{fixed1(r.backupKw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
