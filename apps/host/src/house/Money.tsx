import type { HouseYear } from "@kachel/db";
import type { ReactNode } from "react";
import type { DayMoney, Figure, Prices } from "./day";
import { chf, count, kwh, NBSP } from "./format";
import { Sources } from "./Sources";

function Price({ f }: { f: Figure }) {
  return (
    <>
      <code>{f.label}</code> = {f.value} ({f.source})
    </>
  );
}

type Line = { label: string; sign: "+" | "−" | ""; day?: number; year?: number };

function Amount({ value, sign, year }: { value: number; sign: Line["sign"]; year: boolean }) {
  const shown = value < 0 && sign === "" ? `−${NBSP}` : sign ? `${sign}${NBSP}` : "";
  return (
    <>
      {shown}
      {chf(value, year)}
    </>
  );
}

/**
 * What the servers earned and saved, for the shown day and for the year, as one table. A column
 * without its numbers (no prices yet, no yearly run yet) is left out rather than filled in.
 */
export function Money({
  today,
  dayLabel,
  prices,
  year,
}: {
  today: DayMoney | undefined;
  dayLabel: string;
  prices: Prices | undefined;
  year: HouseYear | null;
}) {
  const day = today && prices ? today : undefined;
  const lines: Line[] = [
    {
      label: "Earned from computing",
      sign: "",
      ...(day && { day: day.earned }),
      ...(year && { year: year.computing_income_chf }),
    },
    {
      label: "Electricity for the servers",
      sign: "−",
      ...(day && { day: day.electricity }),
      ...(year && { year: year.electricity_cost_chf }),
    },
    {
      label: "Heat it saved you",
      sign: "+",
      ...(day && { day: day.heatSaved }),
      ...(year && { year: year.value_of_heat_used_chf }),
    },
    {
      label: "Left before hardware",
      sign: "",
      ...(day && { day: day.left }),
      ...(year && {
        year: year.computing_income_chf - year.electricity_cost_chf + year.value_of_heat_used_chf,
      }),
    },
  ];
  const yearSource = year
    ? `kpis, computed ${year.computed_at.slice(0, 10)} by the scheduler's yearly run on ${year.profile_source} (${count(year.server_hours_sold)} server-hours sold).`
    : "";

  let sources: ReactNode = null;
  if (day && prices) {
    sources = (
      <p>
        <strong className="font-medium text-label">{dayLabel}.</strong> Earned:{" "}
        {count(day.serverHours)} server-hours (sum of <code>heat_state.server_hours</code>) ×
        compute price, <Price f={prices.compute} />. Electricity: server-hours ×{" "}
        {prices.power.value} kW × {prices.electricity.value} CHF/kWh,{" "}
        <Price f={prices.electricity} />. Heat saved: {kwh(day.heatUsedKwh)} kWh of server heat used
        (sum of <code>heat_state.heat_used</code>) × {prices.electricity.value} CHF/kWh ÷ heat-pump
        COP {prices.cop.value}, what a heat pump would have spent on it, <Price f={prices.cop} />.
      </p>
    );
  }

  if (!day && !year) {
    return (
      <section aria-labelledby="money">
        <h2 id="money" className="text-2xl font-semibold tracking-tight">
          The money
        </h2>
        <p className="mt-3 text-sm text-secondary">
          No prices and no yearly balance yet: the scheduler has not written them.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="money">
      <h2 id="money" className="text-2xl font-semibold tracking-tight">
        The money
      </h2>
      <table className="mt-4 w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-separator text-xs text-secondary">
            <th scope="col" className="py-2 text-left font-normal">
              <span className="sr-only">What</span>
            </th>
            {day && (
              <th scope="col" className="py-2 pl-3 text-right font-normal">
                {dayLabel}
              </th>
            )}
            {year && (
              <th scope="col" className="py-2 pl-3 text-right font-normal">
                This year
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {lines.map((l, i) => {
            const total = i === lines.length - 1;
            return (
              <tr key={l.label} className={total ? "font-semibold" : ""}>
                <th
                  scope="row"
                  className={`py-3 text-left ${total ? "font-semibold" : "font-normal"}`}
                >
                  {l.label}
                </th>
                {l.day !== undefined && (
                  <td className="py-3 pl-3 text-right whitespace-nowrap">
                    <Amount value={l.day} sign={l.sign} year={false} />
                  </td>
                )}
                {l.year !== undefined && (
                  <td className="py-3 pl-3 text-right whitespace-nowrap">
                    <Amount value={l.year} sign={l.sign} year />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Sources>
        {sources}
        {year && (
          <p>
            <strong className="font-medium text-label">This year.</strong>{" "}
            <code>kpis.computing_income_chf</code>, <code>kpis.electricity_cost_chf</code> and{" "}
            <code>kpis.value_of_heat_used_chf</code>: {yearSource} The share of your heat at the top
            is <code>kpis.share_of_heat_covered_pct</code> ({kwh(year.share_of_heat_covered_pct)}
            %), from the same run.
          </p>
        )}
        <p>
          Left before hardware is earned − electricity + heat saved, as the scheduler counts its
          year. Hardware and its payback are on the economics page (docs/economics). The compute
          price is our assumption.
        </p>
      </Sources>
    </section>
  );
}
