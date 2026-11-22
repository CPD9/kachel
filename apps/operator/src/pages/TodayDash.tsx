import { count, fixed1, mwh, pct } from "../format";
import { previousName, todayKpis } from "../fleet/kpis";
import type { FleetMonth } from "../fleet/months";
import { ATTENTION_BELOW } from "../fleet/state";
import { Delta, Kpi } from "../kpi/Kpi";
import { card } from "../ui";

/**
 * The morning check at a glance: homes warm on server heat, servers running, heat covered, each
 * against the month before in the same model.
 */
export function TodayDash({
  month,
  before,
  monthNumber,
  monthName,
}: {
  month: FleetMonth;
  before: FleetMonth;
  monthNumber: number;
  monthName: string;
}) {
  const t = todayKpis(month);
  const t0 = todayKpis(before);
  const against = previousName(monthNumber);
  const floor = Math.round(ATTENTION_BELOW * 100);
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <section className={`${card} p-5 sm:p-6`}>
        <Kpi
          id="kpi-warm"
          title="Homes warm on server heat"
          reading="Homes warm"
          info={`A home counts as warm on server heat when its servers covered at least ${floor} % of its heat in the month.`}
          explain={`${t.warm} of ${t.homes} homes in ${monthName}; the rest leaned on the backup heater.`}
          value={pct(t.warmShare)}
          delta={<Delta change={t.warmShare - t0.warmShare} unit="pts" against={against} />}
          segments={[
            { label: "Warm on server heat", value: t.warm, tone: "heat" },
            { label: "Needs attention", value: t.homes - t.warm, tone: "light" },
          ]}
        />
      </section>
      <section className={`${card} p-5 sm:p-6`}>
        <Kpi
          id="kpi-running"
          small
          title="Servers running"
          reading="Servers running"
          info="Servers busy on buyers' jobs, on average over the month's hours."
          explain={`${fixed1(t.running)} of ${count(t.servers)} servers on average.`}
          value={pct(t.runningShare)}
          delta={<Delta change={t.runningShare - t0.runningShare} unit="pts" against={against} />}
          segments={[
            { label: "Running", value: t.running, tone: "blue" },
            { label: "Idle", value: t.servers - t.running, tone: "light" },
          ]}
        />
      </section>
      <section className={`${card} p-5 sm:p-6`}>
        <Kpi
          id="kpi-heat-covered"
          small
          title="Heat covered"
          reading="Heat covered"
          info="Share of the homes' heat the servers made; the backup heaters made the rest."
          explain={`${mwh(month.servedKwh)} of ${mwh(month.demandKwh)} MWh from the servers.`}
          value={pct(t.coveredShare)}
          delta={<Delta change={t.coveredShare - t0.coveredShare} unit="pts" against={against} />}
          segments={[
            { label: "Servers", value: month.servedKwh, tone: "heat" },
            { label: "Backup", value: month.backupKwh, tone: "grey" },
          ]}
        />
      </section>
    </div>
  );
}
