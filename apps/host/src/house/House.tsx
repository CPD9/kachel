import { NO_HOUSE, watchHouse, type HouseFeed, type HouseHour } from "@kachel/db";
import { Sourced } from "@kachel/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DayChart } from "./DayChart";
import { chooseDay, dayMoney, hourAt, local, toDays, toPrices } from "./day";
import { celsius, clock, kwh, longDate, shortDate } from "./format";
import { Money } from "./Money";
import { TankGauge } from "./TankGauge";

const systemClock = () => new Date();

/**
 * heat_state.server_hours in an hour is how many servers ran it. A replayed hour says "ran", so
 * it is never read as the live server list below.
 */
const working = (n: number, live: boolean) => {
  const servers = n === 0 ? "no server" : n === 1 ? "1 server" : `${n} servers`;
  return live ? `${servers} working` : `${servers} ran in the replayed hour`;
};

function Reading({
  label,
  value,
  unit,
  mark,
  source,
  align = "left",
}: {
  label: string;
  value: string;
  unit: string;
  mark?: string;
  source: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {mark && <span className={`inline-block w-2.5 ${mark}`} aria-hidden />}
        {label}
      </p>
      <p data-reading={label} className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        <Sourced source={source} align={align}>
          {value}
        </Sourced>
        <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
      </p>
    </div>
  );
}

function Now({ row, at, servers }: { row: HouseHour; at: string; servers: number }) {
  const where = <> for {at}</>;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
      <Reading
        label="Outdoor"
        value={row.temp_c === null ? "–" : celsius(row.temp_c)}
        unit="°C"
        source={
          <>
            <code>heat_state.temp_c</code>
            {where}: the hourly Basel weather the scheduler ran on.
          </>
        }
      />
      <Reading
        label="Demand"
        align="right"
        value={kwh(row.demand_kwh)}
        unit="kWh"
        mark="h-0.5 bg-ink"
        source={
          <>
            <code>heat_state.demand_kwh</code>
            {where}: space heat by the 20/12 heating-degree rule plus hot water (case brief).
          </>
        }
      />
      <Reading
        label="Servers"
        value={kwh(row.heat_used)}
        unit="kWh"
        mark="h-2.5 rounded-sm bg-ember"
        source={
          <>
            <code>heat_state.heat_used</code>
            {where}: {servers} server-hours × power × heat recovery (assumptions:{" "}
            <code>server.power_kw</code>, <code>server.heat_recovery</code>), less any heat dumped.
          </>
        }
      />
      <Reading
        label="Backup"
        align="right"
        value={kwh(row.backup_kwh)}
        unit="kWh"
        mark="h-2.5 rounded-sm bg-glacier"
        source={
          <>
            <code>heat_state.backup_kwh</code>
            {where}: what the house still needed after the servers and the tank.
          </>
        }
      />
    </div>
  );
}

/** How this hour's heat splits between the servers and the backup heater. */
function Split({ row }: { row: HouseHour }) {
  const made = row.heat_used + row.backup_kwh;
  if (made <= 0) return null;
  const servers = Math.round((row.heat_used / made) * 100);
  return (
    <div className="mt-6">
      <p className="flex justify-between text-xs text-muted">
        <span>
          Servers <span className="font-semibold text-ink tabular-nums">{servers}%</span>
        </span>
        <span>
          Backup <span className="font-semibold text-ink tabular-nums">{100 - servers}%</span>
        </span>
      </p>
      <div
        className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`This hour's heat: ${servers}% from the servers, ${100 - servers}% from the backup heater`}
      >
        {row.heat_used > 0 && <div className="bg-ember" style={{ flexGrow: row.heat_used }} />}
        {row.backup_kwh > 0 && <div className="bg-glacier" style={{ flexGrow: row.backup_kwh }} />}
      </div>
    </div>
  );
}

/**
 * The house: its heat now, its day hour by hour and its money, live from heat_state, kpis and
 * assumptions. Until the scheduler writes today's hours, it replays a stored day at the
 * clock's hour and says so.
 */
export function House({ feed, now = systemClock }: { feed: HouseFeed; now?: () => Date }) {
  const [state, setState] = useState(NO_HOUSE);
  useEffect(() => watchHouse(feed, setState), [feed]);
  const [time, setTime] = useState(now);
  useEffect(() => {
    const tick = setInterval(() => setTime(now()), 30_000);
    return () => clearInterval(tick);
  }, [now]);
  const [picked, setPicked] = useState<string>();

  const days = useMemo(() => toDays(state.hours.values()), [state.hours]);
  const prices = useMemo(() => toPrices(state.assumptions), [state.assumptions]);

  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm">
        The house&apos;s heat cannot be read right now. Is the local database running? Start it with
        make dev.
      </p>
    );
  }
  if (state.status === "loading") return <p className="text-sm text-muted">Reading the house…</p>;
  if (state.site === null) return <p className="text-sm text-muted">No house is linked yet.</p>;

  const shown = chooseDay(days, time, picked);
  if (!shown) {
    return <p className="text-sm text-muted">The scheduler has not written any hours yet.</p>;
  }
  const { day, live } = shown;
  const current = hourAt(day, time);
  const at = current ? `${clock(current.hour)} on ${longDate(day.date)}` : longDate(day.date);
  const dayLabel = live ? "Today" : shortDate(day.date);

  return (
    <div className="space-y-5">
      <section aria-labelledby="now" className="rounded-lg border border-grid bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h2
              id="now"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold"
            >
              {live ? "Your house now" : "The scheduler's day"}
              {!live && (
                <span
                  data-replay
                  className="rounded-full bg-amber px-2.5 py-0.5 text-xs font-semibold text-ink"
                >
                  Replay of {shortDate(day.date)} {day.date.slice(0, 4)}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted">
              {state.site.name}, {state.site.city}
              {current && ` · ${clock(current.hour)}`}
            </p>
          </div>
          {days.length > 1 && (
            <div role="group" aria-label="Day" className="flex rounded-md border border-grid p-0.5">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={d === day}
                  onClick={() => setPicked(d.date)}
                  className={`rounded px-2.5 py-1 text-xs tabular-nums ${d === day ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                >
                  {shortDate(d.date)}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          {live ? (
            <>
              <span className="mr-1 inline-block size-1.5 rounded-full bg-mint align-middle" />
              Live: today&apos;s hours from the scheduler.
            </>
          ) : (
            <>
              Replay of {longDate(day.date)} from the scheduler&apos;s yearly run, at the hour on
              your clock, not your servers now: those are live below. Today&apos;s hours take over
              once the scheduler writes them.
            </>
          )}
        </p>
        {current ? (
          <div className="mt-5 flex items-start gap-6 sm:gap-10">
            <div className="flex-1">
              <Now row={current.row} at={at} servers={current.row.server_hours} />
              <Split row={current.row} />
              {current.row.reason && (
                <p className="mt-5 border-t border-grid pt-3 text-sm">
                  <span className="text-muted">Scheduler: </span>
                  {current.row.reason}
                  <span className="text-muted"> · {working(current.row.server_hours, live)}</span>
                </p>
              )}
            </div>
            <TankGauge kwhNow={current.row.soc_kwh} capacity={state.site.tank_kwh} at={at} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">No hour yet before {clock(local(time).hour)}.</p>
        )}
      </section>

      <section aria-labelledby="today" className="rounded-lg border border-grid bg-paper p-5">
        <h2 id="today" className="text-lg font-semibold">
          {live ? "Today" : `${longDate(day.date)}`}
          <span className="ml-2 text-sm font-normal text-muted">heat in each hour, kWh</span>
        </h2>
        <div className="mt-6">
          <DayChart day={day} now={current?.hour} />
        </div>
      </section>

      <Money
        today={prices ? dayMoney(day, prices) : undefined}
        dayLabel={dayLabel}
        prices={prices}
        year={state.year}
      />
    </div>
  );
}
