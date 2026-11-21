import { mwh } from "../format";
import { MONTH_NAMES, type FleetMonth } from "./months";

const LEGEND = [
  { label: "Heat from the servers", mark: "h-3 rounded-sm bg-ember" },
  { label: "Backup heaters", mark: "h-3 rounded-sm bg-glacier" },
];

/**
 * The fleet's year month by month: heat the servers delivered, the backup heaters stacked on top
 * (together the heat demand). The chosen month is marked; a click picks another.
 */
export function YearChart({
  months,
  month,
  onPick,
}: {
  months: FleetMonth[];
  month: number;
  onPick: (month: number) => void;
}) {
  const top = Math.max(1, ...months.map((m) => m.demandKwh));
  const pct = (v: number) => `${(v / top) * 100}%`;
  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 ${l.mark}`} />
            {l.label}
          </li>
        ))}
      </ul>
      <ol className="flex h-40 items-end gap-1 sm:h-48 sm:gap-2" aria-label="Month by month">
        {months.map((m, i) => (
          <li key={MONTH_NAMES[i]} className="flex h-full flex-1 flex-col justify-end">
            <button
              type="button"
              aria-pressed={i === month}
              aria-label={`${MONTH_NAMES[i]}: ${mwh(m.servedKwh)} MWh from the servers, ${mwh(m.backupKwh)} MWh backup`}
              onClick={() => onPick(i)}
              className={`group flex h-full w-full flex-col justify-end rounded-md px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-glacier ${i === month ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"}`}
            >
              <span
                className="block w-full rounded-t-[3px] bg-glacier"
                style={{ height: pct(m.backupKwh) }}
              />
              <span className="mt-0.5 block w-full bg-ember" style={{ height: pct(m.servedKwh) }} />
            </button>
          </li>
        ))}
      </ol>
      <ol className="mt-1.5 flex gap-1 text-center text-[10px] text-muted sm:gap-2" aria-hidden>
        {MONTH_NAMES.map((name, i) => (
          <li key={name} className={`flex-1 ${i === month ? "font-semibold text-ink" : ""}`}>
            {name.slice(0, 3)}
          </li>
        ))}
      </ol>
    </figure>
  );
}
