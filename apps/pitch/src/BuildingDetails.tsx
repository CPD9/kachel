import {
  Building2,
  Calendar,
  Flame,
  Landmark,
  MapPin,
  Ruler,
  ShowerHead,
  ScanSearch,
  Snowflake,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { card, label } from "./ui";

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

/** What we found out about the building: a trait and where it comes from. */
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

/** Building photo, or a plain tinted block if the image isn't there. */
function Photo() {
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
      <span className="absolute top-2 left-2 flex animate-pill-in items-center gap-1 rounded-full bg-clay px-2 py-0.5 text-[10px] font-semibold text-white">
        <Sparkles size={11} /> Looks suitable
      </span>
    </div>
  );
}

/**
 * Cards over the map once the home building is lit up: the building on the left, what we found
 * out about it top right, and Basel's temperatures by month bottom right.
 */
export function BuildingDetails() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {/* Bottom left: the building */}
      <article
        className={`${card} absolute bottom-6 left-6 w-[300px]`}
        style={{ animationDelay: "100ms" }}
      >
        <Photo />
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

      {/* Right column: checks on top, Basel's temperatures at the bottom */}
      <div className="absolute top-6 right-6 bottom-6 flex w-[280px] flex-col justify-between gap-3">
        <article className={card} style={{ animationDelay: "100ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <div className="flex items-center justify-between">
              <p className={label}>
                <ScanSearch size={12} /> Building checks
              </p>
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/70 tabular-nums">
                {CHECKS.length}/{CHECKS.length}
              </span>
            </div>

            <ul className="mt-3 space-y-2.5">
              {CHECKS.map(({ icon: Icon, title, result }) => (
                <li key={title} className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-clay/15 text-clay">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium">{title}</p>
                    <p className="text-[10.5px] text-white/55">{result}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className={card} style={{ animationDelay: "100ms" }}>
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
      </div>
    </div>
  );
}
