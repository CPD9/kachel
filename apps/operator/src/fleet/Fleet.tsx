import { Sourced } from "@kachel/ui";
import { useMemo, useState, type ReactNode } from "react";
import { celsius, chf, count, fixed1, mwh, offsetLabel } from "../format";
import { HouseTable } from "./HouseTable";
import { fleetMonth, fleetYear, MONTH_NAMES, MONTHS, type MonthsFile } from "./months";
import { YearChart } from "./YearChart";

const CITIES = ["All", "Basel", "Bern"] as const;
type City = (typeof CITIES)[number];

function Reading({
  label,
  value,
  unit,
  note,
  source,
  align = "left",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  source: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p
        data-reading={label}
        className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl"
      >
        <Sourced source={source} align={align}>
          <span data-value>{value}</span>
        </Sourced>
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
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
 * The whole fleet as the operator sees it: every house, its servers and heat, and the money,
 * for a month of the scheduler's year and a what-if on the outdoor temperature.
 */
export function Fleet({
  file = MONTHS,
  startMonth = thisMonth(),
}: {
  file?: MonthsFile;
  startMonth?: number;
}) {
  const [month, setMonth] = useState(startMonth);
  const [offset, setOffset] = useState(0);
  const [city, setCity] = useState<City>("All");
  const only = city === "All" ? undefined : city;

  const year = useMemo(() => fleetYear(file, offset, only), [file, offset, only]);
  const asItWas = useMemo(() => fleetYear(file, 0, only), [file, only]);
  const m = year.months[month] ?? fleetMonth(file, { month, offset }, only);
  const name = MONTH_NAMES[month] ?? "";
  const p = file.prices;
  const what =
    offset === 0
      ? `${name} 2025 as it was`
      : `${name} 2025 with every hour ${offsetLabel(offset)} °C`;
  const run = `the scheduler's run of every house (make months, out/fleet_months.json) on ${file.profile_source}, ${what}`;
  const prices = (
    <>
      Compute {p.compute_chf_per_server_hour} CHF per server-hour, electricity{" "}
      {p.electricity_chf_per_kwh} CHF/kWh at {p.server_power_kw} kW a server, heat valued at the
      electricity price ÷ heat-pump COP {p.heat_pump_cop} (config.json: prices; {p.source})
    </>
  );
  const temps = Object.entries(m.temp)
    .map(([c, t]) => `${c} ${celsius(t)} °C`)
    .join(" · ");

  return (
    <div className="space-y-5">
      <section aria-labelledby="controls" className="rounded-lg border border-grid bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="controls" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {name}
            <span
              data-model
              className="rounded-full bg-amber px-2.5 py-0.5 text-xs font-semibold text-ink"
            >
              Model, 2025 weather{offset !== 0 && `, ${offsetLabel(offset)} °C`}
            </span>
          </h2>
          <div role="group" aria-label="City" className="flex rounded-md border border-grid p-0.5">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={city === c}
                onClick={() => setCity(c)}
                className={`rounded px-2.5 py-1 text-xs ${city === c ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {c === "All" ? "Basel and Bern" : c}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Every figure is the scheduler&apos;s, on the real 2025 weather of each city. The houses
          are synthetic; no live server is shown here.
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="flex justify-between text-sm">
              <span className="font-medium">Month</span>
              <span className="text-muted">{name}</span>
            </span>
            <input
              type="range"
              min={0}
              max={11}
              step={1}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-2 w-full accent-ember"
            />
            <span className="flex justify-between text-[10px] text-muted">
              <span>Jan</span>
              <span>Jun</span>
              <span>Dec</span>
            </span>
          </label>
          <label className="block">
            <span className="flex justify-between text-sm">
              <span className="font-medium">Outdoor temperature</span>
              <span className="text-muted tabular-nums">
                {offsetLabel(offset)} °C · {temps}
              </span>
            </span>
            <input
              type="range"
              min={file.offsets_c[0]}
              max={file.offsets_c.at(-1)}
              step={1}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="mt-2 w-full accent-glacier"
            />
            <span className="flex justify-between text-[10px] text-muted">
              <span>colder</span>
              <span>2025 as it was</span>
              <span>warmer</span>
            </span>
          </label>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <Reading
            label="Houses"
            value={count(m.houses.length)}
            note={`${count(m.servers)} servers installed`}
            source={
              <>
                The synthetic fleet: 50 houses in Basel and 50 in Bern, each with 2 to 8 servers
                (config.json: fleet; out/fleet_basel_bern_sites.csv).
              </>
            }
          />
          <Reading
            label="Servers running"
            align="right"
            value={count(m.running)}
            unit={`of ${count(m.servers)}`}
            note={`peak ${count(m.peakRunning)} in one hour`}
            source={
              <>
                Server-hours in {name} ÷ its {m.hours} hours: the servers the houses&apos; heat
                could use, on average. Peak: the most running in one hour, each city&apos;s peak
                added. From {run}.
              </>
            }
          />
          <Reading
            label="Heat delivered"
            value={mwh(m.servedKwh)}
            unit="MWh"
            note={`of ${mwh(m.demandKwh)} MWh demand`}
            source={
              <>
                Heat the servers and tanks delivered to the houses in {name}; demand is space heat
                by the 20/12 heating-degree rule plus hot water. From {run}.
              </>
            }
          />
          <Reading
            label="Backup"
            align="right"
            value={mwh(m.backupKwh)}
            unit="MWh"
            note={`${fixed1(m.backupKwh / m.hours)} kW on average`}
            source={
              <>
                What the houses still needed from their own heating in {name}. From {run}.
              </>
            }
          />
          <Reading
            label="Revenue now"
            value={chf(m.money.revenue / m.hours)}
            unit="an hour"
            note={`an average hour of ${name}`}
            source={
              <>
                {count(m.serverHours)} server-hours × compute price ÷ {m.hours} hours. {prices}.
              </>
            }
          />
          <Reading
            label="Revenue today"
            align="right"
            value={chf(m.money.revenue / m.days)}
            unit="a day"
            note={`an average day of ${name}`}
            source={
              <>
                {count(m.serverHours)} server-hours × compute price ÷ {m.days} days. {prices}.
              </>
            }
          />
          <Reading
            label="Revenue this year"
            value={chf(year.money.revenue)}
            note={`${chf(m.money.revenue)} in ${name}`}
            source={
              <>
                {count(year.serverHours)} server-hours in the twelve months × compute price.{" "}
                {prices}. From the scheduler&apos;s run of every month
                {offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}.
              </>
            }
          />
          <Reading
            label="Margin this year"
            align="right"
            value={chf(year.money.margin)}
            note={`${chf(m.money.margin)} in ${name}, before hardware`}
            source={
              <>
                Revenue {chf(year.money.revenue)} − electricity {chf(year.money.electricity)} + heat
                value {chf(year.money.heatValue)}, as the scheduler&apos;s kpis count it. Hardware
                and its payback are on the economics page (docs/economics). {prices}.
              </>
            }
          />
        </div>
      </section>

      <section aria-labelledby="year" className="rounded-lg border border-grid bg-paper p-5">
        <h2 id="year" className="text-lg font-semibold">
          The year
          <span className="ml-2 text-sm font-normal text-muted">
            heat for the fleet each month, MWh
            {offset !== 0 && `, every hour ${offsetLabel(offset)} °C`}
          </span>
        </h2>
        <div className="mt-5">
          <YearChart months={year.months} month={month} onPick={setMonth} />
        </div>
        <p className="mt-3 text-xs text-muted">
          {offset === 0
            ? `As 2025 was. Move the temperature to see a warmer or colder year: heat demand, servers running and revenue follow.`
            : `A year with every hour ${offsetLabel(offset)} °C needs ${mwh(year.demandKwh)} instead of ${mwh(asItWas.demandKwh)} MWh of heat, and its servers run ${count(year.serverHours)} instead of ${count(asItWas.serverHours)} server-hours.`}
        </p>
      </section>

      <section aria-labelledby="houses" className="rounded-lg border border-grid bg-paper p-5">
        <h2 id="houses" className="text-lg font-semibold">
          Every house
        </h2>
        <div className="mt-3">
          <HouseTable rows={m.houses} monthName={name} />
        </div>
      </section>
    </div>
  );
}
