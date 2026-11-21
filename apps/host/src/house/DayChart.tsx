import type { Day } from "./day";
import { clock, kwh } from "./format";

/** A round top for the axis: 2, 5 or 10 kWh steps. */
function axisTop(peak: number) {
  const step = peak <= 2 ? 0.5 : peak <= 6 ? 2 : peak <= 15 ? 5 : 10;
  return Math.max(step, Math.ceil(peak / step) * step);
}

const LEGEND = [
  { label: "Heat from the servers", mark: "h-3 rounded-sm bg-ember" },
  { label: "Backup heater", mark: "h-3 rounded-sm bg-glacier" },
  { label: "Heat demand", mark: "h-0.5 bg-ink" },
];

/**
 * The day hour by hour: heat the servers gave the house, the backup heater stacked on top,
 * and the house's demand as a line across each hour. One kWh axis for all three.
 */
export function DayChart({ day, now }: { day: Day; now: number | undefined }) {
  const peak = Math.max(
    0,
    ...day.hours.map((r) => (r ? Math.max(r.demand_kwh, r.heat_used + r.backup_kwh) : 0)),
  );
  const top = axisTop(peak);
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
      <div className="flex gap-2">
        <div className="flex h-44 flex-col justify-between text-right text-[10px] text-muted tabular-nums sm:h-52">
          <span>{kwh(top)}</span>
          <span>{kwh(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-44 flex-1 sm:h-52">
          {[0, 50, 100].map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-grid"
              style={{ bottom: `${t}%` }}
            />
          ))}
          <ol className="absolute inset-0 flex gap-px sm:gap-0.5" aria-label="Hour by hour">
            {day.hours.map((r, h) => (
              <li
                key={h}
                tabIndex={r ? 0 : -1}
                className={`group relative flex-1 outline-none hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-glacier ${h === now ? "bg-ink/[0.06]" : ""}`}
              >
                {r && (
                  <>
                    <div
                      className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-0.5"
                      style={{ height: pct(r.heat_used + r.backup_kwh) }}
                    >
                      {r.backup_kwh > 0 && (
                        <div
                          className="basis-0 rounded-t-[3px] bg-glacier"
                          style={{ flexGrow: r.backup_kwh }}
                        />
                      )}
                      {r.heat_used > 0 && (
                        <div
                          className={`basis-0 bg-ember ${r.backup_kwh > 0 ? "" : "rounded-t-[3px]"}`}
                          style={{ flexGrow: r.heat_used }}
                        />
                      )}
                    </div>
                    <div
                      className="absolute -inset-x-px h-0.5 bg-ink"
                      style={{ bottom: `calc(${pct(r.demand_kwh)} - 1px)` }}
                    />
                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute hidden bottom-full z-20 mb-2 w-44 rounded-md border border-grid bg-paper p-2 text-xs text-ink shadow-lg group-hover:block group-focus:block ${h >= 16 ? "right-0" : h >= 8 ? "left-1/2 -translate-x-1/2" : "left-0"}`}
                    >
                      <p className="font-semibold">{clock(h)}</p>
                      <p>Servers {kwh(r.heat_used)} kWh</p>
                      <p>Backup {kwh(r.backup_kwh)} kWh</p>
                      <p>Demand {kwh(r.demand_kwh)} kWh</p>
                      <p className="mt-1 text-muted">
                        heat_state: heat_used, backup_kwh, demand_kwh
                      </p>
                    </div>
                  </>
                )}
                {h === now && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-ink">
                    now
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="ml-7 flex justify-between pt-1 text-[10px] text-muted tabular-nums">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{clock(h).slice(0, 2)}</span>
        ))}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted">The numbers, hour by hour</summary>
        <table className="mt-2 w-full text-right tabular-nums">
          <thead className="text-muted">
            <tr>
              <th className="text-left font-medium">Hour</th>
              <th className="font-medium">Servers</th>
              <th className="font-medium">Backup</th>
              <th className="font-medium">Demand</th>
              <th className="font-medium">Tank</th>
            </tr>
          </thead>
          <tbody>
            {day.hours.map((r, h) =>
              r ? (
                <tr key={h} className="border-t border-grid">
                  <td className="text-left">{clock(h)}</td>
                  <td>{kwh(r.heat_used)}</td>
                  <td>{kwh(r.backup_kwh)}</td>
                  <td>{kwh(r.demand_kwh)}</td>
                  <td>{kwh(r.soc_kwh)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        <p className="mt-1 text-muted">kWh in each hour, from heat_state.</p>
      </details>
    </figure>
  );
}
