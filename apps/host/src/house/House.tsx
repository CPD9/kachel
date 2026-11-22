import { NO_HOUSE, watchHouse, type HouseFeed, type HouseHour, type HouseYear } from "@kachel/db";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import plantRoom from "../../../../docs/images/plantroom.webp";
import { DayChart } from "./DayChart";
import { chooseDay, dayMoney, hourAt, local, toDays, toPrices } from "./day";
import { celsius, chf, clock, dayMonth, kwh, longDate, percent } from "./format";
import { Money } from "./Money";
import { Sources } from "./Sources";

const systemClock = () => new Date();

/**
 * heat_state.server_hours in an hour is how many servers ran it. A replayed hour says "ran", so
 * it is never read as the live server list.
 */
const working = (n: number, live: boolean) => {
  const servers = n === 0 ? "no server" : n === 1 ? "1 server" : `${n} servers`;
  return live ? `${servers} working` : `${servers} ran in the replayed hour`;
};

/** A number the tests and the page both read by name. */
function Reading({ name, children }: { name: string; children: string }) {
  return (
    <span data-reading={name} className="font-semibold tabular-nums">
      {children}
    </span>
  );
}

/** The year in one sentence, from kpis; without a yearly run, just the house's name. */
function Hero({ name, city, year }: { name: string; city: string; year: HouseYear | null }) {
  const left = year
    ? year.computing_income_chf - year.electricity_cost_chf + year.value_of_heat_used_chf
    : 0;
  return (
    <section
      aria-labelledby="year"
      className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12"
    >
      <div>
        <p className="text-sm text-secondary">
          {name}, {city}
        </p>
        <h2
          id="year"
          className="mt-2 text-[34px] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[44px] xl:text-5xl"
        >
          {year
            ? `Your servers covered ${percent(year.share_of_heat_covered_pct)} of your heat this year and left you ${chf(left, true)} before hardware.`
            : "Your house, its heat and its servers."}
        </h2>
      </div>
      <img
        src={plantRoom}
        alt="The plant room: the server rack, the heat exchanger and the hot-water tank."
        className="aspect-video w-full rounded-2xl bg-fill object-cover"
      />
    </section>
  );
}

/** One plain sentence for the hour: the weather, what the house needed and who gave it. */
function Readout({ row, hour }: { row: HouseHour; hour: number }) {
  return (
    <p aria-live="polite" className="max-w-3xl text-[17px] leading-relaxed text-label">
      At {clock(hour)}{" "}
      {row.temp_c !== null && (
        <>
          it was <Reading name="Outdoor">{celsius(row.temp_c)}</Reading> °C outside.{" "}
        </>
      )}
      {row.temp_c === null ? "your" : "Your"} house needed{" "}
      <Reading name="Demand">{kwh(row.demand_kwh)}</Reading> kWh. The servers gave{" "}
      <Reading name="Servers">{kwh(row.heat_used)}</Reading> kWh and the backup heater{" "}
      <Reading name="Backup">{kwh(row.backup_kwh)}</Reading> kWh.
    </p>
  );
}

/** The hot-water tank: how much heat it holds of what it can. */
function Tank({ now, capacity }: { now: number; capacity: number }) {
  const share = Math.max(0, Math.min(1, now / capacity));
  return (
    <span className="inline-flex items-center gap-2">
      Tank {kwh(now)} of {kwh(capacity)} kWh
      <span
        role="meter"
        aria-label="Heat in the tank"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={now}
        aria-valuetext={`${kwh(now)} of ${kwh(capacity)} kWh, ${Math.round(share * 100)}%`}
        className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-separator"
      >
        <span className="block h-full bg-ember" style={{ width: `${share * 100}%` }} />
      </span>
    </span>
  );
}

/**
 * The house: the year in one sentence, its day hour by hour and its money, live from
 * heat_state, kpis and assumptions. Until the scheduler writes today's hours, it replays a
 * stored day at the clock's hour and says so. `servers` sits beside the money.
 */
export function House({
  feed,
  now = systemClock,
  servers,
}: {
  feed: HouseFeed;
  now?: () => Date;
  servers?: ReactNode;
}) {
  const [state, setState] = useState(NO_HOUSE);
  useEffect(() => watchHouse(feed, setState), [feed]);
  const [time, setTime] = useState(now);
  useEffect(() => {
    const tick = setInterval(() => setTime(now()), 30_000);
    return () => clearInterval(tick);
  }, [now]);
  const [picked, setPicked] = useState<string>();
  const [pickedHour, setPickedHour] = useState<number>();

  const days = useMemo(() => toDays(state.hours.values()), [state.hours]);
  const prices = useMemo(() => toPrices(state.assumptions), [state.assumptions]);

  const alone = (message: ReactNode) => (
    <div className="space-y-12">
      {message}
      {servers}
    </div>
  );
  if (state.status === "error") {
    return alone(
      <p role="alert" className="text-sm">
        The house&apos;s heat cannot be read right now. Is the local database running? Start it with
        make dev.
      </p>,
    );
  }
  if (state.status === "loading") {
    return alone(<p className="text-sm text-secondary">Reading the house…</p>);
  }
  if (state.site === null) {
    return alone(<p className="text-sm text-secondary">No house is linked yet.</p>);
  }

  const hero = <Hero name={state.site.name} city={state.site.city} year={state.year} />;
  const shown = chooseDay(days, time, picked);
  if (!shown) {
    return (
      <div className="space-y-12">
        {hero}
        <p className="text-sm text-secondary">The scheduler has not written any hours yet.</p>
        {servers}
      </div>
    );
  }
  const { day, live } = shown;
  const clockHour = hourAt(day, time);
  const chosen = pickedHour !== undefined ? day.hours[pickedHour] : undefined;
  const current =
    chosen && pickedHour !== undefined ? { hour: pickedHour, row: chosen } : clockHour;
  const at = current ? `${clock(current.hour)} on ${longDate(day.date)}` : longDate(day.date);
  const today = local(time).date;

  return (
    <div className="space-y-14 sm:space-y-16">
      {hero}

      <section aria-labelledby="hours">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 id="hours" className="text-2xl font-semibold tracking-tight">
            Heat in each hour
          </h2>
          {days.length > 1 && (
            <div role="group" aria-label="Day" className="flex rounded-lg bg-fill p-0.5">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={d === day}
                  onClick={() => {
                    setPicked(d.date);
                    setPickedHour(undefined);
                  }}
                  className={`rounded-md px-3 py-1 text-sm whitespace-nowrap ${d === day ? "bg-white font-semibold text-label shadow-sm" : "text-secondary hover:text-label"}`}
                >
                  {d.date === today ? "Live" : `Replay, ${dayMonth(d.date)}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-secondary">
          {live ? (
            <>
              <span
                aria-hidden
                className="mr-1.5 inline-block size-2 rounded-full bg-[#34c759] align-middle"
              />
              Live: today&apos;s hours from the scheduler.
            </>
          ) : (
            <>
              <span data-replay className="font-medium text-label">
                Replay of {longDate(day.date)}
              </span>{" "}
              from the scheduler&apos;s yearly run, at the hour on your clock. Your servers below
              are live; today&apos;s hours take over once the scheduler writes them.
            </>
          )}
        </p>
        <div className="mt-6 space-y-2">
          {current ? (
            <>
              <Readout row={current.row} hour={current.hour} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-secondary">
                {current.row.reason && (
                  <span>
                    Scheduler: <span className="text-label">{current.row.reason}</span>
                  </span>
                )}
                <span>{working(current.row.server_hours, live)}</span>
                <Tank now={current.row.soc_kwh} capacity={state.site.tank_kwh} />
              </p>
            </>
          ) : (
            <p className="text-sm text-secondary">No hour yet before {clock(local(time).hour)}.</p>
          )}
        </div>
        <div className="mt-8">
          <DayChart day={day} picked={current?.hour} onPick={setPickedHour} />
        </div>
        <Sources>
          <p>
            For {at}: outdoor is <code>heat_state.temp_c</code>, the hourly Basel weather the
            scheduler ran on. Needed is <code>heat_state.demand_kwh</code>, space heat by the 20/12
            heating-degree rule plus hot water (case brief). The servers&apos; heat is{" "}
            <code>heat_state.heat_used</code>: server-hours × power × heat recovery (assumptions:{" "}
            <code>server.power_kw</code>, <code>server.heat_recovery</code>), less any heat dumped.
            The backup heater is <code>heat_state.backup_kwh</code>, what the house still needed
            after the servers and the tank.
          </p>
          <p>
            The tank is <code>heat_state.soc_kwh</code> at the end of the hour, of{" "}
            <code>sites.tank_kwh</code>, the case brief&apos;s reference house (assumptions:{" "}
            <code>house.tank_kwh</code>).
          </p>
        </Sources>
      </section>

      <div className="grid items-start gap-14 lg:grid-cols-2 lg:gap-16">
        <Money
          today={prices ? dayMoney(day, prices) : undefined}
          dayLabel={live ? "Today" : dayMonth(day.date)}
          prices={prices}
          year={state.year}
        />
        {servers}
      </div>
    </div>
  );
}
