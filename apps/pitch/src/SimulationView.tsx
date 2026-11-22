import {
  ArrowLeft,
  CloudRain,
  Coins,
  Globe2,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { COMPACT_TOP, useCompact } from "./compact";
import { NEIGHBOURS } from "./neighbours";
import {
  DEFAULT_SIM,
  MONTHS,
  neighbourKw,
  REMOTE_COLOR,
  type SimParams,
  type SimView,
  simulateDay,
  simulateYear,
  WEATHER,
  type Weather,
} from "./simulation";
import { Sheet } from "./Sheet";
import { card, label } from "./ui";

const CYAN = "#06b6d4";

const chf = (x: number) => `CHF ${Math.round(x).toLocaleString("de-CH")}`;

const WEATHER_ICON: Record<Weather, typeof Sun> = {
  clear: Sun,
  rain: CloudRain,
  snow: Snowflake,
};

/** All the simulation's state, kept in App so the map can show it too. */
export function useSimulation() {
  const [month, setMonth] = useState(0);
  const [weather, setWeather] = useState<Weather>("clear");
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM);

  const mean = (MONTHS[month]?.temp ?? 0) + WEATHER[weather].offset;
  const day = useMemo(() => simulateDay(mean, params), [mean, params]);
  const year = useMemo(() => simulateYear(month, weather, params), [month, weather, params]);
  // The map shows the month's averages: mean temperature, average load per neighbour and rack
  const view: SimView = {
    signed: params.signed,
    weather,
    temp: mean,
    kw: NEIGHBOURS.map((_, i) => averageKw(i)),
    rack: day.reduce((sum, h) => sum + h.customers + h.batch, 0) / day.length,
    remote: day.reduce((sum, h) => sum + h.batch, 0) / day.length,
  };

  const toggle = (i: number) =>
    setParams((p) => ({ ...p, signed: p.signed.map((on, j) => (j === i ? !on : on)) }));

  return {
    month,
    setMonth,
    weather,
    setWeather,
    params,
    setParams,
    toggle,
    day,
    year,
    view,
  };
}
export type Sim = ReturnType<typeof useSimulation>;

/** Neighbour i's average load on the rack over a day, kW. */
function averageKw(i: number): number {
  return Array.from({ length: 24 }, (_, h) => neighbourKw(i, h)).reduce((a, b) => a + b, 0) / 24;
}

/** A number that glides to its new value instead of jumping. */
function useGlide(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (target - a) * (1 - (1 - t) ** 3);
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

/**
 * Top centre: the month, the weather, and that month's average temperature. On a phone the months
 * scroll sideways, keeping the picked one in view.
 */
function WeatherBar({ s, compact = false }: { s: Sim; compact?: boolean }) {
  const temp = s.view.temp;
  const months = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = months.current;
    const el = row?.children[s.month] as HTMLElement | undefined;
    if (!compact || !row || !el) return;
    row.scrollTo({
      left: el.offsetLeft - (row.clientWidth - el.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [compact, s.month]);
  return (
    <div
      className={`pointer-events-auto flex animate-pill-in flex-col items-center gap-1.5 rounded-[22px] border border-white/10 bg-[#1b1d21]/85 p-1.5 font-sans text-white shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl ${
        compact ? "w-full max-w-[560px]" : ""
      }`}
    >
      <div
        ref={months}
        className={`flex gap-0.5 ${compact ? "w-full snap-x overflow-x-auto [scrollbar-width:none]" : ""}`}
      >
        {MONTHS.map((m, i) => (
          <button
            key={m.name}
            onClick={() => s.setMonth(i)}
            className={`flex flex-col items-center rounded-xl transition-colors ${
              compact ? "min-h-11 w-11 shrink-0 snap-center justify-center" : "w-10 py-1"
            } ${
              i === s.month ? "text-white" : "text-white/45 hover:bg-white/[0.06] hover:text-white"
            }`}
            style={i === s.month ? { background: CYAN } : undefined}
          >
            <span className="text-[11px] font-semibold">{m.name}</span>
            <span className="text-[9px] tabular-nums opacity-80">{Math.round(m.temp)}°</span>
          </button>
        ))}
      </div>
      <div className="flex w-full items-center gap-1 border-t border-white/[0.08] pt-1.5">
        {(Object.keys(WEATHER) as Weather[]).map((w) => {
          const Icon = WEATHER_ICON[w];
          return (
            <button
              key={w}
              onClick={() => s.setWeather(w)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors ${
                compact ? "min-h-10 shrink-0 whitespace-nowrap" : "py-1"
              } ${
                w === s.weather
                  ? "bg-white text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon size={13} /> {WEATHER[w].label}
            </button>
          );
        })}
        <span className="ml-auto flex shrink-0 items-center gap-2 pr-1 whitespace-nowrap">
          <span
            className="text-[15px] font-semibold tabular-nums"
            style={{ color: temp < 0 ? "#7dd3fc" : temp > 22 ? "#fb923c" : "white" }}
          >
            {temp.toFixed(1)} °C
          </span>
          {!compact && <span className="text-[10.5px] text-white/50">average</span>}
        </span>
      </div>
    </div>
  );
}

function Slider({
  name,
  value,
  min,
  max,
  step,
  unit,
  scale = 100,
  accent = "accent-cyan-500",
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Shown value = value × scale (CHF → Rp by default). */
  scale?: number;
  accent?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block px-2 py-1">
      <span className="flex justify-between text-[11px]">
        <span className="text-white/60">{name}</span>
        <span className="font-semibold tabular-nums">
          {Math.round(value * scale)} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 h-1 w-full cursor-pointer ${accent}`}
      />
    </label>
  );
}

/** Left: who's signed up and the prices. */
function SettingsCard({ s, bare = false }: { s: Sim; bare?: boolean }) {
  const set = <K extends keyof SimParams>(k: K, v: SimParams[K]) =>
    s.setParams((p) => ({ ...p, [k]: v }));
  return (
    <article className={bare ? "" : `${card} absolute top-[68px] left-6 w-[290px]`}>
      <div className="px-2 pt-2">
        <p className={label}>
          <Users size={12} /> Who computes on your rack
        </p>
      </div>
      <ul className="mt-1.5">
        {NEIGHBOURS.map((n, i) => {
          const on = s.params.signed[i] ?? false;
          const Icon = n.icon;
          return (
            <li key={n.id}>
              <button
                onClick={() => s.toggle(i)}
                className={`flex w-full items-center gap-2 rounded-2xl px-2 text-left hover:bg-white/[0.05] ${bare ? "min-h-11" : "py-1.5"}`}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full"
                  style={{ background: on ? n.color : "rgb(255 255 255 / 0.08)" }}
                >
                  <Icon size={12} />
                </span>
                <span className={`min-w-0 flex-1 ${on ? "" : "opacity-45"}`}>
                  <span className="block truncate text-[11.5px] font-medium">{n.name}</span>
                  <span className="block text-[10px] text-white/50">
                    {n.plans[1].name} · CHF {n.plans[1].price}/mo
                  </span>
                </span>
                <span className="text-[10.5px] text-white/50 tabular-nums">
                  {on ? `⌀ ${averageKw(i).toFixed(1)} kW` : ""}
                </span>
                {/* Switch */}
                <span
                  className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "" : "bg-white/15"}`}
                  style={on ? { background: CYAN } : undefined}
                >
                  <span
                    className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-1.5 border-t border-white/[0.08] pt-1.5">
        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full"
            style={{ background: REMOTE_COLOR }}
          >
            <Globe2 size={12} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] font-medium">From far away</span>
            <span className="block text-[10px] text-white/50">Batch jobs from outside Basel</span>
          </span>
          <span className="text-[10.5px] text-white/50 tabular-nums">
            ⌀ {s.view.remote.toFixed(1)} kW
          </span>
        </div>
        <Slider
          name="Demand"
          value={s.params.remote}
          min={0}
          max={s.params.rackKw}
          step={0.5}
          unit="kW"
          scale={1}
          accent="accent-forest-500"
          onChange={(v) => set("remote", v)}
        />
      </div>

      <div className="mt-1.5 border-t border-white/[0.08] pt-1.5 pb-1">
        <p className={`${label} px-2 pb-0.5`}>
          <SlidersHorizontal size={12} /> Prices
        </p>
        <Slider
          name="Electricity"
          value={s.params.power}
          min={0.12}
          max={0.45}
          step={0.01}
          unit="Rp/kWh"
          onChange={(v) => set("power", v)}
        />
        <Slider
          name="Batch jobs pay"
          value={s.params.batch}
          min={0.15}
          max={0.6}
          step={0.01}
          unit="Rp/kWh"
          onChange={(v) => set("batch", v)}
        />
        <Slider
          name="Heat would cost"
          value={s.params.heat}
          min={0.06}
          max={0.3}
          step={0.01}
          unit="Rp/kWh"
          onChange={(v) => set("heat", v)}
        />
      </div>
    </article>
  );
}

/** Bottom right: net earnings month by month; click a month to simulate it. */
function YearCard({ s, bare = false }: { s: Sim; bare?: boolean }) {
  const max = Math.max(1, ...s.year.map((m) => Math.abs(m.net)));
  return (
    <article className={bare ? "" : `${card} mt-auto`} style={{ animationDelay: "150ms" }}>
      <div className="px-2 pt-2 pb-1.5">
        <p className={label}>
          <Coins size={12} /> Your year, month by month
        </p>
        <div className="mt-3 flex h-24 items-stretch gap-1">
          {s.year.map((m, i) => {
            const h = (Math.abs(m.net) / max) * 50;
            const up = m.net >= 0;
            return (
              <button
                key={MONTHS[i]?.name}
                onClick={() => s.setMonth(i)}
                title={`${MONTHS[i]?.name}: ${chf(m.net)}`}
                className="group flex flex-1 flex-col items-center"
              >
                {/* Positive above the middle line, negative below */}
                <span className="flex w-full flex-1 items-end">
                  {up && (
                    <span
                      className="w-full rounded-t-[3px] transition-[height] duration-500"
                      style={{
                        height: `${(h / 50) * 100}%`,
                        background: CYAN,
                        opacity: i === s.month ? 1 : 0.45,
                      }}
                    />
                  )}
                </span>
                <span className="h-px w-full bg-white/20" />
                <span className="flex h-[30%] w-full items-start">
                  {!up && (
                    <span
                      className="w-full rounded-b-[3px] bg-rose-500 transition-[height] duration-500"
                      style={{
                        height: `${Math.min(100, (h / 15) * 100)}%`,
                        opacity: i === s.month ? 1 : 0.55,
                      }}
                    />
                  )}
                </span>
                <span
                  className={`mt-0.5 text-[9px] font-semibold ${i === s.month ? "text-white" : "text-white/40 group-hover:text-white/70"}`}
                >
                  {MONTHS[i]?.name[0]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-white/50">
          Winter pays: every kWh of computing heats the house. In summer the heat is vented.
        </p>
      </div>
    </article>
  );
}

function Row({ k, v, tone }: { k: ReactNode; v: number; tone?: "plus" | "minus" }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="text-white/60">{k}</span>
      <span
        className={`font-semibold tabular-nums ${tone === "minus" ? "text-rose-400" : tone === "plus" ? "text-emerald-400" : ""}`}
      >
        {tone === "minus" ? "− " : tone === "plus" ? "+ " : ""}
        {chf(Math.abs(v))}
      </span>
    </div>
  );
}

/** Right top: what it all earns, for the year and the simulated month. */
function EarningsCard({ s, bare = false }: { s: Sim; bare?: boolean }) {
  const total = s.year.reduce((sum, m) => sum + m.net, 0);
  const shown = useGlide(total);
  const m = s.year[s.month];
  const monthName = MONTHS[s.month]?.name ?? "";
  const perDay = (m?.net ?? 0) / (MONTHS[s.month]?.days ?? 30);
  if (!m) return null;
  return (
    <article className={bare ? "" : card} style={{ animationDelay: "250ms" }}>
      <div className="px-2 pt-2 pb-1.5">
        <p className={label}>
          <Coins size={12} /> What your rack earns
        </p>
        <p className="mt-1.5 text-[30px] leading-none font-semibold tracking-tight tabular-nums">
          {chf(shown)}
          <span className="ml-1.5 text-[12px] font-medium text-white/50">a year</span>
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          A day in {monthName} ·{" "}
          <span className="font-semibold text-white tabular-nums">CHF {perDay.toFixed(2)}</span>
        </p>

        <div className="mt-3 space-y-1.5 rounded-2xl bg-white/[0.05] px-2.5 py-2">
          <p className="text-[10.5px] font-semibold text-white/70">
            {monthName} · {WEATHER[s.weather].label}
          </p>
          <Row k="Neighbours" v={m.subscriptions} tone="plus" />
          <Row k="Batch jobs from far away" v={m.batch} tone="plus" />
          <Row k="Kachel's cut" v={m.fee} tone="minus" />
          <Row k="Heat you don't buy" v={m.heatSaved} tone="plus" />
          <Row k="Electricity" v={m.power} tone="minus" />
          <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[12.5px] font-semibold">
            <span>This month</span>
            <span className={`tabular-nums ${m.net < 0 ? "text-rose-400" : ""}`}>{chf(m.net)}</span>
          </div>
        </div>

        <div className="mt-2.5 px-0.5">
          <div className="flex justify-between text-[10.5px] text-white/55">
            <span>House heated by computing</span>
            <span className="font-semibold text-white tabular-nums">
              {Math.round(m.coverage * 100)} %
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-clay transition-[width] duration-500"
              style={{ width: `${m.coverage * 100}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Pressing "a" over the neighbours: a what-if over the whole block. Pick a month and the
 * weather, sign neighbours up or out, and watch what the rack earns.
 */
export function SimulationView({
  s,
  onBack,
  onNext,
}: {
  s: Sim;
  onBack: () => void;
  /** The "a" key's step, as a button on a phone: on to the other side, the buyer's. */
  onNext: () => void;
}) {
  const compact = useCompact();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (compact)
    return (
      <div className="pointer-events-none absolute inset-0 font-sans">
        <div className="absolute inset-x-3 flex justify-center" style={COMPACT_TOP}>
          <WeatherBar s={s} compact />
        </div>
        <Sheet
          tabs={[
            { id: "earnings", label: "Earnings", body: <EarningsCard s={s} bare /> },
            { id: "year", label: "Year", body: <YearCard s={s} bare /> },
            { id: "rack", label: "Who", body: <SettingsCard s={s} bare /> },
          ]}
          back={{ label: "Back to the neighbours", onClick: onBack }}
          action={{ label: "Rent a house to compute in", onClick: onNext }}
        />
      </div>
    );

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      <button
        onClick={onBack}
        className="pointer-events-auto absolute top-6 left-6 flex animate-pill-in items-center gap-1.5 rounded-full border border-white/10 bg-[#1b1d21]/85 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:text-clay"
      >
        <ArrowLeft size={14} /> Back to the neighbours
      </button>
      <div className="absolute inset-x-0 top-6 flex justify-center">
        <WeatherBar s={s} />
      </div>
      <SettingsCard s={s} />
      <div className="absolute top-6 right-6 bottom-6 flex w-[300px] flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <EarningsCard s={s} />
        <YearCard s={s} />
      </div>
    </div>
  );
}
