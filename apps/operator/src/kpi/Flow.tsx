import { useEffect, useRef, useState } from "react";
import type { Tone } from "./Kpi";

export interface FlowNode {
  id: string;
  label: string;
  value: number;
  /** The figure on the node's tag: "276 MWh", "CHF 12'400". */
  tag: string;
  tone: Tone;
}

export interface FlowLink {
  from: string;
  to: string;
  value: number;
  tone: Tone;
}

/** The SVG colours of the tones: the system colours from index.css. */
const FILL: Record<Tone, string> = {
  heat: "var(--color-ember)",
  blue: "var(--color-blue)",
  teal: "var(--color-teal)",
  grey: "var(--color-grey)",
  light: "var(--color-grey)",
};
const BAND: Record<Tone, number> = { heat: 0.22, blue: 0.16, teal: 0.2, grey: 0.16, light: 0.1 };

const NODE_W = 5;
const GAP = 34;
const TOP = 8;

interface Placed extends FlowNode {
  x: number;
  y: number;
  h: number;
  col: number;
}

/** Stack each column's nodes top-down, every column on one scale so the bands keep their size. */
export function layout(columns: FlowNode[][], width: number, height: number) {
  const most = Math.max(...columns.map((c) => c.reduce((s, n) => s + n.value, 0)), 1);
  const gaps = Math.max(...columns.map((c) => c.length - 1));
  const scale = (height - TOP * 2 - gaps * GAP) / most;
  const step = columns.length > 1 ? (width - NODE_W) / (columns.length - 1) : 0;
  const nodes = new Map<string, Placed>();
  columns.forEach((col, c) => {
    let y = TOP;
    for (const n of col) {
      const h = Math.max(2, n.value * scale);
      nodes.set(n.id, { ...n, x: c * step, y, h, col: c });
      y += h + GAP;
    }
  });
  return { nodes, scale };
}

function band(x0: number, y0: number, x1: number, y1: number, h: number) {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h} Z`;
}

/**
 * A full-width flow in plain SVG, Sankey style: columns of nodes as thin bars, bands between them
 * as wide as what flows. Laid out in the card's own pixels so the labels stay readable on a phone.
 */
export function Flow({
  label,
  columns,
  links,
  height = 280,
}: {
  label: string;
  columns: FlowNode[][];
  links: FlowLink[];
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, scale } = layout(columns, width, width < 560 ? Math.round(height * 0.7) : height);
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  const last = columns.length - 1;
  // Too narrow for labels beside the bands (a phone): the labels go in a list under the flow.
  const narrow = width < 560;

  return (
    <div ref={box} className="w-full">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={narrow ? Math.round(height * 0.7) : height}
        viewBox={`0 0 ${width} ${narrow ? Math.round(height * 0.7) : height}`}
        className="block overflow-visible"
      >
        {links
          .filter((l) => l.value > 0)
          .map((l) => {
            const a = nodes.get(l.from);
            const b = nodes.get(l.to);
            if (!a || !b) return null;
            const h = Math.max(1, l.value * scale);
            const y0 = a.y + (out.get(a.id) ?? 0);
            const y1 = b.y + (into.get(b.id) ?? 0);
            out.set(a.id, (out.get(a.id) ?? 0) + h);
            into.set(b.id, (into.get(b.id) ?? 0) + h);
            return (
              <path
                key={`${l.from}-${l.to}`}
                d={band(a.x + NODE_W, y0, b.x, y1, h)}
                fill={FILL[l.tone]}
                fillOpacity={BAND[l.tone]}
              />
            );
          })}
        {[...nodes.values()].map((n) => {
          if (narrow)
            return (
              <rect
                key={n.id}
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={n.h}
                rx={2}
                fill={FILL[n.tone]}
              />
            );
          const right = n.col === last && last > 0;
          const tx = right ? n.x - 8 : n.x + NODE_W + 8;
          const anchor = right ? "end" : "start";
          const ty = n.y + Math.min(n.h / 2, 14) + 4;
          const tagW = n.tag.length * 6.6 + 12;
          return (
            <g key={n.id} data-flow-node={n.id}>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={FILL[n.tone]} />
              <text
                x={tx}
                y={ty}
                textAnchor={anchor}
                className="fill-label text-[11px] font-semibold tracking-wide uppercase"
              >
                {n.label}
              </text>
              <rect
                x={right ? tx - tagW : tx}
                y={ty + 5}
                width={tagW}
                height={18}
                rx={5}
                fill={FILL[n.tone]}
                fillOpacity={0.14}
              />
              <text
                x={right ? tx - 6 : tx + 6}
                y={ty + 18}
                textAnchor={anchor}
                className="fill-label text-[11px] font-semibold tabular-nums"
              >
                {n.tag}
              </text>
            </g>
          );
        })}
      </svg>
      {narrow && (
        <ol className="mt-4 grid grid-cols-1 gap-2 text-[13px]">
          {columns.flat().map((n) => (
            <li
              key={n.id}
              data-flow-node={n.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-1 rounded-sm"
                  style={{ background: FILL[n.tone] }}
                />
                {n.label}
              </span>
              <span className="font-semibold tabular-nums">{n.tag}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
