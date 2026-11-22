import { celsius, offsetLabel } from "../format";
import { MONTH_NAMES, type MonthsFile } from "../fleet/months";
import { card } from "../ui";

/** The month and the outdoor temperature the whole console shows (#159). */
export function MonthControls({
  file,
  month,
  offset,
  onMonth,
  onOffset,
}: {
  file: MonthsFile;
  month: number;
  offset: number;
  onMonth: (m: number) => void;
  onOffset: (o: number) => void;
}) {
  const meanTemp = (i: number) => {
    const t = Object.values(file.cities).map((c) => c.mean_temp_c[i] ?? 0);
    return t.reduce((a, b) => a + b, 0) / t.length + offset;
  };
  return (
    <section aria-label="Month and weather" className={`${card} mt-6 p-2`}>
      <div role="group" aria-label="Month" className="grid grid-cols-6 gap-1 lg:grid-cols-12">
        {MONTH_NAMES.map((n, i) => (
          <button
            key={n}
            type="button"
            aria-pressed={i === month}
            aria-label={n}
            onClick={() => onMonth(i)}
            className={`flex flex-col items-center rounded-lg py-1.5 ${i === month ? "bg-blue text-white" : "text-label-2 hover:bg-surface hover:text-label"}`}
          >
            <span className="text-[14px] font-semibold">{n.slice(0, 3)}</span>
            <span className="text-[12px] tabular-nums opacity-80">{Math.round(meanTemp(i))}°</span>
          </button>
        ))}
      </div>
      <label className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sep/60 px-2 pt-2.5 pb-1">
        <span className="text-[14px] font-semibold">Outdoor temperature</span>
        <input
          type="range"
          aria-label="Outdoor temperature"
          min={file.offsets_c[0]}
          max={file.offsets_c.at(-1)}
          step={1}
          value={offset}
          onChange={(e) => onOffset(Number(e.target.value))}
          className="min-w-[160px] flex-1 accent-blue"
        />
        <span className="text-[14px] text-label-2 tabular-nums">
          {offset === 0 ? "as in 2025" : `every hour ${offsetLabel(offset)} °C`} · mean{" "}
          {celsius(meanTemp(month))} °C
        </span>
      </label>
    </section>
  );
}
