import type { HouseYear } from "@kachel/db";
import { Sourced } from "@kachel/ui";
import type { ReactNode } from "react";
import type { DayMoney, Figure, Prices } from "./day";
import { chf, count, kwh } from "./format";

function Price({ f }: { f: Figure }) {
  return (
    <>
      <code>{f.label}</code> = {f.value} ({f.source})
    </>
  );
}

type Line = { label: string; sign: "+" | "−" | ""; value: number; source: ReactNode };

function Column({ title, lines, year }: { title: string; lines: Line[]; year: boolean }) {
  const total = lines.at(-1);
  const parts = lines.slice(0, -1);
  return (
    <div>
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      <dl className="mt-2 text-sm">
        {parts.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-muted">{l.label}</dt>
            <dd className="tabular-nums">
              <span className="mr-1 text-muted">{l.sign}</span>
              <Sourced align="right" source={l.source}>
                {chf(l.value, year)}
              </Sourced>
            </dd>
          </div>
        ))}
        {total && (
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-ink/20 pt-2">
            <dt className="font-medium">{total.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">
              <Sourced align="right" source={total.source}>
                {total.value < 0 ? "−" : ""}
                {chf(total.value, year)}
              </Sourced>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** What the servers earned and saved, for the shown day and for the year. */
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
  const todayLines: Line[] =
    today && prices
      ? [
          {
            label: "Earned from computing",
            sign: "",
            value: today.earned,
            source: (
              <>
                {count(today.serverHours)} server-hours on {dayLabel} (sum of{" "}
                <code>heat_state.server_hours</code>) × compute price. <Price f={prices.compute} />
              </>
            ),
          },
          {
            label: "Electricity for the servers",
            sign: "−",
            value: today.electricity,
            source: (
              <>
                {count(today.serverHours)} server-hours × {prices.power.value} kW ×{" "}
                {prices.electricity.value} CHF/kWh. <Price f={prices.electricity} />
              </>
            ),
          },
          {
            label: "Heat it saved",
            sign: "+",
            value: today.heatSaved,
            source: (
              <>
                {kwh(today.heatUsedKwh)} kWh of server heat used (sum of{" "}
                <code>heat_state.heat_used</code>) × {prices.electricity.value} CHF/kWh ÷ heat-pump
                COP {prices.cop.value}: what a heat pump would have spent on it.{" "}
                <Price f={prices.cop} />
              </>
            ),
          },
          {
            label: "Left before hardware",
            sign: "",
            value: today.left,
            source: <>Earned − electricity + heat saved, as the scheduler counts its year.</>,
          },
        ]
      : [];
  const yearSource = year
    ? `kpis, computed ${year.computed_at.slice(0, 10)} by the scheduler's yearly run on ${year.profile_source} (${count(year.server_hours_sold)} server-hours sold).`
    : "";
  const yearLines: Line[] = year
    ? [
        {
          label: "Earned from computing",
          sign: "",
          value: year.computing_income_chf,
          source: (
            <>
              <code>kpis.computing_income_chf</code>: {yearSource}
            </>
          ),
        },
        {
          label: "Electricity for the servers",
          sign: "−",
          value: year.electricity_cost_chf,
          source: (
            <>
              <code>kpis.electricity_cost_chf</code>: {yearSource}
            </>
          ),
        },
        {
          label: "Heat it saved",
          sign: "+",
          value: year.value_of_heat_used_chf,
          source: (
            <>
              <code>kpis.value_of_heat_used_chf</code>: {yearSource}
            </>
          ),
        },
        {
          label: "Left before hardware",
          sign: "",
          value:
            year.computing_income_chf - year.electricity_cost_chf + year.value_of_heat_used_chf,
          source: (
            <>
              Earned − electricity + heat saved, from <code>kpis</code>. Hardware and its payback
              are on the economics page (docs/economics).
            </>
          ),
        },
      ]
    : [];

  return (
    <section aria-labelledby="money" className="rounded-lg border border-grid bg-paper p-5">
      <h2 id="money" className="text-lg font-semibold">
        The money
      </h2>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {todayLines.length > 0 ? (
          <Column title={dayLabel} lines={todayLines} year={false} />
        ) : (
          <p className="text-sm text-muted">No prices for the day yet.</p>
        )}
        {yearLines.length > 0 ? (
          <Column title="This year" lines={yearLines} year />
        ) : (
          <p className="text-sm text-muted">The yearly balance has not been computed yet.</p>
        )}
      </div>
      {year && (
        <p className="mt-4 text-xs text-muted">
          Over the year the servers covered{" "}
          <Sourced
            source={
              <>
                <code>kpis.share_of_heat_covered_pct</code>: {yearSource}
              </>
            }
          >
            {kwh(year.share_of_heat_covered_pct)}%
          </Sourced>{" "}
          of the house&apos;s heat. Hover or tap any number for its source; the compute price is our
          assumption.
        </p>
      )}
    </section>
  );
}
