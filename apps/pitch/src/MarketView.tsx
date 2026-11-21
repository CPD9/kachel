import {
  ArrowLeft,
  ArrowRight,
  Cable,
  Check,
  Cpu,
  MemoryStick,
  Radio,
  Snowflake,
  Sparkles,
  Star,
  Timer,
  Zap,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  FLEX_DISCOUNT,
  GPU_COUNTS,
  MAX_JOB_HOURS,
  HEAT_LABEL,
  type HeatNeed,
  type Needs,
  needsFor,
  type Quote,
  quotes,
  RAM_STEPS,
  type Sort,
  VRAM_STEPS,
  WORKLOADS,
  type Workload,
} from "./market";
import { distanceFromHome } from "./neighbours";
import { REMOTE_COLOR } from "./simulation";
import { card, label } from "./ui";

const VIOLET = REMOTE_COLOR;
const HEAT_COLOR: Record<HeatNeed, string> = { high: "#f97316", medium: "#fbbf24", low: "#64748b" };

const chf = (x: number) =>
  `CHF ${x >= 100 ? Math.round(x).toLocaleString("de-CH") : x.toFixed(x < 10 ? 2 : 0)}`;

/** What the map needs to show the houses. */
export type MarketPin = {
  id: string;
  at: [number, number];
  emoji: string;
  price: string;
  fit: boolean;
};

/** The buyer's side: what they want to run, and which house it runs in. Kept in App for the map. */
export function useMarket() {
  const [page, setPage] = useState<"setup" | "houses" | null>(null);
  const [needs, setNeeds] = useState<Needs>(() => needsFor("render", true));
  const [sort, setSort] = useState<Sort>("match");
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => quotes(needs, sort), [needs, sort]);
  const fits = list.filter((q) => !q.miss);
  // Picking keeps its house while it still fits, otherwise the best one
  const current = list.find((q) => q.offer.id === picked && !q.miss) ?? fits[0] ?? list[0] ?? null;
  const pins: MarketPin[] = list.map((q) => ({
    id: q.offer.id,
    at: q.offer.at,
    emoji: q.offer.emoji,
    price: `${chf(q.perHour)}/h`,
    fit: !q.miss,
  }));
  const open = useCallback(() => setPage("setup"), []);
  const close = useCallback(() => setPage(null), []);
  const toHouses = useCallback(() => {
    setPicked(null);
    setPage("houses");
  }, []);
  const toSetup = useCallback(() => setPage("setup"), []);
  return {
    page,
    open,
    close,
    toHouses,
    toSetup,
    needs,
    setNeeds,
    sort,
    setSort,
    list,
    fits,
    current,
    pick: setPicked,
    pins,
  };
}
export type Market = ReturnType<typeof useMarket>;

function useKey(handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler]);
}

/** ① What you run ── ② Pick a house */
function Steps({ at }: { at: 1 | 2 }) {
  const step = (n: 1 | 2, text: string) => (
    <span
      className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${at >= n ? "text-white" : "text-white/40"}`}
    >
      <span
        className="grid size-5 place-items-center rounded-full text-[10px]"
        style={{ background: at >= n ? VIOLET : "rgb(255 255 255 / 0.1)" }}
      >
        {at > n ? <Check size={11} strokeWidth={3} /> : n}
      </span>
      {text}
    </span>
  );
  return (
    <div className="pointer-events-auto flex animate-pill-in items-center gap-2.5 rounded-full border border-white/10 bg-[#1b1d21]/85 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {step(1, "What you run")}
      <span className="h-px w-6 bg-white/20" />
      {step(2, "Pick a house")}
    </div>
  );
}

function Chips<T extends number>({
  options,
  value,
  format,
  onChange,
}: {
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-white/[0.06] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 rounded-full px-1 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors ${
            o === value ? "text-white" : "text-white/50 hover:text-white"
          }`}
          style={o === value ? { background: VIOLET } : undefined}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

function Field({
  name,
  value,
  children,
}: {
  name: string;
  value?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex justify-between text-[11px]">
        <span className="text-white/60">{name}</span>
        {value && <span className="font-semibold tabular-nums">{value}</span>}
      </p>
      {children}
    </div>
  );
}

function Toggle({
  on,
  icon,
  title,
  note,
  onChange,
}: {
  on: boolean;
  icon: ReactNode;
  title: string;
  note: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition-colors ${
        on ? "border-white/15 bg-white/[0.07]" : "border-white/[0.06] hover:bg-white/[0.04]"
      }`}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full"
        style={{ background: on ? VIOLET : "rgb(255 255 255 / 0.08)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold">{title}</span>
        <span className="block text-[10.5px] text-white/50">{note}</span>
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "" : "bg-white/15"}`}
        style={on ? { background: VIOLET } : undefined}
      >
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

/** Page 1: what they want to run. The houses that fit light up on the map behind as they go. */
export function MarketSetup({ m, onBack }: { m: Market; onBack: () => void }) {
  const { needs, setNeeds, fits } = m;
  const set = (patch: Partial<Needs>) => setNeeds((n) => ({ ...n, ...patch }));
  const cheapest = fits.length ? Math.min(...fits.map((q) => q.total)) : null;
  const best = fits[0];
  useKey((e) => {
    if (e.key === "Escape") onBack();
    if (e.key.toLowerCase() === "a" && fits.length) m.toHouses();
  });

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {/* Dim the map a little, the houses stay visible behind */}
      <div className="absolute inset-0 animate-card-in bg-gradient-to-b from-black/55 via-black/25 to-black/55" />
      <button
        onClick={onBack}
        className="pointer-events-auto absolute top-6 left-6 flex animate-pill-in items-center gap-1.5 rounded-full border border-white/10 bg-[#1b1d21]/85 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:text-clay"
      >
        <ArrowLeft size={14} /> Back to the simulation
      </button>
      <div className="absolute inset-x-0 top-6 flex justify-center">
        <Steps at={1} />
      </div>

      <div className="absolute inset-x-0 top-[72px] bottom-28 flex items-center justify-center px-6">
        <article className={`${card} flex max-h-full w-[880px] gap-2 overflow-hidden`}>
          {/* Left: the workload and what it needs */}
          <div className="min-w-0 flex-1 overflow-y-auto px-3 pt-3 pb-2 [scrollbar-width:none]">
            <p className={label} style={{ color: VIOLET }}>
              <Sparkles size={12} /> Kachel Compute
            </p>
            <h2 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight">
              What do you want to run?
            </h2>
            <p className="mt-0.5 text-[12px] text-white/55">
              It runs in a house in Basel, and its heat warms the people who live there.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {(Object.keys(WORKLOADS) as Workload[]).map((w) => {
                const { icon: Icon, name, note } = WORKLOADS[w];
                const on = needs.workload === w;
                return (
                  <button
                    key={w}
                    onClick={() => setNeeds(needsFor(w, needs.flex, needs.once))}
                    className={`flex items-start gap-2 rounded-2xl border p-2.5 text-left transition-all ${
                      on
                        ? "border-transparent text-white"
                        : "border-white/[0.07] bg-white/[0.03] text-white/80 hover:bg-white/[0.07]"
                    }`}
                    style={
                      on
                        ? {
                            background: `linear-gradient(135deg, ${VIOLET}, #4c1d95)`,
                            boxShadow: `0 8px 24px -8px ${VIOLET}`,
                          }
                        : undefined
                    }
                  >
                    <Icon size={18} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold">{name}</span>
                      <span className="block text-[10.5px] opacity-65">{note}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field name="GPUs at once">
                <Chips
                  options={GPU_COUNTS}
                  value={needs.gpus as (typeof GPU_COUNTS)[number]}
                  format={(v) => (v === 0 ? "None" : `${v}×`)}
                  onChange={(gpus) => set({ gpus, vram: gpus === 0 ? 0 : needs.vram || 16 })}
                />
              </Field>
              <Field name="Memory per GPU" value={needs.gpus ? `${needs.vram} GB` : undefined}>
                {needs.gpus === 0 ? (
                  <p className="rounded-full bg-white/[0.04] py-1 text-center text-[11px] text-white/40">
                    Runs on CPUs
                  </p>
                ) : (
                  <Chips
                    options={VRAM_STEPS}
                    value={(needs.vram || 16) as (typeof VRAM_STEPS)[number]}
                    format={(v) => `${v}`}
                    onChange={(vram) => set({ vram })}
                  />
                )}
              </Field>
              <Field name="RAM" value={`${needs.ram} GB`}>
                <input
                  type="range"
                  min={0}
                  max={RAM_STEPS.length - 1}
                  value={Math.max(0, RAM_STEPS.indexOf(needs.ram as (typeof RAM_STEPS)[number]))}
                  onChange={(e) => set({ ram: RAM_STEPS[Number(e.target.value)] ?? 16 })}
                  className="h-1 w-full cursor-pointer accent-violet-500"
                />
              </Field>
              <div>
                {/* Every month or a single job: the slider is hours a month, or how long it runs */}
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <div className="flex gap-0.5 rounded-full bg-white/[0.06] p-0.5">
                    {(
                      [
                        [false, "Every month"],
                        [true, "One-time"],
                      ] as const
                    ).map(([once, text]) => (
                      <button
                        key={text}
                        onClick={() =>
                          setNeeds((n) =>
                            n.once === once
                              ? n
                              : { ...n, once, hours: needsFor(n.workload, n.flex, once).hours },
                          )
                        }
                        className={`rounded-full px-2 py-px text-[10.5px] font-semibold transition-colors ${
                          needs.once === once ? "text-white" : "text-white/50 hover:text-white"
                        }`}
                        style={needs.once === once ? { background: VIOLET } : undefined}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <span className="font-semibold tabular-nums">
                    {needs.hours} h{needs.once ? " once" : " a month"}
                  </span>
                </div>
                <input
                  type="range"
                  min={needs.once ? 1 : 10}
                  max={needs.once ? MAX_JOB_HOURS : 720}
                  step={needs.once ? 1 : 10}
                  value={needs.hours}
                  onChange={(e) => set({ hours: Number(e.target.value) })}
                  className="h-1 w-full cursor-pointer accent-violet-500"
                />
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-1.5">
              <Toggle
                on={needs.interactive}
                icon={<Radio size={13} />}
                title="Someone's waiting"
                note="Free right now, ≈ 2 ms away"
                onChange={(interactive) => set({ interactive })}
              />
              <Toggle
                on={needs.flex}
                icon={<Snowflake size={13} />}
                title="Heat-flex"
                note={`Runs when it's cold · up to −${FLEX_DISCOUNT.high * 100} %`}
                onChange={(flex) => set({ flex })}
              />
            </div>
          </div>

          {/* Right: the houses that fit, live */}
          <aside className="flex w-[270px] shrink-0 flex-col rounded-[20px] bg-white/[0.05] p-3">
            <p className={label}>Houses that fit</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span
                key={fits.length}
                className="animate-pill-in text-[44px] leading-none font-semibold tabular-nums"
                style={{ color: fits.length ? "white" : "#fb7185" }}
              >
                {fits.length}
              </span>
              <span className="text-[12px] text-white/55">of {m.list.length} in Basel</span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {m.list.map((q) => (
                <span
                  key={q.offer.id}
                  title={`${q.offer.address}${q.miss ? ` · ${q.miss}` : ""}`}
                  className={`grid size-8 place-items-center rounded-full text-[15px] transition-all duration-300 ${
                    q.miss ? "scale-90 opacity-25 grayscale" : ""
                  }`}
                  style={{ background: q.miss ? "rgb(255 255 255 / 0.06)" : `${VIOLET}40` }}
                >
                  {q.offer.emoji}
                </span>
              ))}
            </div>

            <dl className="mt-4 space-y-2 text-[11.5px]">
              <div className="flex justify-between">
                <dt className="text-white/55">From</dt>
                <dd className="font-semibold tabular-nums">
                  {cheapest === null
                    ? "–"
                    : `${chf(cheapest)} ${needs.once ? "for the job" : "a month"}`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/55">Best match</dt>
                <dd className="truncate pl-2 font-semibold">
                  {best && !best.miss ? `${best.offer.emoji} ${best.offer.area}` : "–"}
                </dd>
              </div>
            </dl>

            <button
              onClick={m.toHouses}
              disabled={!fits.length}
              className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: VIOLET }}
            >
              {fits.length ? (
                <>
                  Find my house <ArrowRight size={15} />
                </>
              ) : (
                "Nothing fits, ask for less"
              )}
            </button>
          </aside>
        </article>
      </div>
    </div>
  );
}

function HeatBadge({ heat }: { heat: HeatNeed }) {
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-semibold"
      style={{ color: HEAT_COLOR[heat] }}
    >
      <span
        className={`size-1.5 rounded-full ${heat === "high" ? "animate-pulse" : ""}`}
        style={{ background: HEAT_COLOR[heat] }}
      />
      {HEAT_LABEL[heat]}
    </span>
  );
}

function gpuText(q: Quote, n: Needs) {
  const g = q.offer.gpu;
  if (!g) return q.offer.cpu;
  return `${n.gpus > 0 ? Math.min(n.gpus, g.count) : 0}/${g.count}× ${g.name}`;
}

/** One house in the list on the left. */
function HouseRow({ q, on, onPick }: { q: Quote; on: boolean; onPick: () => void }) {
  const o = q.offer;
  return (
    <button
      onClick={onPick}
      disabled={!!q.miss}
      className={`flex w-full items-center gap-2.5 rounded-2xl border p-2 text-left transition-all ${
        on
          ? "border-white/20 bg-white/[0.1]"
          : q.miss
            ? "border-transparent opacity-40"
            : "border-transparent hover:bg-white/[0.05]"
      }`}
      style={on ? { boxShadow: `inset 3px 0 0 ${VIOLET}` } : undefined}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl text-[20px]"
        style={{ background: q.miss ? "rgb(255 255 255 / 0.06)" : `${VIOLET}33` }}
      >
        {o.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold">
          <span className="truncate">{o.area}</span>
          {o.home && (
            <span className="rounded-full bg-clay px-1.5 text-[9px] font-bold text-white">
              START
            </span>
          )}
        </span>
        <span className="block truncate text-[10.5px] text-white/50">{o.host}</span>
        {q.miss ? (
          <span className="block text-[10px] font-semibold text-rose-400">{q.miss}</span>
        ) : (
          <HeatBadge heat={o.heat} />
        )}
      </span>
      {!q.miss && (
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-semibold tabular-nums">{chf(q.total)}</span>
          <span className="block text-[10px] text-white/45 tabular-nums">{chf(q.perHour)}/h</span>
        </span>
      )}
    </button>
  );
}

/** Page 2: the houses on the map, a list on the left and the picked one on the right. */
export function MarketHouses({ m }: { m: Market }) {
  const { needs, current: q } = m;
  const [booked, setBooked] = useState<string | null>(null);
  useKey((e) => {
    if (e.key === "Escape") m.toSetup();
  });
  const w = WORKLOADS[needs.workload];
  const WIcon = w.icon;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      <button
        onClick={m.toSetup}
        className="pointer-events-auto absolute top-6 left-6 flex animate-pill-in items-center gap-1.5 rounded-full border border-white/10 bg-[#1b1d21]/85 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:text-clay"
      >
        <ArrowLeft size={14} /> Change what you run
      </button>
      <div className="absolute inset-x-0 top-6 flex flex-col items-center gap-2">
        <Steps at={2} />
        {/* What they asked for, as a reminder */}
        <div className="flex animate-pill-in items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/75 backdrop-blur-md">
          <WIcon size={12} style={{ color: VIOLET }} /> {w.name}
          <span className="text-white/30">·</span>
          {needs.gpus ? `${needs.gpus}× GPU · ${needs.vram} GB` : "CPU only"}
          <span className="text-white/30">·</span>
          {needs.ram} GB RAM
          <span className="text-white/30">·</span>
          {needs.once ? `One-time · ${needs.hours} h` : `${needs.hours} h/mo`}
          {needs.flex && (
            <>
              <span className="text-white/30">·</span>
              <Snowflake size={11} className="text-sky-300" /> Heat-flex
            </>
          )}
        </div>
      </div>

      {/* Left: every house, the ones that fit first */}
      <article
        className={`${card} absolute top-[68px] bottom-6 left-6 flex w-[320px] flex-col`}
        style={{ animationDelay: "100ms" }}
      >
        <div className="px-2 pt-2">
          <p className={label}>
            {m.fits.length} houses fit · {m.list.length - m.fits.length} don't
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-white/[0.06] p-0.5">
            {(
              [
                ["match", "Best match"],
                ["price", "Cheapest"],
                ["heat", "Coldest"],
              ] as const
            ).map(([s, text]) => (
              <button
                key={s}
                onClick={() => m.setSort(s)}
                className={`rounded-full py-1 text-[11px] font-semibold transition-colors ${
                  m.sort === s ? "text-white" : "text-white/50 hover:text-white"
                }`}
                style={m.sort === s ? { background: VIOLET } : undefined}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:none]">
          {m.list.map((x) => (
            <li key={x.offer.id}>
              <HouseRow q={x} on={x.offer.id === q?.offer.id} onPick={() => m.pick(x.offer.id)} />
            </li>
          ))}
        </ul>
      </article>

      {/* Right: the picked house */}
      {q && !q.miss && (
        <div className="absolute top-6 right-6 bottom-6 flex w-[310px] flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
          <article key={q.offer.id} className={card} style={{ animationDelay: "200ms" }}>
            <div
              className="relative h-28 overflow-hidden rounded-[20px]"
              style={{
                background: `radial-gradient(90% 130% at 80% 100%, ${HEAT_COLOR[q.offer.heat]}aa, transparent 60%), radial-gradient(90% 120% at 10% 0%, ${VIOLET}, #120a24 70%)`,
              }}
            >
              <span className="absolute right-5 bottom-2 text-[56px] drop-shadow-[0_6px_20px_rgba(0,0,0,0.5)]">
                {q.offer.emoji}
              </span>
              <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                <span
                  className={`size-1.5 rounded-full ${q.offer.freeFrom ? "bg-amber-500" : "animate-pulse bg-emerald-500"}`}
                />
                {q.offer.freeFrom ? `Free ${q.offer.freeFrom}` : "Free now"}
              </span>
              <span className="absolute bottom-2 left-3 flex items-center gap-1 text-[11px] font-semibold text-white/85">
                <Star size={11} className="fill-amber-300 text-amber-300" />{" "}
                {q.offer.rating.toFixed(1)}
              </span>
            </div>
            <div className="px-2 pt-3 pb-1.5">
              <HeatBadge heat={q.offer.heat} />
              <h3 className="mt-0.5 text-[17px] leading-tight font-semibold">{q.offer.address}</h3>
              <p className="text-[11.5px] text-white/55">
                {q.offer.area} · {q.offer.host}
              </p>

              <dl className="mt-3 space-y-1.5 text-[11.5px]">
                {[
                  { icon: Cpu, k: "Compute", v: gpuText(q, needs) },
                  {
                    icon: MemoryStick,
                    k: "Memory",
                    v: `${q.offer.gpu ? `${q.offer.gpu.vram} GB · ` : ""}${q.offer.ram} GB RAM`,
                  },
                  {
                    icon: Cable,
                    k: "Latency",
                    v: `≈ ${(1 + distanceFromHome(q.offer.at) / 2000).toFixed(0)} ms in Basel`,
                  },
                  { icon: Timer, k: "Runs", v: needs.flex ? "When the house is cold" : "Any time" },
                ].map(({ icon: Icon, k, v }) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className={`${label} shrink-0`}>
                      <Icon size={12} /> {k}
                    </dt>
                    <dd className="truncate text-right font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 rounded-2xl bg-white/[0.05] px-2.5 py-2">
                <div className="flex items-end justify-between">
                  <span className="text-[24px] leading-none font-semibold tabular-nums">
                    {chf(q.total)}
                  </span>
                  <span className="text-[11px] text-white/55">
                    {needs.once ? `once · ${needs.hours} h` : "a month"}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between text-[10.5px]">
                  <span className="text-white/45 line-through tabular-nums">
                    {chf(q.cloud)} in the cloud
                  </span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    −{Math.round((1 - q.total / q.cloud) * 100)} %
                  </span>
                </div>
                {q.discount > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[10.5px] text-sky-300">
                    <Snowflake size={10} /> Heat-flex saves {Math.round(q.discount * 100)} % here
                  </p>
                )}
              </div>

              <button
                onClick={() => setBooked(q.offer.id)}
                disabled={booked === q.offer.id}
                className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-white transition-colors ${
                  booked === q.offer.id ? "bg-emerald-600" : "hover:brightness-110"
                }`}
                style={booked === q.offer.id ? undefined : { background: VIOLET }}
              >
                {booked === q.offer.id ? (
                  <>
                    <Check size={16} strokeWidth={3} /> Booked · starts tonight
                  </>
                ) : (
                  <>
                    <Zap size={15} /> Run it here · {chf(q.total)}
                    {needs.once ? ` once` : `/mo`}
                  </>
                )}
              </button>
              {booked === q.offer.id && (
                <p className="mt-1.5 animate-card-in rounded-xl bg-black/40 px-2.5 py-1.5 font-mono text-[10.5px] text-white/75">
                  $ kachel run --at {q.offer.id}.bs.kachel.ch
                </p>
              )}
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
