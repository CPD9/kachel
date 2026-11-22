import { useMemo } from "react";
import { chf, count, mwh, offsetLabel } from "../format";
import { fleetYear, type MonthsFile } from "../fleet/months";
import { settlement, settlementCsv } from "../fleet/settle";
import { YearChart } from "../fleet/YearChart";
import { PageHead, Sources } from "../shell/Shell";
import { card, primary, th } from "../ui";
import { MonthControls } from "./MonthControls";
import { SettlementDash } from "./SettlementDash";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const num = "py-2.5 pr-4 text-right tabular-nums";

/**
 * Billing: the month's settlement (buyers invoiced, the homes' heat and electricity, the margin)
 * and the year, both for the chosen month and outdoor temperature.
 */
export function Billing({
  file,
  tab,
  month,
  monthName,
  offset,
  onMonth,
  onOffset,
}: {
  file: MonthsFile;
  tab: "settlement" | "year";
  month: number;
  monthName: string;
  offset: number;
  onMonth: (m: number) => void;
  onOffset: (o: number) => void;
}) {
  const view = { month, offset };
  const s = useMemo(() => settlement(file, { month, offset }), [file, month, offset]);
  const year = useMemo(() => fleetYear(file, offset), [file, offset]);
  const asItWas = useMemo(() => fleetYear(file, 0), [file]);
  const t = s.total.money;
  const what = offset === 0 ? "" : ` at ${offsetLabel(offset)} °C`;
  const p = file.prices;
  const prices = (
    <p>
      Compute {p.compute_chf_per_server_hour} CHF per server-hour; electricity{" "}
      {p.electricity_chf_per_kwh} CHF/kWh at {p.server_power_kw} kW a server; heat valued at the
      electricity price ÷ heat-pump COP {p.heat_pump_cop} (config.json: prices). Margin is revenue −
      electricity + heat value, as the scheduler&apos;s kpis count it, before hardware; hardware and
      payback are in docs/economics.
    </p>
  );

  return (
    <>
      <PageHead
        title={tab === "settlement" ? `Settlement for ${monthName}${what}` : `The year${what}`}
        action={
          tab === "settlement" ? (
            <button
              type="button"
              className={primary}
              onClick={() =>
                download(
                  `kachel-settlement-${monthName.toLowerCase()}${offset ? `-${offset}c` : ""}.csv`,
                  settlementCsv(file, view),
                )
              }
            >
              Export CSV
            </button>
          ) : undefined
        }
        tabs={[
          { label: "Settlement", route: "billing", on: tab === "settlement" },
          { label: "The year", route: "billing/year", on: tab === "year" },
        ]}
      />
      <MonthControls
        file={file}
        month={month}
        offset={offset}
        onMonth={onMonth}
        onOffset={onOffset}
      />

      {tab === "settlement" && (
        <>
          <SettlementDash file={file} month={month} monthName={monthName} offset={offset} />
          <p className="mt-8 max-w-[1000px] text-[17px] leading-snug font-semibold tracking-tight sm:text-[20px]">
            Buyers are invoiced{" "}
            <span data-reading="Invoiced">
              <span data-value>{chf(t.revenue)}</span>
            </span>{" "}
            for {count(s.total.serverHours)} server-hours. The servers drew {chf(t.electricity)} of
            electricity and gave the homes {mwh(s.total.servedKwh)} MWh of heat worth{" "}
            {chf(t.heatValue)}. DigitalHeat keeps{" "}
            <span data-reading="Margin">
              <span data-value>{chf(t.margin)}</span>
            </span>{" "}
            before hardware.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-labelledby="invoiced" className={`${card} overflow-x-auto`}>
              <h2 id="invoiced" className="px-5 pt-4 text-[17px] font-semibold">
                Buyers invoiced
              </h2>
              <table className="mt-2 w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-sep">
                    <th className={`${th} pl-5`}>Data stays in</th>
                    <th className={`${th} text-right`}>Homes</th>
                    <th className={`${th} text-right`}>Server-hours</th>
                    <th className={`${th} pr-5 text-right`}>Invoice, CHF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sep/60">
                  {s.zones.map((z) => (
                    <tr key={z.zone}>
                      <td className="py-2.5 pr-4 pl-5 font-semibold">{z.zone}</td>
                      <td className={num}>{z.houses}</td>
                      <td className={num}>{count(z.serverHours)}</td>
                      <td className={`${num} pr-5`}>{count(z.money.revenue)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4 pl-5">Total</td>
                    <td className={num}>{s.total.houses.length}</td>
                    <td className={num}>{count(s.total.serverHours)}</td>
                    <td className={`${num} pr-5`}>{count(t.revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section aria-labelledby="hosts" className={`${card} overflow-x-auto`}>
              <h2 id="hosts" className="px-5 pt-4 text-[17px] font-semibold">
                Hosts: heat and electricity
              </h2>
              <table className="mt-2 w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-sep">
                    <th className={`${th} pl-5`}>Zone</th>
                    <th className={`${th} text-right`}>Heat, kWh</th>
                    <th className={`${th} text-right`}>Heat value, CHF</th>
                    <th className={`${th} pr-5 text-right`}>Electricity, CHF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sep/60">
                  {s.zones.map((z) => (
                    <tr key={z.zone}>
                      <td className="py-2.5 pr-4 pl-5 font-semibold">{z.zone}</td>
                      <td className={num}>{count(z.servedKwh)}</td>
                      <td className={num}>{count(z.money.heatValue)}</td>
                      <td className={`${num} pr-5`}>{count(z.money.electricity)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4 pl-5">Total</td>
                    <td className={num}>
                      <span className="mr-1.5 inline-block size-2 rounded-full bg-ember align-middle" />
                      {count(s.total.servedKwh)}
                    </td>
                    <td className={num}>{count(t.heatValue)}</td>
                    <td className={`${num} pr-5`}>{count(t.electricity)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
          <p data-reconcile className={`${card} mt-6 px-5 py-3.5 text-[15px] tabular-nums`}>
            {count(t.revenue)} invoiced − {count(t.electricity)} electricity + {count(t.heatValue)}{" "}
            heat value = <span className="font-semibold">{chf(t.margin)}</span> margin before
            hardware
          </p>
          <Sources>
            <p>
              Server-hours and heat per zone: the scheduler&apos;s run of every synthetic house
              (make months, services/scheduler/out/fleet_months.json) on the 2025 weather of Basel
              and Bern{offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}. The buyers in the
              model are not split by name; the live buyers are under Jobs.
            </p>
            {prices}
          </Sources>
        </>
      )}

      {tab === "year" && (
        <section aria-labelledby="year" className={`${card} mt-6 p-5`}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
            <div>
              <h2 id="year" className="text-[15px] text-label-2">
                Revenue this year
              </h2>
              <p
                data-reading="Revenue this year"
                className="mt-1 text-[40px] leading-none font-semibold tracking-tight tabular-nums"
              >
                <span data-value>{chf(year.money.revenue)}</span>
              </p>
              <p className="mt-2 text-[15px]">
                Margin{" "}
                <span data-reading="Margin this year" className="font-semibold">
                  <span data-value>{chf(year.money.margin)}</span>
                </span>{" "}
                before hardware
              </p>
              <p className="mt-3 text-[14px] text-label-2">
                {offset === 0
                  ? "As 2025 was. Move the temperature: heat, servers and revenue follow."
                  : `${mwh(year.demandKwh)} instead of ${mwh(asItWas.demandKwh)} MWh of heat, ${count(year.serverHours)} instead of ${count(asItWas.serverHours)} server-hours.`}
              </p>
            </div>
            <YearChart months={year.months} month={month} onPick={onMonth} />
          </div>
          <Sources>
            <p>
              {count(year.serverHours)} server-hours in the twelve months × the compute price, from
              the scheduler&apos;s run of every month
              {offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}.
            </p>
            {prices}
          </Sources>
        </section>
      )}
    </>
  );
}
