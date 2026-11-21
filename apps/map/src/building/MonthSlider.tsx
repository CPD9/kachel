import { useState } from "react";
import { formatEnergy } from "./estimate";
import { MONTHS, monthlyHeat } from "./months";

/** The building's heat month by month: a slider and twelve bars, the chosen month marked. */
export function MonthSlider({
  heatingKwh,
  hotWaterKwh,
  degreeDays,
  initialMonth = new Date().getMonth(),
}: {
  heatingKwh: number;
  hotWaterKwh: number;
  degreeDays: readonly number[];
  initialMonth?: number;
}) {
  const [month, setMonth] = useState(initialMonth);
  const months = monthlyHeat(heatingKwh, hotWaterKwh, degreeDays);
  const peak = Math.max(...months, 1);
  const name = MONTHS[month] ?? "";
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="heat-month" className="text-paper/70">
          {name}
        </label>
        <span className="font-semibold">{formatEnergy(months[month] ?? 0)}</span>
      </div>
      <div className="mt-1 flex h-10 items-end gap-0.5" aria-hidden="true">
        {months.map((kwh, i) => (
          <div
            key={MONTHS[i]}
            className={i === month ? "flex-1 bg-heat" : "flex-1 bg-paper/30"}
            style={{ height: `${Math.max(2, (kwh / peak) * 100)}%` }}
          />
        ))}
      </div>
      <input
        id="heat-month"
        type="range"
        min={0}
        max={11}
        step={1}
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        aria-valuetext={`${name}: ${formatEnergy(months[month] ?? 0)}`}
        className="mt-1 w-full accent-heat"
      />
    </div>
  );
}
