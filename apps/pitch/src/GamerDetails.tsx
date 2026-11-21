import {
  ArrowLeft,
  Cable,
  Check,
  Clock,
  Cpu,
  Flame,
  Gamepad2,
  MapPin,
  Monitor,
  ShowerHead,
  Thermometer,
  Timer,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GAMER_COLOR } from "./Globe";
import { card, label } from "./ui";

/** The neighbour, hand-written demo data. */
const GAMER = {
  name: "Noah, 24",
  what: "Gamer & streamer",
  distance: "370 m from Byfangweg 18",
  facts: [
    { icon: Clock, k: "Plays", v: "≈ 4 h a night" },
    { icon: Monitor, k: "Setup today", v: "Gaming PC · 450 W" },
    { icon: Thermometer, k: "Room in summer", v: "29 °C with the PC on" },
  ],
  tags: ["4K · 120 fps", "Streams evenings", "Fibre 10 Gbit/s"],
};

/** Gaming plans on the rack at Byfangweg 18. */
const PLANS = [
  {
    id: "casual",
    name: "Casual",
    gpu: "Mid-range GPU",
    res: "1440p · 120 fps",
    hours: 40,
    price: 19,
    kw: 0.6,
  },
  {
    id: "pro",
    name: "Pro",
    gpu: "High-end GPU",
    res: "4K · 120 fps",
    hours: 120,
    price: 39,
    kw: 1,
  },
  {
    id: "stream",
    name: "Streamer",
    gpu: "2 GPUs + encoder",
    res: "4K · 144 fps + stream",
    hours: 160,
    price: 69,
    kw: 1.6,
  },
] as const;
type PlanId = (typeof PLANS)[number]["id"];

/** Tonight, hour by hour: how hard the GPU works (0–1). */
const TONIGHT = [
  { h: "18", load: 0.15 },
  { h: "19", load: 0.35 },
  { h: "20", load: 0.9 },
  { h: "21", load: 1 },
  { h: "22", load: 0.95 },
  { h: "23", load: 0.7 },
  { h: "00", load: 0.3 },
];
/** kWh of heat for one hot shower. */
const SHOWER_KWH = 2;
/** What a gaming PC like Noah's would cost, and its power a year. */
const PC_PRICE = 3200;
const PC_POWER_YEAR = 260;

const chf = (x: number) => `CHF ${Math.round(x).toLocaleString("de-CH")}`;

/**
 * Overlay once we've flown on to the gamer (like the mall in baselhack_2026_adobe): who lives
 * there, a gaming plan on the rack at Byfangweg 18, and how their evenings heat that house.
 */
export function GamerDetails({ onBack }: { onBack: () => void }) {
  const [planId, setPlanId] = useState<PlanId>("pro");
  const [booked, setBooked] = useState(false);
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[1];
  const heat = TONIGHT.reduce((sum, t) => sum + t.load * plan.kw, 0);
  const showers = Math.max(1, Math.round(heat / SHOWER_KWH));
  const code = `KP-${(plan.price * 97 + 4021).toString().slice(-4)}`;

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
        <ArrowLeft size={14} /> Back to Byfangweg 18
      </button>

      {/* Bottom left: who lives here */}
      <article
        className={`${card} absolute bottom-6 left-6 w-[300px]`}
        style={{ animationDelay: "100ms" }}
      >
        <div
          className="relative h-28 overflow-hidden rounded-[20px]"
          style={{
            background: `radial-gradient(90% 120% at 20% 100%, ${GAMER_COLOR}, #1b1530 55%, #0d0b14)`,
          }}
        >
          {/* A simple glowing desk setup: monitor, keyboard, the light under it */}
          <div className="absolute right-6 bottom-5 flex flex-col items-center">
            <div className="h-12 w-20 rounded-md border-2 border-white/25 bg-gradient-to-br from-fuchsia-500/60 to-sky-500/50 shadow-[0_0_30px_rgba(139,92,246,0.8)]" />
            <div className="h-2 w-1.5 bg-white/25" />
            <div className="h-1.5 w-24 rounded-full bg-white/15 shadow-[0_0_14px_rgba(56,189,248,0.7)]" />
          </div>
          <Gamepad2 size={34} className="absolute top-4 left-4 text-white/85" />
          <span className="absolute bottom-2 left-3 text-[11px] font-semibold text-white/80">
            Online · in a match
          </span>
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
          </span>
        </div>
        <div className="px-2 pt-3 pb-1.5">
          <p className={label} style={{ color: GAMER_COLOR }}>
            <MapPin size={11} /> Your neighbour
          </p>
          <h3 className="mt-1 text-[17px] leading-tight font-semibold">{GAMER.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-white/55">
            {GAMER.what} · {GAMER.distance}
          </p>
          <dl className="mt-3 space-y-1.5 text-[11.5px]">
            {GAMER.facts.map(({ icon: Icon, k, v }) => (
              <div key={k} className="flex items-center justify-between">
                <dt className={label}>
                  <Icon size={12} /> {k}
                </dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {GAMER.tags.map((t) => (
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

      {/* Right column: the plan on top, tonight's heat below */}
      <div className="absolute top-6 right-6 bottom-6 flex w-[300px] flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <article className={card} style={{ animationDelay: "250ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <p className={label}>
              <Cpu size={12} /> Kachel Play · gaming on the rack
            </p>
            <div className="mt-1.5 flex items-end justify-between">
              <div>
                <h3 className="text-[19px] leading-tight font-semibold">{plan.gpu}</h3>
                <p className="text-[11.5px] text-white/55">{plan.res}</p>
              </div>
              <span className="text-right text-[11px] text-white/55">
                <span className="block text-base font-semibold text-white tabular-nums">
                  CHF {plan.price}
                </span>
                a month
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/[0.08] p-0.5">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPlanId(p.id);
                    setBooked(false);
                  }}
                  className={`rounded-full py-1 text-[11px] font-semibold transition-colors ${
                    p.id === planId ? "text-white" : "text-white/55 hover:text-white"
                  }`}
                  style={p.id === planId ? { background: GAMER_COLOR } : undefined}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <dl className="mt-3 space-y-1.5 text-[11.5px]">
              {[
                { icon: Cable, k: "Latency", v: "≈ 2 ms · same street fibre" },
                { icon: Timer, k: "Included", v: `${plan.hours} h a month` },
                { icon: Zap, k: "Instead of", v: `${chf(PC_PRICE)} PC + ${chf(PC_POWER_YEAR)}/yr` },
              ].map(({ icon: Icon, k, v }) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <dt className={label}>
                    <Icon size={12} /> {k}
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
              style={booked ? undefined : { background: GAMER_COLOR }}
            >
              {booked ? (
                <>
                  <Check size={16} strokeWidth={3} /> Booked · code {code}
                </>
              ) : (
                <>
                  <Gamepad2 size={16} /> Play on the rack · CHF {plan.price}/mo
                </>
              )}
            </button>
            {booked && (
              <p className="mt-1.5 animate-card-in text-center text-[10.5px] text-white/55">
                Ready tonight from 18:00. Log in from any screen, no download.
              </p>
            )}
          </div>
        </article>

        <article className={card} style={{ animationDelay: "400ms" }}>
          <div className="px-2 pt-2 pb-1.5">
            <p className={label}>
              <Flame size={12} /> Tonight&apos;s games heat Byfangweg 18
            </p>

            {/* GPU load per hour: the same bars are heat for the house */}
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {TONIGHT.map(({ h, load }, i) => (
                <div key={h} className="flex h-full flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full origin-bottom animate-[grow-up_700ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-t-[3px] transition-[height] duration-300"
                      style={{
                        height: `${load * 100}%`,
                        background: `linear-gradient(${GAMER_COLOR}, #ea580c)`,
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
                <span className="size-2 rounded-sm" style={{ background: GAMER_COLOR }} /> GPU load
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-clay" /> becomes heat
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
                <Flame size={13} className="text-clay" />
                <p className="mt-1 text-[15px] font-semibold tabular-nums">{heat.toFixed(1)} kWh</p>
                <p className="text-[10.5px] text-white/55">heat tonight</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] px-2.5 py-2">
                <ShowerHead size={13} className="text-clay" />
                <p className="mt-1 text-[15px] font-semibold tabular-nums">{showers} showers</p>
                <p className="text-[10.5px] text-white/55">hot water next door</p>
              </div>
            </div>
            <p className="mt-2.5 rounded-xl bg-clay/15 px-2.5 py-1.5 text-[11px] font-medium text-clay">
              Noah&apos;s room stays cool and quiet. The heat lands in your hot water instead.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
