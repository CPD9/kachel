import { useMemo } from "react";
import type { BuyerRow, Live, OperatorSource } from "../live/live";
import { FleetMap } from "../map/FleetMap";
import { AgentStrip } from "../replay/AgentStrip";
import type { Agent } from "../replay/replay";
import type { FleetMonth } from "../fleet/months";
import { houseName, needsAttention, ATTENTION_BELOW } from "../fleet/state";
import { href } from "../shell/route";
import { PageHead, Pill, Sources } from "../shell/Shell";
import { card, secondary, th } from "../ui";
import { TodayDash } from "./TodayDash";

/** The attention list stays short; the rest is one click away in Buildings. */
const SHOWN = 8;

/**
 * The morning check: one sentence on how the homes are, the few that need the operator with one
 * action each, and Basel and Bern with those houses marked.
 */
export function Today({
  month,
  before,
  monthNumber,
  monthName,
  dateLine,
  brightest,
  live,
  rows,
  source,
  agent,
}: {
  month: FleetMonth;
  /** The month before, in the same model, for the deltas. */
  before: FleetMonth;
  monthNumber: number;
  monthName: string;
  /** "Sunday 22 November." in the month we are in, otherwise "In July." */
  dateLine: string;
  brightest: number;
  live: Live;
  rows: BuyerRow[];
  source: OperatorSource | undefined;
  agent: Agent;
}) {
  const attention = useMemo(() => needsAttention(month, monthName), [month, monthName]);
  const total = month.houses.length;
  const fine = total - attention.length;
  // The map marks the rows the table shows, so the two always agree.
  const shown = attention.slice(0, SHOWN);
  const marked = useMemo(
    () => new Map(attention.slice(0, SHOWN).map((a) => [a.row.house.id, houseName(a.row)])),
    [attention],
  );
  const headline =
    attention.length === 0
      ? `${dateLine} Nothing needs you. All ${total} homes are warm on server heat.`
      : `${dateLine} ${fine} homes warm on server heat, ${attention.length} need${attention.length === 1 ? "s" : ""} you.`;
  const byCity = (c: string) => shown.filter((a) => a.row.house.city === c).length;

  return (
    <>
      <PageHead eyebrow="Today" title={<span data-headline>{headline}</span>} />
      <TodayDash month={month} before={before} monthNumber={monthNumber} monthName={monthName} />
      <AgentStrip agent={agent} />

      <section aria-labelledby="attention" className={`${card} mt-6 overflow-hidden`}>
        <div className="flex items-baseline justify-between gap-4 px-4 pt-4 sm:px-5">
          <h2 id="attention" className="text-[17px] font-semibold">
            Needs attention
          </h2>
          <a href={href("buildings", { state: "attention" })} className="text-[14px] text-blue">
            Open in Buildings
          </a>
        </div>
        {attention.length === 0 ? (
          <p className="px-4 pt-2 pb-5 text-[15px] text-label-2 sm:px-5">
            Every home&apos;s servers covered at least {Math.round(ATTENTION_BELOW * 100)} % of its
            heat in {monthName}.
          </p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-sep/60 border-t border-sep/60 md:hidden">
              {shown.map((a) => (
                <li key={a.row.house.id} data-attention={a.row.house.id} className="px-4 py-3">
                  <p className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {houseName(a.row)}
                      <span className="ml-2 font-normal text-label-2">{a.row.house.city}</span>
                    </span>
                    <Pill tone="orange">Needs attention</Pill>
                  </p>
                  <p className="mt-1 text-[14px] text-label-2">{a.what}</p>
                  <a
                    href={href("buildings", { q: houseName(a.row) })}
                    className={`${secondary} mt-2`}
                  >
                    {a.action}
                  </a>
                </li>
              ))}
            </ul>
            <table className="mt-2 hidden w-full text-left text-[15px] md:table">
              <thead>
                <tr className="border-b border-sep">
                  <th className={`${th} pl-5`}>Building</th>
                  <th className={th}>Zone</th>
                  <th className={th}>What happened</th>
                  <th className={th}>State</th>
                  <th className={th}>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sep/60">
                {shown.map((a) => (
                  <tr key={a.row.house.id} data-attention={a.row.house.id}>
                    <td className="py-3 pr-4 pl-5 font-semibold whitespace-nowrap">
                      {houseName(a.row)}
                    </td>
                    <td className="py-3 pr-4">{a.row.house.city}</td>
                    <td className="py-3 pr-4">{a.what}</td>
                    <td className="py-3 pr-4">
                      <Pill tone="orange">Needs attention</Pill>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <a href={href("buildings", { q: houseName(a.row) })} className={secondary}>
                        {a.action}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attention.length > SHOWN && (
              <p className="border-t border-sep/60 px-4 py-3 text-[14px] text-label-2 sm:px-5">
                {attention.length - SHOWN} more in{" "}
                <a href={href("buildings", { state: "attention" })} className="text-blue">
                  Buildings
                </a>
                .
              </p>
            )}
          </>
        )}
      </section>

      <section aria-label="Map" className="relative mx-auto mt-6 max-w-[1120px]">
        <FleetMap
          houses={month.houses}
          places={live.places}
          buyers={rows}
          brightest={brightest}
          marked={marked}
        />
        {/* Under each city's map: the maps are 440 of 1,120 wide, Bern from 680. */}
        <div className="mt-2 grid grid-cols-[39.3%_1fr_39.3%] text-[14px] text-label-2">
          {["Basel", "Bern"].map((c) => (
            <p key={c} className={c === "Bern" ? "col-start-3" : ""}>
              {c}.{" "}
              {byCity(c) === 0
                ? "No house marked."
                : `${byCity(c)} ${byCity(c) === 1 ? "house" : "houses"} marked.`}
            </p>
          ))}
        </div>
        <p className="mt-1 text-[14px] text-label-2">
          <span className="mr-1.5 inline-block size-2.5 rounded-full bg-ember align-middle" />
          Each home, fuller with its server heat in {monthName}.
          {rows.length > 0 && " Blue lines: a buyer's job running there now, live."}
          {rows.length === 0 && source && " Sign in as the operator under Jobs to see the buyers."}
        </p>
        <Sources>
          <p>
            Heat per house: the scheduler&apos;s run of every synthetic house (make months,
            services/scheduler/out/fleet_months.json) on the real 2025 weather of Basel and Bern.
          </p>
          <p>
            Needs attention: the servers covered less than {Math.round(ATTENTION_BELOW * 100)} % of
            the house&apos;s heat in the month and the backup heater made the rest. The threshold is
            the console&apos;s, not the model&apos;s. Map tiles © swisstopo.
          </p>
        </Sources>
      </section>
    </>
  );
}
