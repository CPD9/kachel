import {
  Building2,
  Calendar,
  Flame,
  Landmark,
  LoaderCircle,
  MapPin,
  Ruler,
  ShowerHead,
  ScanSearch,
  Snowflake,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

/** Mock data for the demo building, as if looked up from public sources. */
const BUILDING = {
  name: "Byfangweg 18",
  address: "4051 Basel",
  image: "/byfangweg-18.png",
  kind: "Townhouse · 2 floors + attic",
  facts: [
    { icon: Calendar, k: "Built", v: "19th century" },
    { icon: Ruler, k: "Heated area", v: "≈ 300 m²" },
    { icon: Flame, k: "Current heating", v: "Oil boiler" },
  ],
  tags: ["Plant room in basement", "Radiators", "Hot water"],
};

/** What we find out about the building, one after the other: a trait and where it comes from. */
const CHECKS = [
  {
    icon: Landmark,
    title: "Historic townhouse",
    result: "Building register · 19th c., oil heating",
  },
  { icon: Wifi, title: "Fibre connected", result: "Up to 10 Gbit/s at the address" },
  { icon: Zap, title: "Strong grid connection", result: "Enough for 2 server racks" },
  { icon: Flame, title: "No district heating", result: "Not on Byfangweg · Kachel fills the gap" },
];
/** Before the first check starts, then between each check finishing. */
const CHECK_START_MS = 900;
const CHECK_STEP_MS = 900;

/** Basel's average temperature by month in °C (rough long-term means), and whether we heat. */
const MONTHS = [
  { m: "J", temp: 2, heating: true },
  { m: "F", temp: 3, heating: true },
  { m: "M", temp: 7, heating: true },
  { m: "A", temp: 10, heating: true },
  { m: "M", temp: 14, heating: false },
  { m: "J", temp: 18, heating: false },
  { m: "J", temp: 20, heating: false },
  { m: "A", temp: 19, heating: false },
  { m: "S", temp: 15, heating: false },
  { m: "O", temp: 11, heating: true },
  { m: "N", temp: 6, heating: true },
  { m: "D", temp: 3, heating: true },
];
/** Top of the chart's scale, in °C. */
const MAX_TEMP = 22;
const CLIMATE = [
  { icon: Snowflake, k: "Heating days", v: "≈ 210 / yr" },
  { icon: Calendar, k: "Heating season", v: "Oct – Apr" },
];

const card = "edge-card pointer-events-auto animate-card-in rounded-[26px] p-2 text-white";
const label =
  "flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-white/55 uppercase";

/** How many CHECKS have finished; counts up from 0 on a timer. */
function useChecksDone(): number {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= CHECKS.length) return;
    const t = setTimeout(() => setDone(done + 1), done === 0 ? CHECK_START_MS : CHECK_STEP_MS);
    return () => clearTimeout(t);
  }, [done]);
  return done;
}

/** Building photo, or a plain tinted block if the image isn't there. */
function Photo({ checked }: { checked: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-32 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#3a2a20] to-[#1b1d21]">
      {failed ? (
        <Building2 size={40} className="absolute inset-0 m-auto text-white/20" />
      ) : (
        <img
          src={BUILDING.image}
          alt={BUILDING.name}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover object-[center_35%]"
        />
      )}
      {checked ? (
        <span
          key="suitable"
          className="absolute top-2 left-2 flex animate-pill-in items-center gap-1 rounded-full bg-clay px-2 py-0.5 text-[10px] font-semibold text-white"
        >
          <Sparkles size={11} /> Looks suitable
        </span>
      ) : (
        <span
          key="checking"
          className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur-md"
        >
          <LoaderCircle size={11} className="animate-spin" /> Checking…
        </span>
      )}
    </div>
  );
}

/**
 * Cards over the map once the home building is lit up: the building on the left, the checks
 * running on it top right, and once they're done, Basel's temperatures by month bottom right.
 */
export function BuildingDetails() {
  const done = useChecksDone();
  const checked = done >= CHECKS.length;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {/* Bottom left: the building */}
      <article
        className={`${card} absolute bottom-6 left-6 w-[300px]`}
        style={{ animationDelay: "100ms" }}
      >
        <Photo checked={checked} />
        <div className="px-2 pt-3 pb-1.5">
          <p className={`${label} text-clay`}>
            <MapPin size={11} /> Your building
          </p>
          <h3 className="mt-1 text-[17px] leading-tight font-semibold">{BUILDING.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-white/55">
            {BUILDING.address} · {BUILDING.kind}
          </p>

          <dl className="mt-3 space-y-1.5 text-[11.5px]">
            {BUILDING.facts.map(({ icon: Icon, k, v }) => (
              <div key={k} className="flex items-center justify-between">
                <dt className={label}>
                  <Icon size={12} /> {k}
                </dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {BUILDING.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/70"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </article>

      {/* Right column: checks on top, Basel's temperatures at the bottom once the checks are done */}
      <div className="absolute top-6 right-6 bottom-6 flex w-[280px] flex-col justify-between gap-3">
        <article className={card} style={{ animationDelay: "400ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <div className="flex items-center justify-between">
              <p className={label}>
                <ScanSearch size={12} /> Checking your building
              </p>
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/70 tabular-nums">
                {done}/{CHECKS.length}
              </span>
            </div>

            <ul className="mt-3 space-y-2.5">
              {CHECKS.map(({ icon: Icon, title, result }, i) => {
                const isDone = i < done;
                const running = i === done;
                return (
                  <li key={title} className="flex items-center gap-2.5">
                    {/* The trait's icon in a tile: dim while waiting, spinner while looking it up */}
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-xl transition-colors duration-500 ${
                        isDone ? "bg-clay/15 text-clay" : "bg-white/[0.06] text-white/30"
                      }`}
                    >
                      {running ? (
                        <LoaderCircle size={15} className="animate-spin text-clay" />
                      ) : (
                        <Icon
                          key={isDone ? "done" : "wait"}
                          size={15}
                          className={isDone ? "animate-pill-in" : ""}
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-[11.5px] font-medium ${isDone || running ? "" : "text-white/40"}`}
                      >
                        {title}
                      </p>
                      <p className="text-[10.5px] text-white/55">
                        {isDone ? result : running ? "Looking up…" : "Waiting"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </article>

        {checked && (
          <article className={card}>
            <div className="px-2 pt-2 pb-1.5">
              <p className={label}>
                <Snowflake size={12} /> Weather in Basel
              </p>

              {/* Average temperature per month, orange where the heating is on */}
              <div className="mt-3 flex h-24 items-end gap-1">
                {MONTHS.map(({ m, temp, heating }, i) => {
                  const now = i === new Date().getMonth();
                  return (
                    <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
                      <div
                        className="flex w-full flex-1 origin-bottom animate-[grow-up_700ms_cubic-bezier(0.22,1,0.36,1)_both] flex-col items-center justify-end gap-0.5"
                        style={{ animationDelay: `${150 + i * 40}ms` }}
                      >
                        <span
                          className={`text-[8.5px] font-semibold tabular-nums ${heating ? "text-clay" : "text-white/45"}`}
                        >
                          {temp}°
                        </span>
                        <div
                          className={`w-full rounded-t-[3px] ${
                            heating ? (now ? "bg-clay" : "bg-clay/60") : "bg-white/20"
                          } ${now ? "ring-1 ring-white/70" : ""}`}
                          style={{ height: `${(temp / MAX_TEMP) * 100}%` }}
                        />
                      </div>
                      <span
                        className={`text-[9px] font-semibold ${now ? "text-white" : "text-white/40"}`}
                      >
                        {m}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-3 text-[10px] text-white/55">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-clay/60" /> Heating needed
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-white/20" /> No heating
                </span>
                <span className="ml-auto">Ø °C</span>
              </div>

              <dl className="mt-3 space-y-1.5 text-[11.5px]">
                {CLIMATE.map(({ icon: Icon, k, v }) => (
                  <div key={k} className="flex items-center justify-between">
                    <dt className={label}>
                      <Icon size={12} /> {k}
                    </dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-clay/15 px-2.5 py-1.5 text-[11px] font-medium text-clay">
                <ShowerHead size={13} className="mt-px shrink-0" />
                In summer, the server heat still goes into your hot water.
              </p>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
