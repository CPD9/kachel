import { ChevronLeft, ChevronRight, Home, Layers, Minus, Plus, Thermometer } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Assessment, STEPS } from "./Assessment";
import { useCompact } from "./compact";
import { FLOORS, type FloorId, type Focus, HouseScene } from "./House";
import { DEFAULT_ANSWERS } from "./sizing";
import { lightCard as card, lightLabel as label } from "./ui";

/** The part of the house each question is about: the camera goes there. */
const FOCUS: Record<(typeof STEPS)[number], Focus | null> = {
  Windows: "windows",
  Heating: "heating",
  Energy: "energy",
  People: "people",
  Result: null,
};

const row = "flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors";

/** − value + */
function Stepper({
  value,
  unit,
  onChange,
  min,
  max,
}: {
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const step =
    "tap relative grid size-5 place-items-center rounded-full bg-black/[0.05] text-ink/80 hover:bg-black/10 disabled:opacity-30";
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold tabular-nums">
      <button
        aria-label="Less"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={step}
      >
        <Minus size={11} />
      </button>
      <span className="min-w-12 text-center">
        {value} {unit}
      </span>
      <button
        aria-label="More"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={step}
      >
        <Plus size={11} />
      </button>
    </span>
  );
}

/** A labelled setting: name on the left, its control on the right. */
function Setting({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <span className={label}>
        {icon} {name}
      </span>
      {children}
    </div>
  );
}

/**
 * Inside the building: the house in 3D in the middle, the step-by-step questions on the left and
 * its floors on the right (like baselhack_2026_adobe's /vendor). Esc steps back: floor → house → map.
 * Stays mounted (hidden) while away at the gamer, so the answers survive the trip.
 */
export function HouseView({
  visible,
  onExit,
  onNext,
}: {
  visible: boolean;
  onExit: () => void;
  /** "a" on the result page: on to the neighbour who games on the rack. */
  onNext: () => void;
}) {
  const compact = useCompact();
  const [open, setOpen] = useState<FloorId | null>(null);
  const [hover, setHover] = useState<FloorId | null>(null);
  // The step-by-step questions, kept here so the house can show the answers
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(DEFAULT_ANSWERS);
  // Room temperature per floor, in °C
  const [temps, setTemps] = useState<Record<FloorId, number>>({ ground: 21, upper: 20 });

  const openFloor = useCallback((id: FloorId | null) => {
    setOpen(id);
    setHover(null);
  }, []);
  const back = useCallback(() => (open ? openFloor(null) : onExit()), [open, openFloor, onExit]);
  const atResult = STEPS[step] === "Result";
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return back();
      // Sliders keep focus after a drag, so they don't block "a"
      const el = e.target as HTMLElement;
      if (el.closest("textarea, [contenteditable], input:not([type=range])")) return;
      if (atResult && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "a")
        onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, back, atResult, onNext]);

  const floor = FLOORS.find((f) => f.id === open);

  return (
    <div
      className={`absolute inset-0 animate-[house-in_700ms_ease-out_both] ${visible ? "" : "hidden"} bg-[radial-gradient(80%_60%_at_50%_0%,#ffffff,#f5f5f7_60%,#e8e8ed)]`}
    >
      {/* Right-click on the house steps back too */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onContextMenu={(e) => {
          e.preventDefault();
          back();
        }}
      >
        <HouseScene
          open={open}
          hover={hover}
          onHover={setHover}
          onOpen={openFloor}
          answers={answers}
          focus={FOCUS[STEPS[step] ?? "Result"]}
        />
      </div>

      {/* Right: the floors, or the open floor's rooms (until the result takes that side) */}
      <Assessment
        step={step}
        onStep={setStep}
        answers={answers}
        onAnswers={setAnswers}
        onNext={onNext}
        floors={
          <>
            <div className="px-2 pt-2 pb-1">
              {floor ? (
                <>
                  <button
                    onClick={() => openFloor(null)}
                    className="-ml-1 flex items-center text-[11.5px] font-medium text-clay hover:underline"
                  >
                    <ChevronLeft size={14} /> All floors
                  </button>
                  <h3 className="mt-1.5 text-[17px] leading-tight font-semibold">{floor.name}</h3>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    ≈ {floor.area} m² · {floor.rooms.length} rooms
                  </p>
                </>
              ) : (
                <>
                  <p className={label}>
                    <Layers size={12} /> Floors
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {compact
                      ? "Tap a floor to look inside."
                      : "Hover a floor to look inside, click to zoom in, Esc to go back."}
                  </p>
                </>
              )}
            </div>

            <div className="mt-2 border-t border-black/[0.06] pt-1.5">
              {floor ? (
                <>
                  <Setting icon={<Thermometer size={12} />} name="Room temp.">
                    <Stepper
                      value={temps[floor.id]}
                      unit="°C"
                      min={16}
                      max={25}
                      onChange={(t) => setTemps((all) => ({ ...all, [floor.id]: t }))}
                    />
                  </Setting>
                  <p className={`${label} px-2 pt-2 pb-1`}>Rooms</p>
                  <ul>
                    {floor.rooms.map((r) => (
                      <li key={r.name} className={`${row} py-1.5`}>
                        <span className="text-[11.5px] font-medium">{r.name}</span>
                        <span className="ml-auto text-[11px] text-muted tabular-nums">
                          ≈ {r.area} m²
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <ul>
                  {[...FLOORS].reverse().map((f) => (
                    <li key={f.id}>
                      <button
                        onMouseEnter={() => setHover(f.id)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => openFloor(f.id)}
                        className={`${row} ${hover === f.id ? "bg-black/[0.05]" : "hover:bg-black/[0.03]"}`}
                      >
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-semibold transition-colors ${
                            hover === f.id ? "bg-clay/20 text-clay" : "bg-black/[0.05] text-ink/70"
                          }`}
                        >
                          {f.level || <Home size={14} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11.5px] font-medium">{f.name}</span>
                          <span className="block text-[10.5px] text-muted">
                            ≈ {f.area} m² · {temps[f.id]} °C
                          </span>
                        </span>
                        <ChevronRight size={14} className="ml-auto shrink-0 text-ink/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        }
      />

      {/* On the result page the floors card is gone: a pill under the steps leads back out */}
      {floor && STEPS[step] === "Result" && (
        <div
          className={`pointer-events-none absolute inset-x-0 flex justify-center ${compact ? "" : "top-[76px]"}`}
          style={compact ? { top: "calc(var(--compact-top) + 60px)" } : undefined}
        >
          <button
            key={floor.id}
            onClick={() => openFloor(null)}
            className={`${card} flex items-center gap-2 !rounded-full !py-1.5 !pr-2 !pl-3 text-[12px] font-medium hover:bg-white ${compact ? "min-h-11" : ""}`}
          >
            <ChevronLeft size={14} className="text-clay" />
            Whole house
            <span className="text-ink/30">·</span>
            <span className="text-muted">{floor.name}</span>
            {!compact && (
              <kbd className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-sans text-[10px] text-muted">
                Esc
              </kbd>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
