import { lazy, Suspense, useEffect, useState } from "react";
import { carnotBound, EXAMPLE, kelvin, STEPS, STREAM_COLOUR } from "../device/cycle";
import { PageHead, Pill } from "../shell/Shell";
import { card } from "../ui";

/** three.js loads with this page only, not with the rest of the console. */
const DeviceModel = lazy(() =>
  import("../device/DeviceModel").then((m) => ({ default: m.DeviceModel })),
);

const STEP_MS = 3200;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const pct = (x: number) =>
  new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(x);

/** A small key: the line colour and what it carries. */
function Swatch({ colour, children }: { colour: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1 w-4 rounded-full" style={{ background: colour }} />
      {children}
    </span>
  );
}

/**
 * The device, a concept: server heat, lifted by a small heat pump, drives an ORC turbine and a
 * generator, whose electricity goes back to the rack. The model from the film in 3D (explode,
 * labels, the flow step by step), the cycle in plain words, and the Carnot bound with one worked
 * example. No efficiency figure: the model paper gives none (docs/paper/kachel-model.md).
 */
export function Device() {
  const [explode, setExplode] = useState(0);
  const [summer, setSummer] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => window.clearInterval(t);
  }, [playing]);

  const pick = (i: number) => {
    setPlaying(false);
    setStep(i);
  };
  const bound = carnotBound(EXAMPLE.hotC, EXAMPLE.coldC);

  return (
    <>
      <PageHead
        eyebrow="Heat pump and ORC turbine"
        title="The device"
        action={<Pill tone="orange">Concept, not built</Pill>}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="3D model" className="min-w-0">
          <Suspense
            fallback={
              <div className="h-[380px] rounded-2xl bg-[#0b0e14] sm:h-[560px]" aria-hidden />
            }
          >
            <DeviceModel state={{ explode, step, summer }} />
          </Suspense>
          <div className={`${card} mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3`}>
            <label className="flex basis-full items-center gap-3 sm:basis-auto sm:flex-1 text-[14px]">
              <span className="font-medium">Explode</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
                className="w-full accent-[#007aff]"
                aria-label="Explode"
              />
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                role="switch"
                checked={summer}
                onChange={(e) => setSummer(e.target.checked)}
                className="size-4 accent-[#007aff]"
              />
              <span className="font-medium">Summer</span>
            </label>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="rounded-lg border border-sep bg-white px-3 py-1.5 text-[14px] font-medium text-blue hover:bg-surface"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <p className="flex w-full flex-wrap gap-x-4 gap-y-1 text-[13px] text-label-2">
              <Swatch colour={STREAM_COLOUR.warm}>Warm water</Swatch>
              <Swatch colour={STREAM_COLOUR.lifted}>Lifted, hotter</Swatch>
              <Swatch colour="#c9d1dc">Vapour</Swatch>
              <Swatch colour={STREAM_COLOUR.power}>Electricity</Swatch>
              {summer && <Swatch colour="#8fb3d6">Cooler water back</Swatch>}
            </p>
          </div>
        </section>

        <aside className={`${card} self-start p-5`} aria-label="How it would work">
          <h2 className="text-[19px] font-semibold tracking-tight">How it would work</h2>
          <ol className="mt-3 space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`w-full rounded-xl px-3 py-2 text-left ${i === step ? "bg-surface" : "hover:bg-surface/60"}`}
                >
                  <span className="flex items-baseline gap-2 text-[15px] font-semibold">
                    <span className="text-label-2 tabular-nums">{i + 1}</span>
                    {s.title}
                  </span>
                  {i === step && (
                    <span className="mt-1 block pl-5 text-[14px] leading-snug text-label-2">
                      {s.text}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          {summer && (
            <p className="mt-3 rounded-xl bg-[#ff5a1f]/[0.08] px-3 py-2 text-[14px] leading-snug">
              <span className="font-semibold">Summer.</span> When no home needs the heat, the device
              recovers part of it as electricity, and the heat output could help with summer
              cooling: the water goes back to the servers cooler.
            </p>
          )}

          <h3 className="mt-5 text-[15px] font-semibold">The limit</h3>
          <p className="mt-1 text-[14px] leading-snug text-label-2">
            No heat engine beats the Carnot bound, with temperatures in kelvin:
          </p>
          <p
            data-carnot
            className="mt-2 rounded-xl bg-surface px-3 py-2 text-center font-serif text-[18px]"
          >
            η ≤ 1 − T<sub>c</sub> / T<sub>h</sub>
          </p>
          <p className="mt-2 text-[14px] leading-snug text-label-2">
            <span className="font-medium text-label">Our example</span>, not a design point: water
            lifted to {EXAMPLE.hotC} °C ({kelvin(EXAMPLE.hotC).toFixed(2)} K), summer air at{" "}
            {EXAMPLE.coldC} °C ({kelvin(EXAMPLE.coldC).toFixed(2)} K). Then η ≤ 1 −{" "}
            {kelvin(EXAMPLE.coldC).toFixed(2)} / {kelvin(EXAMPLE.hotC).toFixed(2)} ≈ {pct(bound)}. A
            real cycle stays below the bound, and at server-water temperatures the bound is small.
            We have no measured efficiency, so we give none.
          </p>
          <p className="mt-4 border-t border-sep pt-3 text-[13px] leading-snug text-label-2">
            Concept, not built. The model is from our pitch film; the rack and heat exchanger are
            the plant room&apos;s, the heat pump a stand-in.
          </p>
        </aside>
      </div>
    </>
  );
}
