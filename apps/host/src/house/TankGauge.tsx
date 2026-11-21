import { Sourced } from "@kachel/ui";
import { kwh } from "./format";

/** The hot-water tank as a vertical gauge: how much heat is stored of what it can hold. */
export function TankGauge({
  kwhNow,
  capacity,
  at,
}: {
  kwhNow: number;
  capacity: number;
  at: string;
}) {
  const share = Math.max(0, Math.min(1, kwhNow / capacity));
  const pct = Math.round(share * 100);
  return (
    <figure className="flex flex-col items-center gap-2">
      <figcaption className="text-xs font-medium tracking-wide text-muted uppercase">
        Tank
      </figcaption>
      <div className="flex items-stretch gap-1.5">
        <div
          role="meter"
          aria-label="Heat in the tank"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={kwhNow}
          aria-valuetext={`${kwh(kwhNow)} of ${kwh(capacity)} kWh, ${pct}%`}
          className="relative h-32 w-12 overflow-hidden rounded-md border border-slate/70 bg-grid/40 sm:h-36 sm:w-14"
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-amber motion-safe:transition-[height] motion-safe:duration-700"
            style={{ height: `${share * 100}%` }}
          />
          {[25, 50, 75].map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-ink/15"
              style={{ bottom: `${t}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col justify-between py-0.5 text-[10px] text-muted tabular-nums">
          <span>{kwh(capacity)}</span>
          <span>0</span>
        </div>
      </div>
      <Sourced
        align="right"
        className="text-sm font-semibold tabular-nums"
        source={
          <>
            <code>heat_state.soc_kwh</code> at the end of {at}, of <code>sites.tank_kwh</code>. The
            tank size is the case brief&apos;s reference house (assumptions:{" "}
            <code>house.tank_kwh</code>).
          </>
        }
      >
        {pct}%
      </Sourced>
      <span className="-mt-1 text-xs text-muted tabular-nums">
        {kwh(kwhNow)} of {kwh(capacity)} kWh
      </span>
    </figure>
  );
}
