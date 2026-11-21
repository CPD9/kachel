import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Heater,
  Home,
  Layers,
  MapPin,
  Minus,
  Plus,
  Thermometer,
  Users,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FLOORS, type FloorId, HouseScene } from "./House";
import { card, label } from "./ui";

const row = "flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors";

/** Two or more options in a pill, one picked. */
function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="flex rounded-full bg-white/[0.08] p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
            v === value ? "bg-clay text-white" : "text-white/60 hover:text-white"
          }`}
        >
          {text}
        </button>
      ))}
    </span>
  );
}

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
    "grid size-5 place-items-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/15 disabled:opacity-30";
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
 * Inside the building: the house in 3D in the middle, the building's set-up on the left and its
 * floors on the right (like baselhack_2026_adobe's /vendor). Esc steps back: floor → house → map.
 */
export function HouseView({ onExit }: { onExit: () => void }) {
  const [open, setOpen] = useState<FloorId | null>(null);
  const [hover, setHover] = useState<FloorId | null>(null);
  const [residents, setResidents] = useState(4);
  const [heating, setHeating] = useState<"radiators" | "underfloor">("radiators");
  const [hotWater, setHotWater] = useState<"yes" | "no">("yes");
  // Room temperature per floor, in °C
  const [temps, setTemps] = useState<Record<FloorId, number>>({ ground: 21, upper: 20 });

  const openFloor = useCallback((id: FloorId | null) => {
    setOpen(id);
    setHover(null);
  }, []);
  const back = useCallback(() => (open ? openFloor(null) : onExit()), [open, openFloor, onExit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && back();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const floor = FLOORS.find((f) => f.id === open);

  return (
    <div className="absolute inset-0 animate-[house-in_700ms_ease-out_both] bg-[radial-gradient(90%_70%_at_50%_45%,#2a2c31,#141518_60%,#0b0c0e)]">
      {/* Right-click on the house steps back too */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onContextMenu={(e) => {
          e.preventDefault();
          back();
        }}
      >
        <HouseScene open={open} hover={hover} onHover={setHover} onOpen={openFloor} />
      </div>

      <div className="pointer-events-none absolute inset-0 font-sans">
        {/* Left: the building and how it's used */}
        <article
          className={`${card} absolute top-20 left-6 w-[280px]`}
          style={{ animationDelay: "100ms" }}
        >
          <div className="px-2 pt-2 pb-1">
            <p className={`${label} text-clay`}>
              <MapPin size={11} /> Your building
            </p>
            <h3 className="mt-1 text-[17px] leading-tight font-semibold">Byfangweg 18</h3>
            <p className="mt-0.5 text-[11.5px] text-white/55">4051 Basel · 2 floors · ≈ 300 m²</p>
          </div>
          <div className="mt-2 border-t border-white/10 pt-1.5">
            <Setting icon={<Users size={12} />} name="Residents">
              <Stepper value={residents} unit="" min={1} max={12} onChange={setResidents} />
            </Setting>
            <Setting icon={<Heater size={12} />} name="Heating">
              <Seg
                options={[
                  ["radiators", "Radiators"],
                  ["underfloor", "Underfloor"],
                ]}
                value={heating}
                onChange={setHeating}
              />
            </Setting>
            <Setting icon={<Droplets size={12} />} name="Hot water">
              <Seg
                options={[
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
                value={hotWater}
                onChange={setHotWater}
              />
            </Setting>
          </div>
        </article>

        {/* Right: the floors, or the open floor's rooms */}
        <article
          className={`${card} absolute top-20 right-6 w-[280px]`}
          style={{ animationDelay: "200ms" }}
        >
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
                <p className="mt-0.5 text-[11.5px] text-white/55">
                  ≈ {floor.area} m² · {floor.rooms.length} rooms
                </p>
              </>
            ) : (
              <>
                <p className={label}>
                  <Layers size={12} /> Floors
                </p>
                <p className="mt-1 text-[11px] text-white/55">
                  Hover a floor to look inside, click to zoom in, Esc to go back.
                </p>
              </>
            )}
          </div>

          <div className="mt-2 border-t border-white/10 pt-1.5">
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
                      <span className="ml-auto text-[11px] text-white/55 tabular-nums">
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
                      className={`${row} ${hover === f.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-semibold transition-colors ${
                          hover === f.id ? "bg-clay/20 text-clay" : "bg-white/[0.06] text-white/70"
                        }`}
                      >
                        {f.level || <Home size={14} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] font-medium">{f.name}</span>
                        <span className="block text-[10.5px] text-white/55">
                          ≈ {f.area} m² · {temps[f.id]} °C
                        </span>
                      </span>
                      <ChevronRight size={14} className="ml-auto shrink-0 text-white/40" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
