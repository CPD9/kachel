import {
  ArrowLeft,
  ArrowRight,
  Check,
  Columns2,
  Columns3,
  Droplet,
  Fan,
  Flame,
  Heater,
  Layers,
  Leaf,
  PiggyBank,
  RotateCcw,
  Server,
  ShowerHead,
  Square,
  Timer,
  TrendingUp,
  Users,
  Waves,
  Zap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  type Answers,
  type Emitters,
  type Fuel,
  FUELS,
  INSTALL_COST,
  type Result,
  type Windows,
  YEARS,
  size,
} from "./sizing";
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
      <p className="mt-1 text-[15px] leading-tight font-semibold tabular-nums">{value}</p>
      <p className="text-[10.5px] text-muted">{name}</p>
    </div>
  );
}

/** The recommended rack, and how it covers the home's heat. */
function RackCard({
  r,
  answers,
  onRestart,
}: {
  r: Result;
  answers: Answers;
  onRestart: () => void;
}) {
  const kWh = (x: number) => `${Math.round(x / 100) / 10}k kWh`;
  return (
    <article className={`${card} absolute top-6 left-6 w-[300px]`}>
      <div className="px-2 pt-2">
        <p className={`${label} text-clay`}>
          <Server size={11} /> Best fit for your home
        </p>
        <h3 className="mt-1 text-[19px] leading-tight font-semibold">{r.rack.name}</h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {r.rack.kw} kW heat · {r.rack.servers} servers · {r.rack.size}
        </p>
      </div>

      {/* The rack itself, simple: a column of server slots glowing warm */}
      <div className="mx-2 mt-3 flex items-end gap-3 rounded-2xl bg-[#1b1d21] p-3">
        <div className="grid w-16 gap-[3px] rounded-md bg-black/60 p-1.5">
          {Array.from({ length: Math.min(r.rack.servers, 12) }, (_, i) => (
            <span
              key={i}
              className="h-1.5 animate-pulse rounded-[2px] bg-gradient-to-r from-clay to-amber-400"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <div className="text-[11px] text-white/70">
          <p className="text-[22px] leading-none font-semibold text-white tabular-nums">
            {Math.round(r.coverage * 100)}%
          </p>
          of your yearly heat comes from the servers. Your {FUELS[answers.fuel].name.toLowerCase()}{" "}
          stays as backup for the coldest days.
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 px-2 text-[11.5px]">
        <div className="flex justify-between">
          <dt className="text-muted">Space heating</dt>
          <dd className="font-semibold tabular-nums">{kWh(r.spaceHeat)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Hot water</dt>
          <dd className="font-semibold tabular-nums">{r.hotWater ? kWh(r.hotWater) : "—"}</dd>
        </div>
        <div className="flex justify-between border-t border-black/[0.06] pt-1.5">
          <dt className="text-muted">Peak load</dt>
          <dd className="font-semibold tabular-nums">{r.peakKw.toFixed(1)} kW</dd>
        </div>
      </dl>

      <button
        onClick={onRestart}
        className="mt-3 mb-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-black/[0.05] py-2 text-[12px] font-medium hover:bg-black/10"
      >
        <RotateCcw size={13} /> Change answers
      </button>
    </article>
  );
}

/** Savings, payback, CO₂ and money saved over ten years. */
function ProjectionCard({ r }: { r: Result }) {
  const max = Math.max(...r.cumulative);
  const min = Math.min(...r.cumulative, 0);
  const span = max - min || 1;
  const payback = r.paybackYears === Infinity ? "—" : `${r.paybackYears.toFixed(1)} yrs`;
  return (
    <article
      className={`${card} absolute top-6 right-6 w-[300px]`}
      style={{ animationDelay: "120ms" }}
    >
      <div className="px-2 pt-2">
        <p className={label}>
          <TrendingUp size={12} /> Financial projection
        </p>
        <h3 className="mt-1 text-[19px] leading-tight font-semibold tabular-nums">
          {chf(r.cumulative[YEARS] ?? 0)}
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          saved over {YEARS} years, after installation
        </p>
      </div>

      {/* Money saved so far, year by year: below the line while paying off the install */}
      <div className="mx-2 mt-3 flex h-28 gap-1">
        {r.cumulative.map((v, y) => (
          <div key={y} className="flex flex-1 flex-col">
            <div className="flex items-end" style={{ flexBasis: `${(max / span) * 100}%` }}>
              {v > 0 && (
                <div
                  className="w-full origin-bottom animate-[grow-up_700ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-t-[3px] bg-clay"
                  style={{ height: `${(v / max) * 100}%`, animationDelay: `${y * 50}ms` }}
                />
              )}
            </div>
            <div className="border-t border-black/15" />
            <div className="flex items-start" style={{ flexBasis: `${(-min / span) * 100}%` }}>
              {v < 0 && (
                <div
                  className="w-full rounded-b-[3px] bg-black/20"
                  style={{ height: `${(v / min) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-2 mt-1 flex justify-between text-[9.5px] font-semibold text-muted">
        <span>Today</span>
        <span>Year {YEARS}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 px-1">
        <Stat icon={PiggyBank} value={chf(r.savingsPerYear)} name="saved per year" />
        <Stat icon={Timer} value={payback} name="to pay back" />
        <Stat icon={Leaf} value={`${r.co2Tonnes.toFixed(1)} t`} name="CO₂ avoided / yr" />
        <Stat icon={Server} value={chf(INSTALL_COST)} name="one-off install" />
      </div>
      <p className="mx-1 mt-2 mb-1 rounded-xl bg-clay/10 px-2.5 py-1.5 text-[11px] font-medium text-clay">
        Computing customers pay for the servers' power, so your heat costs about a third of today's.
      </p>
    </article>
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
  const result = size(answers);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      <StepPills step={step} onStep={setStep} />

      {done ? (
        <>
          <RackCard r={result} answers={answers} onRestart={() => setStep(0)} />
          <ProjectionCard r={result} />
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
