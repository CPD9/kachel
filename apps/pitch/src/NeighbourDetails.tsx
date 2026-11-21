import { TARGET } from "./target";
import {
  ArrowLeft,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Flame,
  MapPin,
  ShowerHead,
  Timer,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { distanceFromHome, NEIGHBOURS, type Neighbour } from "./neighbours";
import { card, label } from "./ui";

/** kWh of heat for one hot shower. */
const SHOWER_KWH = 2;

/**
 * The bar at the top to step through everyone near the house who could use its rack (like
 * SwitchBakery in bako): ‹ 2 / 5 · Lena, 31 · Architect › . Arrow keys work too.
 */
export function NeighbourSwitch({ i, onSwitch }: { i: number; onSwitch: (i: number) => void }) {
  const total = NEIGHBOURS.length;
  const n = NEIGHBOURS[i];
  const prev = () => onSwitch((i - 1 + total) % total);
  const next = () => onSwitch((i + 1) % total);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") onSwitch((i - 1 + total) % total);
      if (e.key === "ArrowRight") onSwitch((i + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, total, onSwitch]);

  if (!n) return null;
  const Icon = n.icon;
  const arrow =
    "grid size-9 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white";
  return (
    <div className="pointer-events-auto flex animate-pill-in flex-col items-center gap-2">
      <div className="flex items-center rounded-full border border-white/10 bg-[#1b1d21]/85 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <button onClick={prev} className={arrow} aria-label="Previous neighbour">
          <ChevronLeft size={16} />
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <div key={n.id} className="flex min-w-[220px] animate-card-in items-center gap-2.5 px-3">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full text-white"
            style={{ background: n.color }}
          >
            <Icon size={14} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-widest uppercase">
              <span style={{ color: n.color }}>Could use your rack</span>
              <span className="text-white/30 tabular-nums">
                {i + 1}/{total}
              </span>
            </span>
            <span className="block text-sm leading-tight font-semibold whitespace-nowrap text-white">
              {n.name} <span className="font-normal text-white/50">· {n.what}</span>
            </span>
          </span>
        </div>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button onClick={next} className={arrow} aria-label="Next neighbour">
          <ChevronRight size={16} />
        </button>
      </div>
      {/* One dot per neighbour */}
      <div className="flex gap-1.5">
        {NEIGHBOURS.map((m, j) => (
          <button
            key={m.id}
            onClick={() => onSwitch(j)}
            aria-label={m.name}
            className={`h-1.5 rounded-full transition-all ${j === i ? "w-5" : "w-1.5 bg-white/30 hover:bg-white/60"}`}
            style={j === i ? { background: m.color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Overlay once we've flown on to a neighbour (like the mall in baselhack_2026_adobe): who they
 * are, a plan on the rack at Byfangweg 18, and how their usage heats that house. Keyed by
 * neighbour, so the picked plan resets on switching.
 */
export function NeighbourDetails({ n, onBack }: { n: Neighbour; onBack: () => void }) {
  const [planId, setPlanId] = useState(n.plans[1].id);
  const [booked, setBooked] = useState(false);
  const plan = n.plans.find((p) => p.id === planId) ?? n.plans[1];
  const heat = n.load.reduce((sum, t) => sum + t.v * plan.kw, 0);
  const showers = Math.max(1, Math.round(heat / SHOWER_KWH));
  const code = `KP-${(plan.price * 97 + 4021).toString().slice(-4)}`;
  const Icon = n.icon;
  const metres = distanceFromHome(n.at);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {/* Top left: back to the house */}
      <button
        onClick={onBack}
        className="pointer-events-auto absolute top-6 left-6 flex animate-pill-in items-center gap-1.5 rounded-full border border-white/10 bg-[#1b1d21]/85 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:text-clay"
      >
        <ArrowLeft size={14} /> Back to {TARGET.name}
      </button>

      {/* Bottom left: who they are */}
      <article
        className={`${card} absolute bottom-6 left-6 w-[300px]`}
        style={{ animationDelay: "100ms" }}
      >
        <div
          className="relative h-28 overflow-hidden rounded-[20px]"
          style={{
            background: `radial-gradient(90% 120% at 20% 100%, ${n.color}, #15151c 55%, #0b0b10)`,
          }}
        >
          {/* A simple glowing desk setup: screen, stand, the light under it */}
          <div className="absolute right-6 bottom-5 flex flex-col items-center">
            <div
              className="h-12 w-20 rounded-md border-2 border-white/25"
              style={{
                background: `linear-gradient(135deg, ${n.color}cc, #0ea5e980)`,
                boxShadow: `0 0 30px ${n.color}`,
              }}
            />
            <div className="h-2 w-1.5 bg-white/25" />
            <div className="h-1.5 w-24 rounded-full bg-white/15" />
          </div>
          <Icon size={32} className="absolute top-4 left-4 text-white/85" />
          <span className="absolute bottom-2 left-3 text-[11px] font-semibold text-white/80">
            {n.status}
          </span>
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
          </span>
        </div>
        <div className="px-2 pt-3 pb-1.5">
          <p className={label} style={{ color: n.color }}>
            <MapPin size={11} /> Your neighbour
          </p>
          <h3 className="mt-1 text-[17px] leading-tight font-semibold">{n.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-white/55">
            {n.what} · {metres} m from {TARGET.name}
          </p>
          <dl className="mt-3 space-y-1.5 text-[11.5px]">
            {n.facts.map(({ icon: FactIcon, k, v }) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className={`${label} shrink-0`}>
                  <FactIcon size={12} /> {k}
                </dt>
                <dd className="text-right font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {n.tags.map((t) => (
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

      {/* Right column: the plan on top, the heat it makes at the bottom */}
      <div className="absolute top-6 right-6 bottom-6 flex w-[300px] flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <article className={card} style={{ animationDelay: "250ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <p className={label}>
              <Cpu size={12} /> {n.service}
            </p>
            <div className="mt-1.5 flex items-end justify-between">
              <div>
                <h3 className="text-[19px] leading-tight font-semibold">{plan.spec}</h3>
                <p className="text-[11.5px] text-white/55">{plan.detail}</p>
              </div>
              <span className="text-right text-[11px] text-white/55">
                <span className="block text-base font-semibold text-white tabular-nums">
                  CHF {plan.price}
                </span>
                a month
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/[0.08] p-0.5">
              {n.plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPlanId(p.id);
                    setBooked(false);
                  }}
                  className={`rounded-full py-1 text-[11px] font-semibold transition-colors ${
                    p.id === planId ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                  style={p.id === planId ? { background: n.color } : undefined}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <dl className="mt-3 space-y-1.5 text-[11.5px]">
              {[
                { icon: Cable, k: "Latency", v: `≈ 2 ms · ${metres} m of fibre` },
                {
                  icon: Timer,
                  k: "Included",
                  v: plan.hours >= 720 ? "Always on" : `${plan.hours} h a month`,
                },
                { icon: Zap, k: "Instead of", v: n.instead },
              ].map(({ icon: RowIcon, k, v }) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <dt className={`${label} shrink-0`}>
                    <RowIcon size={12} /> {k}
                  </dt>
                  <dd className="text-right font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            <button
              onClick={() => setBooked(true)}
              disabled={booked}
              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-white transition-colors ${
                booked ? "bg-emerald-600" : "hover:brightness-110"
              }`}
              style={booked ? undefined : { background: n.color }}
            >
              {booked ? (
                <>
                  <Check size={16} strokeWidth={3} /> Booked · code {code}
                </>
              ) : (
                <>
                  <Icon size={16} /> Book {plan.name} · CHF {plan.price}/mo
                </>
              )}
            </button>
            {booked && (
              <p className="mt-1.5 animate-card-in text-center text-[10.5px] text-white/55">
                Ready from tonight. Log in from any screen, no download.
              </p>
            )}
          </div>
        </article>

        <article className={`${card} mt-auto`} style={{ animationDelay: "400ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <p className={label}>
              <Flame size={12} /> {n.heatTitle} heat {TARGET.name}
            </p>

            {/* Load per hour: the same bars are heat for the house */}
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {n.load.map(({ h, v }, i) => (
                <div key={h} className="flex h-full flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full origin-bottom animate-[grow-up_700ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-t-[3px]"
                      style={{
                        height: `${v * 100}%`,
                        background: `linear-gradient(${n.color}, #ea580c)`,
                        animationDelay: `${500 + i * 60}ms`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-semibold text-white/45">{h}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-white/55">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: n.color }} /> Compute load
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-clay" /> becomes heat
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
                <Flame size={13} className="text-clay" />
                <p className="mt-1 text-[15px] font-semibold tabular-nums">{heat.toFixed(1)} kWh</p>
                <p className="text-[10.5px] text-white/55">of heat</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
                <ShowerHead size={13} className="text-clay" />
                <p className="mt-1 text-[15px] font-semibold tabular-nums">
                  {showers} {showers === 1 ? "shower" : "showers"}
                </p>
                <p className="text-[10.5px] text-white/55">of hot water</p>
              </div>
            </div>
            <p className="mt-2.5 rounded-xl bg-clay/15 px-2.5 py-1.5 text-[11px] font-medium text-clay">
              {n.hint}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
