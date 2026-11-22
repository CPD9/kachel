import type { Day } from "./day";
import { clock, kwh } from "./format";
import { Sources } from "./Sources";

const LEGEND = [
  { label: "Heat from your servers", mark: "bg-ember" },
  { label: "Backup heater", mark: "bg-tertiary" },
];

/**
 * The day hour by hour: heat the servers gave the house, with the backup heater stacked on top.
 * Pointing at, focusing or tapping an hour picks it for the readout above the chart.
 */
export function DayChart({
  day,
  picked,
  onPick,
}: {
  day: Day;
  /** The hour the readout describes. */
  picked: number | undefined;
  onPick: (hour: number) => void;
}) {
  const peak = Math.max(0, ...day.hours.map((r) => (r ? r.heat_used + r.backup_kwh : 0)));
  const pct = (v: number) => `${peak > 0 ? (v / peak) * 100 : 0}%`;
  return (
    <figure>
      <ol className="flex h-56 items-end gap-0.5 sm:h-72 sm:gap-1.5" aria-label="Heat in each hour">
        {day.hours.map((r, h) => (
          <li key={h} className="flex h-full flex-1">
            <button
              type="button"
              disabled={!r}
              aria-pressed={h === picked}
              aria-label={
                r
                  ? `${clock(h)}: servers ${kwh(r.heat_used)} kWh, backup ${kwh(r.backup_kwh)} kWh`
                  : `${clock(h)}: no hour yet`
              }
              onMouseEnter={() => r && onPick(h)}
              onFocus={() => r && onPick(h)}
              onClick={() => r && onPick(h)}
              className={`relative flex h-full w-full flex-col justify-end gap-0.5 rounded-t-[3px] outline-none focus-visible:ring-2 focus-visible:ring-action ${h === picked ? "after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-label" : ""}`}
            >
              {r && r.backup_kwh > 0 && (
                <span
                  className="block w-full rounded-t-[3px] bg-tertiary"
                  style={{ height: pct(r.backup_kwh) }}
                />
              )}
              {r && r.heat_used > 0 && (
                <span
                  className={`block w-full bg-ember ${r.backup_kwh > 0 ? "" : "rounded-t-[3px]"}`}
                  style={{ height: pct(r.heat_used) }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
      <div className="relative mt-2 h-4 font-mono text-[11px] text-secondary tabular-nums">
        {[0, 6, 12, 18, 23].map((h) => (
          <span
            key={h}
            className={`absolute ${h === 0 ? "" : h === 23 ? "right-0" : "-translate-x-1/2"}`}
            style={h === 23 ? {} : { left: `${((h + 0.5) / 24) * 100}%` }}
          >
            {clock(h).slice(0, 2)}
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-label">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-2">
            <span className={`inline-block size-3 rounded-[3px] ${l.mark}`} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>
      <Sources summary="The numbers, hour by hour">
        <table className="w-full text-right text-xs text-label tabular-nums">
          <thead className="text-secondary">
            <tr>
              <th className="text-left font-normal">Hour</th>
              <th className="font-normal">Servers</th>
              <th className="font-normal">Backup</th>
              <th className="font-normal">Demand</th>
              <th className="font-normal">Tank</th>
            </tr>
          </thead>
          <tbody>
            {day.hours.map((r, h) =>
              r ? (
                <tr key={h} className="border-t border-separator">
                  <td className="py-0.5 text-left">{clock(h)}</td>
                  <td>{kwh(r.heat_used)}</td>
                  <td>{kwh(r.backup_kwh)}</td>
                  <td>{kwh(r.demand_kwh)}</td>
                  <td>{kwh(r.soc_kwh)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        <p>
          kWh in each hour, from <code>heat_state</code>: <code>heat_used</code>,{" "}
          <code>backup_kwh</code>, <code>demand_kwh</code> and <code>soc_kwh</code>.
        </p>
      </Sources>
    </figure>
  );
}
