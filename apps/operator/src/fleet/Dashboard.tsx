import { Sourced } from "@kachel/ui";
import { useMemo, useState, type ReactNode } from "react";
import { celsius, chf, count, fixed1, mwh, offsetLabel } from "../format";
import { buyerRows, useLive, type OperatorSource } from "../live/live";
import { Buyers } from "../live/Buyers";
import { FleetMap } from "../map/FleetMap";
import { panel } from "../ui";
import { HouseTable } from "./HouseTable";
import { fleetYear, MONTH_NAMES, MONTHS, type MonthsFile } from "./months";
import { YearChart } from "./YearChart";

const label = "text-[13px] font-semibold tracking-wide text-white/55 uppercase";

function Big({
  name,
  value,
  unit,
  note,
  source,
  tone = "text-white",
}: {
  name: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  source: ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <p className={label}>{name}</p>
      <p
        data-reading={name}
        className={`mt-1 text-[40px] leading-none font-semibold tracking-tight tabular-nums ${tone}`}
      >
        <Sourced source={source}>
          <span data-value>{value}</span>
        </Sourced>
        {unit && <span className="ml-1.5 text-lg font-normal text-white/55">{unit}</span>}
      </p>
      {note && <p className="mt-1.5 text-[15px] text-white/55">{note}</p>}
    </div>
  );
}

/** The current month in Basel, where the fleet's clock runs. */
const thisMonth = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", { month: "numeric", timeZone: "Europe/Zurich" }).format(
      new Date(),
    ),
  ) - 1;

/**
 * The operator view: the whole fleet on one screen. The model's figures for the chosen month
 * and temperature on the left and at the top, the map of Basel and Bern with the buyers between
 * them in the middle, the buyers' jobs (live) on the right, the year and every house below.
 */
export function Dashboard({
  file = MONTHS,
  startMonth = thisMonth(),
  source,
}: {
  file?: MonthsFile;
  startMonth?: number;
  source?: OperatorSource;
}) {
  const [month, setMonth] = useState(startMonth);
  const [offset, setOffset] = useState(0);
  const live = useLive(source);

  const year = useMemo(() => fleetYear(file, offset), [file, offset]);
  const asItWas = useMemo(() => fleetYear(file, 0), [file]);
  const brightest = useMemo(
    () => Math.max(...asItWas.months.flatMap((mo) => mo.houses.map((h) => h.servedKw))),
    [asItWas],
  );
  const m = year.months[month] ?? year.months[0];
  if (!m) throw new Error("fleet_months.json has no months");
  const rows = useMemo(
    () => buyerRows(live.buyers, live.state.jobs.values()),
    [live.buyers, live.state.jobs],
  );

  const name = MONTH_NAMES[month] ?? "";
  const p = file.prices;
  const what =
    offset === 0 ? `${name} 2025` : `${name} 2025 with every hour ${offsetLabel(offset)} °C`;
  const run = `the scheduler's run of every house (make months, out/fleet_months.json) on ${file.profile_source}, ${what}`;
  const prices = (
    <>
      Compute {p.compute_chf_per_server_hour} CHF per server-hour, electricity{" "}
      {p.electricity_chf_per_kwh} CHF/kWh at {p.server_power_kw} kW a server, heat valued at the
      electricity price ÷ heat-pump COP {p.heat_pump_cop} (config.json: prices).
    </>
  );
  const meanTemp = (i: number) => {
    const t = Object.values(file.cities).map((c) => c.mean_temp_c[i] ?? 0);
    return t.reduce((a, b) => a + b, 0) / t.length + offset;
  };

  return (
    <div className="space-y-5">
      {/* Title, the month bar, and the headline revenue. */}
      <header className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_auto_1fr]">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight">Operator view</h1>
          <p className="mt-1 text-[16px] text-white/60">
            100 homes in Basel and Bern, their servers, their heat and the money.
          </p>
          <p
            data-model
            className="mt-3 inline-block rounded-full bg-[#ff5a1f]/15 px-3 py-1 text-[13px] font-semibold text-[#ff8a5c] ring-1 ring-[#ff5a1f]/40"
          >
            Model: the scheduler on 2025 weather
            {offset !== 0 && `, ${offsetLabel(offset)} °C`} · synthetic homes
          </p>
        </div>
        <div className={`${panel} min-w-0 p-1.5`}>
          <div role="group" aria-label="Month" className="flex gap-0.5 overflow-x-auto">
            {MONTH_NAMES.map((n, i) => (
              <button
                key={n}
                type="button"
                aria-pressed={i === month}
                aria-label={n}
                onClick={() => setMonth(i)}
                className={`flex w-[58px] shrink-0 flex-col items-center rounded-2xl py-1.5 transition-colors ${i === month ? "bg-[#06b6d4] text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <span className="text-[15px] font-semibold">{n.slice(0, 3)}</span>
                <span className="text-[12px] tabular-nums opacity-80">
                  {Math.round(meanTemp(i))}°
                </span>
              </button>
            ))}
          </div>
          <label className="mt-1.5 flex flex-wrap items-center gap-3 border-t border-white/[0.08] px-2 pt-2 pb-1">
            <span className="text-[13px] font-semibold text-white/60">Outdoor temperature</span>
            <input
              type="range"
              aria-label="Outdoor temperature"
              min={file.offsets_c[0]}
              max={file.offsets_c.at(-1)}
              step={1}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="flex-1 accent-[#06b6d4]"
            />
            <span className="w-[200px] text-right text-[15px] font-semibold tabular-nums">
              {offset === 0 ? "as in 2025" : `${offsetLabel(offset)} °C`} · mean{" "}
              {celsius(meanTemp(month))} °C
            </span>
          </label>
        </div>
        <div className="xl:text-right">
          <p className={label}>Revenue this year</p>
          <p
            data-reading="Revenue this year"
            className="mt-1 text-[48px] leading-none sm:text-[68px] font-semibold tracking-tight text-white tabular-nums"
          >
            <Sourced
              align="right"
              source={
                <>
                  {count(year.serverHours)} server-hours in the twelve months × compute price.{" "}
                  {prices} From the scheduler&apos;s run of every month
                  {offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}.
                </>
              }
            >
              <span data-value>{chf(year.money.revenue)}</span>
            </Sourced>
          </p>
          <p className="mt-2 text-[17px] text-white/60">
            Margin{" "}
            <Sourced
              align="right"
              source={
                <>
                  Revenue {chf(year.money.revenue)} − electricity {chf(year.money.electricity)} +
                  heat value {chf(year.money.heatValue)}, as the scheduler&apos;s kpis count it.
                  Hardware and its payback are on the economics page (docs/economics). {prices}
                </>
              }
            >
              <span data-reading="Margin this year" className="font-semibold text-[#4ade80]">
                <span data-value>{chf(year.money.margin)}</span>
              </span>
            </Sourced>{" "}
            before hardware
          </p>
        </div>
      </header>

      {/* The month's figures, the map, the buyers. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr_340px]">
        <section aria-label={`${name} in figures`} className={`${panel} space-y-6 p-6`}>
          <Big
            name="Revenue today"
            value={chf(m.money.revenue / m.days)}
            unit="a day"
            tone="text-[#ff8a5c]"
            note={`${chf(m.money.revenue / m.hours)} an hour · an average day of ${name}`}
            source={
              <>
                {count(m.serverHours)} server-hours × compute price ÷ {m.days} days. {prices} From{" "}
                {run}.
              </>
            }
          />
          <Big
            name="Servers running"
            value={count(m.running)}
            unit={`of ${count(m.servers)}`}
            note={`peak ${count(m.peakRunning)} in one hour`}
            source={
              <>
                Server-hours in {name} ÷ its {m.hours} hours: the servers the homes&apos; heat could
                use, on average. Peak: the most running in one hour, each city&apos;s peak added.
                From {run}.
              </>
            }
          />
          <Big
            name="Heat delivered"
            value={mwh(m.servedKwh)}
            unit="MWh"
            note={`of ${mwh(m.demandKwh)} MWh the homes needed`}
            source={
              <>
                Heat the servers and tanks gave the homes in {name}; demand is space heat by the
                20/12 heating-degree rule plus hot water. From {run}.
              </>
            }
          />
          <Big
            name="Backup"
            value={mwh(m.backupKwh)}
            unit="MWh"
            tone="text-[#60a5fa]"
            note={`${fixed1(m.backupKwh / m.hours)} kW on average`}
            source={
              <>
                What the homes still needed from their own heating in {name}. From {run}.
              </>
            }
          />
          <Big
            name={`Margin in ${name}`}
            value={chf(m.money.margin)}
            tone="text-[#4ade80]"
            note="before hardware"
            source={
              <>
                Revenue {chf(m.money.revenue)} − electricity {chf(m.money.electricity)} + heat value{" "}
                {chf(m.money.heatValue)} in {name}. {prices} From {run}.
              </>
            }
          />
        </section>

        <section aria-label="Map" className="relative">
          <FleetMap houses={m.houses} places={live.places} buyers={rows} brightest={brightest} />
          <ul
            aria-label="Map legend"
            className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[14px] text-white/65"
          >
            <li className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full bg-[#ff5a1f] shadow-[0_0_10px_#ff5a1f]" />
              Home: its server heat in {name}, model
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-[3px] border-2 border-[#ff5a1f]" />
              Rack in the database
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-5 border-t-2 border-dashed border-[#06b6d4]" />A
              buyer&apos;s job now, live
            </li>
          </ul>
          {rows.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-[200px] -translate-y-1/2 text-center text-[14px] text-white/55">
              Sign in as the operator to see the buyers and their jobs.
            </p>
          )}
        </section>

        <Buyers live={live} rows={rows} source={source} />
      </div>

      <section
        aria-labelledby="year"
        className={`${panel} grid grid-cols-1 gap-6 px-6 py-5 xl:grid-cols-[316px_1fr]`}
      >
        <div>
          <h2 id="year" className="text-[22px] font-semibold">
            The year
          </h2>
          <p className="mt-1 text-[15px] text-white/55">
            Heat for the homes each month, MWh
            {offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}. Click a month to pick it.
          </p>
          <p className="mt-2 text-[15px] text-white/75">
            {offset === 0
              ? "As 2025 was. Move the temperature: heat, servers and revenue follow."
              : `${mwh(year.demandKwh)} instead of ${mwh(asItWas.demandKwh)} MWh of heat, ${count(year.serverHours)} instead of ${count(asItWas.serverHours)} server-hours.`}
          </p>
        </div>
        <YearChart months={year.months} month={month} onPick={setMonth} />
      </section>

      <section aria-labelledby="houses" className={`${panel} p-6`}>
        <h2 id="houses" className="text-[22px] font-semibold">
          Every home
        </h2>
        <div className="mt-3">
          <HouseTable rows={m.houses} monthName={name} />
        </div>
      </section>
    </div>
  );
}
