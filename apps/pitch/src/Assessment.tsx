import {
  ArrowLeft,
  CalendarRange,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Columns3,
  Droplet,
  Fan,
  Flame,
  Hand,
  Heater,
  Landmark,
  Layers,
  Leaf,
  PiggyBank,
  RotateCcw,
  Server,
  ShowerHead,
  SlidersHorizontal,
  Sparkles,
  Square,
  Timer,
  TrendingUp,
  Users,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import {
  type Answers,
  type Emitters,
  type Fuel,
  FUELS,
  defaultParams,
  type Params,
  RACKS,
  type Rack,
  type Result,
  type Windows,
  ourModel,
  size,
} from "./sizing";
import { RackArt } from "./RackArt";
import { lightCard as card, lightLabel as label } from "./ui";

type Icon = ComponentType<{ size?: number; className?: string }>;
type Option<T> = { value: T; icon: Icon; name: string; note: string };

const WINDOWS: Option<Windows>[] = [
  { value: "single", icon: Square, name: "Single glazed", note: "Old frames, often drafty" },
  { value: "double", icon: Columns2, name: "Double glazed", note: "Most homes since the 80s" },
  { value: "triple", icon: Columns3, name: "Triple glazed", note: "New or renovated" },
];
const EMITTERS: Option<Emitters>[] = [
  { value: "radiators", icon: Heater, name: "Radiators", note: "Under the windows" },
  { value: "underfloor", icon: Waves, name: "Underfloor", note: "Warm floors, low temperature" },
  { value: "mixed", icon: Layers, name: "Both", note: "Underfloor in some rooms" },
];
const FUEL_OPTIONS: Option<Fuel>[] = [
  { value: "oil", icon: Droplet, name: FUELS.oil.name, note: "Tank in the basement" },
  { value: "gas", icon: Flame, name: FUELS.gas.name, note: "Connected to the gas grid" },
  { value: "heatpump", icon: Fan, name: FUELS.heatpump.name, note: "Air or ground source" },
  { value: "electric", icon: Zap, name: FUELS.electric.name, note: "Night storage, panels" },
];

export const STEPS = ["Windows", "Heating", "Energy", "People", "Result"] as const;
type Step = (typeof STEPS)[number];

const chf = (x: number) => `CHF ${Math.round(x).toLocaleString("de-CH")}`;

/** Where you are: the questions as pills across the top. */
function StepPills({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  return (
    <ol
      className={`${card} absolute top-6 left-1/2 flex -translate-x-1/2 items-center gap-1 !rounded-full !p-1`}
    >
      {STEPS.map((s, i) => (
        <li key={s}>
          <button
            disabled={i > step}
            onClick={() => onStep(i)}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
              i === step
                ? "bg-clay text-white"
                : i < step
                  ? "text-ink/70 hover:bg-black/[0.05]"
                  : "text-ink/35"
            }`}
          >
            {i < step && <Check size={12} />}
            {s}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** One answer as a tile: icon, name and a short hint. */
function Choice<T extends string>({
  options,
  value,
  onPick,
}: {
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map(({ value: v, icon: Icon, name, note }) => {
        const on = v === value;
        return (
          <button
            key={v}
            onClick={() => onPick(v)}
            className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ring-1 transition-all ${
              on
                ? "bg-clay/[0.08] ring-clay"
                : "ring-black/[0.06] hover:bg-black/[0.03] hover:ring-black/15"
            }`}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
                on ? "bg-clay text-white" : "bg-black/[0.05] text-ink/70"
              }`}
            >
              <Icon size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">{name}</span>
              <span className="block text-[11px] text-muted">{note}</span>
            </span>
            {on && <Check size={15} className="ml-auto shrink-0 text-clay" />}
          </button>
        );
      })}
    </div>
  );
}

function Question({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="px-2 pt-2 pb-3">
        <p className={`${label} text-clay`}>
          Question {n} of {STEPS.length - 1}
        </p>
        <h3 className="mt-1 text-[17px] leading-tight font-semibold">{title}</h3>
        <p className="mt-1 text-[11.5px] text-muted">{hint}</p>
      </div>
      {children}
    </>
  );
}

/** − value + */
function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const btn =
    "grid size-8 place-items-center rounded-full bg-black/[0.05] text-lg text-ink/80 hover:bg-black/10 disabled:opacity-30";
  return (
    <span className="flex items-center gap-3">
      <button
        aria-label="Fewer"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={btn}
      >
        −
      </button>
      <span className="min-w-6 text-center text-xl font-semibold tabular-nums">{value}</span>
      <button
        aria-label="More"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={btn}
      >
        +
      </button>
    </span>
  );
}

/** A big number with its label underneath. */
function Stat({ icon: Icon, value, name }: { icon: Icon; value: string; name: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.035] px-2.5 py-2">
      <Icon size={13} className="text-clay" />
      <p className="mt-1 text-[13px] leading-tight font-semibold tabular-nums">{value}</p>
      <p className="text-[10.5px] text-muted">{name}</p>
    </div>
  );
}

/** One assumption as a slider: name and value on top, the slider and its range below. */
function Slider({
  icon: Icon,
  name,
  value,
  min,
  max,
  step,
  format,
  onChange,
  check = false,
}: {
  icon: Icon;
  name: string;
  /** No published source yet: say so under the name. */
  check?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-2xl px-2 py-1.5 hover:bg-black/[0.025]">
      <span className="flex items-center justify-between text-[11.5px]">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon size={13} className="text-ink/50" /> {name}
        </span>
        <span className="font-semibold text-clay tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer accent-clay"
      />
      <span className="flex justify-between text-[9.5px] text-muted tabular-nums">
        <span>{format(min)}</span>
        {check && <span className="font-medium text-rust">assumption, to check</span>}
        <span>{format(max)}</span>
      </span>
    </label>
  );
}

const rappen = (v: number) => `${Math.round(v * 100)} Rp/kWh`;
const percent = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, "")} %`;

/** Top left: the answers given, and the assumptions behind the money, all adjustable. */
function AssumptionsCard({
  answers,
  params,
  onParam,
  onReset,
  onRestart,
}: {
  answers: Answers;
  params: Params;
  onParam: <K extends keyof Params>(k: K, v: Params[K]) => void;
  onReset: () => void;
  onRestart: () => void;
}) {
  const chips = [
    WINDOWS.find((o) => o.value === answers.windows)?.name,
    EMITTERS.find((o) => o.value === answers.emitters)?.name,
    FUELS[answers.fuel].name,
    `${answers.residents} residents`,
    answers.hotWater ? "Hot water" : "No hot water",
  ];
  return (
    <article className={`${card} absolute top-6 left-6 w-[300px]`}>
      <div className="px-2 pt-2">
        <div className="flex items-center justify-between">
          <p className={label}>
            <SlidersHorizontal size={12} /> Your numbers
          </p>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-ink"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          Move the sliders, the projection on the right follows.
        </p>
      </div>

      <div className="mt-2 space-y-0.5 border-t border-black/[0.06] pt-1.5">
        <Slider
          icon={Flame}
          name={`Heat today (${FUELS[answers.fuel].name.toLowerCase()})`}
          check
          value={params.heatPrice}
          min={0.05}
          max={0.4}
          step={0.01}
          format={rappen}
          onChange={(v) => onParam("heatPrice", v)}
        />
        <Slider
          icon={Server}
          name="Kachel heat"
          check
          value={params.kachelPrice}
          min={0}
          max={0.15}
          step={0.01}
          format={rappen}
          onChange={(v) => onParam("kachelPrice", v)}
        />
        <Slider
          icon={TrendingUp}
          name="Energy prices rise"
          check
          value={params.priceRise}
          min={0}
          max={0.08}
          step={0.005}
          format={(v) => `${percent(v)} / yr`}
          onChange={(v) => onParam("priceRise", v)}
        />
        <Slider
          icon={Wrench}
          name="Installation"
          check
          value={params.installCost}
          min={2000}
          max={15000}
          step={500}
          format={chf}
          onChange={(v) => onParam("installCost", v)}
        />
        <Slider
          icon={Landmark}
          name="Subsidy (Basel-Stadt)"
          check
          value={params.subsidy}
          min={0}
          max={6000}
          step={500}
          format={chf}
          onChange={(v) => onParam("subsidy", v)}
        />
        <Slider
          icon={CalendarRange}
          name="Look ahead"
          value={params.years}
          min={5}
          max={25}
          step={1}
          format={(v) => `${v} years`}
          onChange={(v) => onParam("years", v)}
        />
      </div>

      <div className="mt-2 border-t border-black/[0.06] px-2 pt-2.5">
        <p className={label}>Your answers</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10.5px] font-medium text-ink/70"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onRestart}
        className="mt-3 mb-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-black/[0.05] py-2 text-[12px] font-medium hover:bg-black/10"
      >
        <ArrowLeft size={13} /> Change answers
      </button>
    </article>
  );
}

/** Top right, compact: money saved over the years, follows the sliders. */
function ProjectionCard({ r }: { r: Result }) {
  const years = r.cumulative.length - 1;
  const max = Math.max(...r.cumulative, 1);
  const min = Math.min(...r.cumulative, 0);
  const span = max - min || 1;
  const payback = r.paybackYears === Infinity ? "—" : `${r.paybackYears.toFixed(1)} yrs`;
  return (
    <article
      className={`${card} absolute top-6 right-6 w-[300px]`}
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex items-start justify-between px-2 pt-2">
        <div>
          <p className={label}>
            <TrendingUp size={12} /> Saved in {years} years
          </p>
          <h3 className="mt-1 text-[22px] leading-tight font-semibold tabular-nums">
            {chf(r.cumulative[years] ?? 0)}
          </h3>
        </div>
        <span className="mt-1 rounded-full bg-clay/10 px-2 py-0.5 text-[10.5px] font-semibold text-clay">
          after install
        </span>
      </div>

      {/* Money saved so far, year by year: grey below the line while paying off the install */}
      <div className="mx-2 mt-2 flex h-14 gap-[3px]">
        {r.cumulative.map((v, y) => (
          <div key={y} className="flex flex-1 flex-col">
            <div className="flex items-end" style={{ flexBasis: `${(max / span) * 100}%` }}>
              {v > 0 && (
                <div
                  className="w-full rounded-t-[2px] bg-clay transition-[height] duration-300"
                  style={{ height: `${(v / max) * 100}%` }}
                />
              )}
            </div>
            <div className="border-t border-black/15" />
            <div className="flex items-start" style={{ flexBasis: `${(-min / span) * 100}%` }}>
              {v < 0 && (
                <div
                  className="w-full rounded-b-[2px] bg-black/20 transition-[height] duration-300"
                  style={{ height: `${(v / min) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1 px-1 pb-1">
        <Stat icon={PiggyBank} value={chf(r.savingsPerYear)} name="per year" />
        <Stat icon={Timer} value={payback} name="payback" />
        <Stat icon={Leaf} value={`${r.co2Tonnes.toFixed(1)} t`} name="CO₂ / yr" />
      </div>
      <p className="px-2 pb-1.5 text-[9.5px] leading-snug text-muted">
        {`Heat demand ${Math.round(r.demand).toLocaleString("en-GB")} kWh a year, from SFOE Sonnendach for Byfangweg 18 (330 m², BFS GWR). Prices, install cost, subsidy and CO₂ per kWh: assumptions, to check.`}
      </p>
    </article>
  );
}

/** Bottom right: the rack, drawn, with the other models to switch to; the finances follow the pick. */
function ProductCard({
  r,
  answers,
  onPick,
}: {
  r: Result;
  answers: Answers;
  onPick: (rack: Rack) => void;
}) {
  const i = RACKS.findIndex((k) => k.id === r.rack.id);
  const best = r.rack.id === r.bestFit.id;
  const smaller = r.rack.kw < r.bestFit.kw;
  const go = (d: number) => {
    const next = RACKS[(i + d + RACKS.length) % RACKS.length];
    if (next) onPick(next);
  };
  const arrow =
    "pointer-events-auto absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur hover:bg-white/20";
  return (
    <article
      className={`${card} absolute right-6 bottom-6 w-[300px]`}
      style={{ animationDelay: "220ms" }}
    >
      {/* The rack itself, on a dark stage */}
      <div className="relative h-40 overflow-hidden rounded-[20px] bg-[radial-gradient(120%_90%_at_50%_100%,#2a2d33,#111316)]">
        {/* Keyed so a new model fades in */}
        <div key={r.rack.id} className="absolute inset-x-6 inset-y-1 animate-card-in">
          <RackArt rack={r.rack} />
        </div>
        <span
          className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            best ? "bg-clay text-white" : "bg-white/15 text-white/85"
          }`}
        >
          {best ? <Sparkles size={11} /> : <Hand size={11} />}
          {best ? "Best fit" : "Your pick"}
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 tabular-nums">
          {r.rack.kw} kW
        </span>
        <button aria-label="Previous model" onClick={() => go(-1)} className={`${arrow} left-2`}>
          <ChevronLeft size={15} />
        </button>
        <button aria-label="Next model" onClick={() => go(1)} className={`${arrow} right-2`}>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="px-2 pt-2.5">
        <h3 className="text-[17px] leading-tight font-semibold">{r.rack.name}</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {r.rack.servers} servers · {r.rack.size}
        </p>
      </div>

      {/* All models; the best fit marked with a dot */}
      <div className="mx-1 mt-2 grid grid-cols-4 gap-1 rounded-full bg-black/[0.05] p-0.5">
        {RACKS.map((k) => (
          <button
            key={k.id}
            onClick={() => onPick(k)}
            className={`relative rounded-full py-1 text-[11px] font-semibold transition-colors ${
              k.id === r.rack.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {k.id.toUpperCase()}
            {k.id === r.bestFit.id && (
              <span className="absolute top-1 right-2 size-1.5 rounded-full bg-clay" />
            )}
          </button>
        ))}
      </div>

      {/* How much of the heat it covers, and what that means */}
      <div className="mt-3 px-2">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-muted">Covers your yearly heat</span>
          <span className="text-[15px] font-semibold tabular-nums">
            {Math.round(r.coverage * 100)}%
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-clay to-amber-400 transition-[width] duration-500"
            style={{ width: `${r.coverage * 100}%` }}
          />
        </div>
        <p className="mt-1.5 mb-1 text-[10.5px] leading-snug text-muted">
          {best
            ? `Sized for your ${r.peakKw.toFixed(1)} kW peak. Your ${FUELS[answers.fuel].name.toLowerCase()} stays as backup.`
            : smaller
              ? `Smaller than your ${r.peakKw.toFixed(1)} kW peak: your ${FUELS[answers.fuel].name.toLowerCase()} does more of the work.`
              : "More than you need: the extra heat has nowhere to go."}
        </p>
        <OurModelNote demandKwh={r.demand} />
      </div>
    </article>
  );
}

/** Kachel's own model beside the racks: it sizes in 1 kW servers (packages/economics). */
function OurModelNote({ demandKwh }: { demandKwh: number }) {
  const m = ourModel(demandKwh);
  return (
    <p className="mb-1 rounded-xl bg-black/[0.04] px-2 py-1.5 text-[10px] leading-snug text-muted">
      {`Kachel's model: about ${m.servers} servers of 1 kW, ${m.shareOfHeatCoveredPct}% of the heat, ${chf(m.netBeforeHardwareChf)} a year before hardware, ${chf(m.netAfterHardwareChf)} after (${m.tariffName}, ${(m.chfPerKwh * 100).toFixed(1)} Rp/kWh; scaled from the Basel reference house).`}
    </p>
  );
}

/**
 * Step by step over the 3D house: a few questions about the home on the left (the floors stay on
 * the right), then the rack that fits and what it saves.
 */
export function Assessment({
  step,
  onStep: setStep,
  answers,
  onAnswers,
  floors,
}: {
  step: number;
  onStep: (step: number) => void;
  /** Kept by the house view, so the 3D house can show them (e.g. the window type). */
  answers: Answers;
  onAnswers: (a: Answers) => void;
  floors: ReactNode;
}) {
  // Picking an option only changes the answer (and the house); Next moves on
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => onAnswers({ ...answers, [k]: v });
  const current: Step = STEPS[step] ?? "Result";
  const done = current === "Result";
  // Slider changes, kept per fuel: picking another fuel starts from its own prices again
  const [tuned, setTuned] = useState<{ fuel: Fuel; params: Params } | null>(null);
  const params = tuned?.fuel === answers.fuel ? tuned.params : defaultParams(answers.fuel);
  const setParam = <K extends keyof Params>(k: K, v: Params[K]) =>
    setTuned({ fuel: answers.fuel, params: { ...params, [k]: v } });
  // A model picked instead of the best fit; null keeps the best fit
  const [picked, setPicked] = useState<Rack | null>(null);
  const result = size(answers, params, picked);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      <StepPills step={step} onStep={setStep} />

      {done ? (
        <>
          <AssumptionsCard
            answers={answers}
            params={params}
            onParam={setParam}
            onReset={() => setTuned(null)}
            onRestart={() => {
              setPicked(null);
              setStep(0);
            }}
          />
          <ProjectionCard r={result} />
          <ProductCard r={result} answers={answers} onPick={setPicked} />
        </>
      ) : (
        <>
          {/* Keyed by step so each question slides in */}
          <article key={step} className={`${card} absolute top-6 left-6 w-[300px]`}>
            {current === "Windows" && (
              <Question
                n={1}
                title="What windows do you have?"
                hint="They decide how much heat the house loses."
              >
                <Choice
                  options={WINDOWS}
                  value={answers.windows}
                  onPick={(v) => set("windows", v)}
                />
              </Question>
            )}
            {current === "Heating" && (
              <Question
                n={2}
                title="How do your rooms get warm?"
                hint="Server heat suits low water temperatures best."
              >
                <Choice
                  options={EMITTERS}
                  value={answers.emitters}
                  onPick={(v) => set("emitters", v)}
                />
              </Question>
            )}
            {current === "Energy" && (
              <Question
                n={3}
                title="What heats your home today?"
                hint="We compare against what you pay now."
              >
                <Choice
                  options={FUEL_OPTIONS}
                  value={answers.fuel}
                  onPick={(v) => set("fuel", v)}
                />
              </Question>
            )}
            {current === "People" && (
              <Question
                n={4}
                title="Who lives here?"
                hint="More people, more hot water: free heat in summer too."
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-2xl px-2.5 py-2 ring-1 ring-black/[0.06]">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <Users size={15} className="text-ink/60" /> Residents
                    </span>
                    <Stepper
                      value={answers.residents}
                      min={1}
                      max={12}
                      onChange={(v) => set("residents", v)}
                    />
                  </div>
                  <button
                    onClick={() => set("hotWater", !answers.hotWater)}
                    className={`flex w-full items-center gap-2 rounded-2xl px-2.5 py-2.5 text-left text-[12.5px] font-semibold ring-1 transition-all ${
                      answers.hotWater
                        ? "bg-clay/[0.08] ring-clay"
                        : "ring-black/[0.06] hover:bg-black/[0.03]"
                    }`}
                  >
                    <ShowerHead
                      size={15}
                      className={answers.hotWater ? "text-clay" : "text-ink/60"}
                    />
                    Heat our hot water too
                    <span
                      className={`ml-auto grid size-5 place-items-center rounded-md ${
                        answers.hotWater ? "bg-clay text-white" : "bg-black/[0.08]"
                      }`}
                    >
                      {answers.hotWater && <Check size={13} />}
                    </span>
                  </button>
                </div>
              </Question>
            )}

            <div className="mt-3 flex items-center gap-2 px-1 pb-1">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-medium text-muted hover:bg-black/[0.05] hover:text-ink"
                >
                  <ArrowLeft size={13} /> Back
                </button>
              )}
              <button
                onClick={() => setStep(step + 1)}
                className="ml-auto flex items-center gap-1.5 rounded-full bg-clay px-4 py-2 text-[12px] font-semibold text-white hover:bg-clay-dark"
              >
                {current === "People" ? "See my result" : "Next"} <ArrowRight size={13} />
              </button>
            </div>
          </article>
          {floors}
        </>
      )}
    </div>
  );
}
