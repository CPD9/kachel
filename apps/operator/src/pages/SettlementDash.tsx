import { useMemo } from "react";
import { chf, count, mwh, pct, pct1 } from "../format";
import { energy, moneyKpis, previousName, withPrevious } from "../fleet/kpis";
import type { MonthsFile } from "../fleet/months";
import { Flow } from "../kpi/Flow";
import { Delta, Kpi, KpiCard, relative } from "../kpi/Kpi";
import { card } from "../ui";

/**
 * Settlement at a glance, after Peter's reference dashboard: where the servers' heat went and what
 * DigitalHeat kept, each against the month before in the same model, then the two flows.
 */
export function SettlementDash({
  file,
  month,
  monthName,
  offset,
}: {
  file: MonthsFile;
  month: number;
  monthName: string;
  offset: number;
}) {
  const { now, before } = useMemo(
    () => withPrevious(file, { month, offset }),
    [file, month, offset],
  );
  const e = energy(file, now);
  const e0 = energy(file, before);
  const k = moneyKpis(now);
  const k0 = moneyKpis(before);
  const against = previousName(month);
  const recovery = pct(file.prices.heat_recovery);

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KpiCard
          main={
            <Kpi
              id="kpi-heat-used"
              title="Heat used by homes"
              reading="Heat used"
              info="Of the heat the servers gave off, the share the homes took rather than vented."
              explain={`${count(e.homesKwh)} of ${count(e.homesKwh + e.ventedKwh)} kWh of server heat warmed homes in ${monthName}; ${count(e.ventedKwh)} kWh vented.`}
              value={pct1(e.used)}
              delta={<Delta change={e.used - e0.used} unit="pts" against={against} />}
              segments={[
                { label: "Used by homes", value: e.homesKwh, tone: "heat" },
                { label: "Vented", value: e.ventedKwh, tone: "light" },
              ]}
            />
          }
          pair={[
            <Kpi
              key="covered"
              small
              id="kpi-covered"
              title="Heat from servers"
              reading="Heat from servers"
              info="Share of the homes' heat demand the servers covered; backup heaters made the rest."
              explain={`${mwh(now.servedKwh)} of ${mwh(now.demandKwh)} MWh the homes needed.`}
              value={pct(now.demandKwh > 0 ? now.servedKwh / now.demandKwh : 0)}
              delta={
                <Delta
                  change={
                    (now.demandKwh > 0 ? now.servedKwh / now.demandKwh : 0) -
                    (before.demandKwh > 0 ? before.servedKwh / before.demandKwh : 0)
                  }
                  unit="pts"
                  against={against}
                />
              }
              segments={[
                { label: "Servers", value: now.servedKwh, tone: "heat" },
                { label: "Backup", value: now.backupKwh, tone: "grey" },
              ]}
            />,
            <Kpi
              key="hours"
              small
              id="kpi-server-hours"
              title="Server-hours sold"
              reading="Server-hours sold"
              info="Server-hours the buyers' jobs ran on the homes' servers this month."
              explain={`${count(now.serverHours)} of ${count(now.servers * now.hours)} the fleet could run.`}
              value={count(now.serverHours)}
              delta={
                <Delta
                  change={relative(now.serverHours, before.serverHours)}
                  unit="%"
                  against={against}
                />
              }
              segments={[
                { label: "Ran", value: now.serverHours, tone: "blue" },
                { label: "Idle", value: now.servers * now.hours - now.serverHours, tone: "light" },
              ]}
            />,
          ]}
        />
        <KpiCard
          main={
            <Kpi
              id="kpi-margin"
              title="Margin"
              reading="Margin share"
              info="DigitalHeat's margin before hardware as a share of what buyers paid: paid − electricity + heat credit."
              explain={`${chf(k.margin)} kept of ${chf(k.revenue)} buyers paid in ${monthName}, heat credit included.`}
              value={pct(k.marginShare)}
              delta={<Delta change={k.marginShare - k0.marginShare} unit="pts" against={against} />}
              segments={[
                { label: "Electricity", value: k.electricity, tone: "grey" },
                { label: "Margin from compute", value: k.revenue - k.electricity, tone: "blue" },
                { label: "Heat credit", value: k.heatCredit, tone: "heat" },
              ]}
            />
          }
          pair={[
            <Kpi
              key="credit"
              small
              id="kpi-heat-credit"
              title="Heat credit"
              reading="Heat credit"
              info="What a heat pump would have spent on electricity to make the heat the homes used (config.json: COP)."
              explain={`${pct(k.heatCreditShare)} on top of what buyers paid.`}
              value={chf(k.heatCredit)}
              delta={
                <Delta change={relative(k.heatCredit, k0.heatCredit)} unit="%" against={against} />
              }
              segments={[
                { label: "Buyers paid", value: k.revenue, tone: "light" },
                { label: "Heat credit", value: k.heatCredit, tone: "heat" },
              ]}
            />,
            <Kpi
              key="power"
              small
              id="kpi-electricity"
              title="Electricity"
              reading="Electricity"
              info="The servers' electricity at the model's price per kWh."
              explain={`${pct(k.electricityShare)} of what buyers paid, ${count(e.electricityKwh)} kWh.`}
              value={chf(k.electricity)}
              delta={
                <Delta
                  change={relative(k.electricity, k0.electricity)}
                  unit="%"
                  against={against}
                />
              }
              segments={[
                { label: "Electricity", value: k.electricity, tone: "grey" },
                {
                  label: "Rest of what buyers paid",
                  value: k.revenue - k.electricity,
                  tone: "light",
                },
              ]}
            />,
          ]}
        />
      </div>

      <section aria-labelledby="flow-energy" className={`${card} mt-4 p-5 sm:p-6`}>
        <h3 id="flow-energy" className="flex items-center gap-1.5 text-[14px] font-semibold">
          Where the electricity went
          <span
            tabIndex={0}
            title={`The model captures ${recovery} of a server's electricity as heat (config.json: heat_recovery).`}
            aria-label={`The model captures ${recovery} of a server's electricity as heat.`}
            className="inline-block size-1.5 rounded-full bg-label"
          />
        </h3>
        <p className="mt-0.5 text-[13px] text-label-2">
          {mwh(e.electricityKwh)} MWh into the servers in {monthName}: {mwh(e.homesKwh)} MWh reached
          the homes as heat. The tanks carry a little heat from one month into the next.
        </p>
        <div className="mt-4">
          <Flow
            label={`Electricity ${count(e.electricityKwh)} kWh: ${count(e.capturedKwh)} kWh captured as heat, ${count(e.notCapturedKwh)} kWh not captured; ${count(e.homesKwh)} kWh to the homes, ${count(e.ventedKwh)} kWh vented.`}
            columns={[
              [
                {
                  id: "in",
                  label: "Electricity in",
                  value: e.electricityKwh,
                  tag: `${count(e.electricityKwh)} kWh`,
                  tone: "blue",
                },
              ],
              [
                {
                  id: "heat",
                  label: "Server heat",
                  value: e.capturedKwh,
                  tag: `${count(e.capturedKwh)} kWh`,
                  tone: "heat",
                },
                {
                  id: "lost",
                  label: "Not captured",
                  value: e.notCapturedKwh,
                  tag: `${count(e.notCapturedKwh)} kWh`,
                  tone: "grey",
                },
              ],
              [
                {
                  id: "homes",
                  label: "Heat to homes",
                  value: e.homesKwh,
                  tag: `${count(e.homesKwh)} kWh`,
                  tone: "heat",
                },
                {
                  id: "vented",
                  label: "Vented",
                  value: e.ventedKwh,
                  tag: `${count(e.ventedKwh)} kWh`,
                  tone: "light",
                },
              ],
            ]}
            links={[
              { from: "in", to: "heat", value: e.capturedKwh, tone: "heat" },
              { from: "in", to: "lost", value: e.notCapturedKwh, tone: "grey" },
              {
                from: "heat",
                to: "homes",
                value: Math.min(e.homesKwh, e.capturedKwh),
                tone: "heat",
              },
              { from: "heat", to: "vented", value: e.ventedKwh, tone: "light" },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="flow-money" className={`${card} mt-4 p-5 sm:p-6`}>
        <h3 id="flow-money" className="flex items-center gap-1.5 text-[14px] font-semibold">
          Where the money went
          <span
            tabIndex={0}
            title="As the scheduler's kpis count it: margin = paid − electricity + heat credit, before hardware."
            aria-label="Margin is paid minus electricity plus heat credit, before hardware."
            className="inline-block size-1.5 rounded-full bg-label"
          />
        </h3>
        <p className="mt-0.5 text-[13px] text-label-2">
          Buyers paid {chf(k.revenue)}; the heat the homes used is worth {chf(k.heatCredit)} more.
        </p>
        <div className="mt-4">
          <Flow
            height={220}
            label={`Buyers paid ${chf(k.revenue)} and the heat credit ${chf(k.heatCredit)}: ${chf(k.electricity)} electricity, ${chf(k.margin)} DigitalHeat margin.`}
            columns={[
              [
                {
                  id: "paid",
                  label: "Buyers paid",
                  value: k.revenue,
                  tag: chf(k.revenue),
                  tone: "blue",
                },
                {
                  id: "credit",
                  label: "Heat credit",
                  value: k.heatCredit,
                  tag: chf(k.heatCredit),
                  tone: "heat",
                },
              ],
              [
                {
                  id: "power",
                  label: "Electricity",
                  value: k.electricity,
                  tag: chf(k.electricity),
                  tone: "grey",
                },
                {
                  id: "margin",
                  label: "DigitalHeat margin",
                  value: k.margin,
                  tag: chf(k.margin),
                  tone: "blue",
                },
              ],
            ]}
            links={[
              { from: "paid", to: "power", value: k.electricity, tone: "grey" },
              { from: "paid", to: "margin", value: k.revenue - k.electricity, tone: "blue" },
              { from: "credit", to: "margin", value: k.heatCredit, tone: "heat" },
            ]}
          />
        </div>
      </section>
    </>
  );
}
