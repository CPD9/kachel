import { useState, type ReactNode } from "react";

/** Calm tints for the bars: system blue, teal and grey; ember only for heat. */
export const TONE = {
  heat: "bg-ember",
  blue: "bg-blue",
  teal: "bg-teal",
  grey: "bg-grey/45",
  light: "bg-grey/20",
} as const;
export type Tone = keyof typeof TONE;

export interface Segment {
  label: string;
  value: number;
  tone: Tone;
}

/** A change against the month before: ▲ 3 pts, ▼ 12 %. Grey, never green or red. */
export function Delta({
  change,
  unit,
  against,
}: {
  change: number;
  unit: "pts" | "%";
  against: string;
}) {
  // Points for shares, per cent for francs and kWh: both are the change × 100, rounded.
  const shown = Math.round(change * 100);
  const flat = shown === 0;
  return (
    <span
      data-delta
      title={`Against ${against}, same model`}
      className="ml-2 text-[13px] font-medium whitespace-nowrap text-label-2 tabular-nums"
    >
      <span aria-hidden>{flat ? "±" : shown > 0 ? "▲" : "▼"}</span>
      <span className="sr-only">{flat ? "Level" : shown > 0 ? "Up" : "Down"} </span>
      {flat ? `0 ${unit}` : ` ${Math.abs(shown)} ${unit}`}
      <span className="sr-only"> against {against}</span>
    </span>
  );
}

/** Relative change, for francs and kWh. */
export const relative = (now: number, before: number) => (before !== 0 ? now / before - 1 : 0);

/** A thin bar in segments with a tiny legend under it. */
export function SegmentBar({ segments, thin }: { segments: Segment[]; thin?: boolean }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return (
    <div>
      <div
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)} %`)
          .join(", ")}
        className={`flex w-full gap-[2px] overflow-hidden rounded-full ${thin ? "h-1.5" : "h-2.5"}`}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.label}
              className={`block h-full first:rounded-l-full last:rounded-r-full ${TONE[s.tone]}`}
              style={{ width: `${(s.value / total) * 100}%`, minWidth: 3 }}
            />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tracking-wide text-label-2 uppercase">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1">
            <span className={`inline-block size-1.5 rounded-full ${TONE[s.tone]}`} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A small title with its info dot. Hover shows the note; a tap or click opens it under the title,
 * so it works on a phone too.
 */
export function InfoTitle({
  id,
  children,
  info,
}: {
  id: string;
  children: ReactNode;
  info: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h3 id={id} className="flex items-center gap-1.5 text-[14px] font-semibold">
        {children}
        <button
          type="button"
          title={info}
          aria-label={`About ${typeof children === "string" ? children : "this figure"}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="-m-2 inline-flex size-[22px] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <span className="inline-block size-1.5 rounded-full bg-label" />
        </button>
      </h3>
      {open && (
        <p className="mt-1 rounded-lg bg-surface px-2.5 py-1.5 text-[12px] text-label">{info}</p>
      )}
    </>
  );
}

/**
 * One KPI as in Peter's reference: title with an info dot, a grey line saying what it counts, the
 * big figure with its delta, and a segmented bar. `small` for the two under the main one.
 */
export function Kpi({
  id,
  title,
  reading,
  info,
  explain,
  value,
  delta,
  segments,
  small,
}: {
  id: string;
  title: string;
  /** The data-reading name the tests and the tour read the figure by. */
  reading: string;
  info: string;
  explain: ReactNode;
  value: string;
  delta: ReactNode;
  segments: Segment[];
  small?: boolean;
}) {
  return (
    <div aria-labelledby={id} role="group" data-kpi={id}>
      <InfoTitle id={id} info={info}>
        {title}
      </InfoTitle>
      <p className="mt-0.5 text-[13px] leading-snug text-label-2">{explain}</p>
      <p className="mt-2 flex items-baseline">
        <span
          data-reading={reading}
          className={`font-semibold tracking-tight tabular-nums ${small ? "text-[24px]" : "text-[34px] leading-none"}`}
        >
          <span data-value>{value}</span>
        </span>
        {delta}
      </p>
      <div className={small ? "mt-2" : "mt-3"}>
        <SegmentBar segments={segments} thin={small === true} />
      </div>
    </div>
  );
}

/** A white KPI card: the main figure, and two smaller ones side by side under it. */
export function KpiCard({ main, pair }: { main: ReactNode; pair?: [ReactNode, ReactNode] }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05] sm:p-6">
      {main}
      {pair && (
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-sep/60 pt-5 sm:grid-cols-2">
          {pair[0]}
          {pair[1]}
        </div>
      )}
    </section>
  );
}
