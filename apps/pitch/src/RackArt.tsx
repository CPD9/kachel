import type { Rack } from "./sizing";

/** How many server units each model shows, and how many cabinets stand side by side. */
const LOOK: Record<string, { units: number; cabinets: number }> = {
  s: { units: 4, cabinets: 1 },
  m: { units: 7, cabinets: 1 },
  l: { units: 10, cabinets: 1 },
  xl: { units: 10, cabinets: 2 },
};

const UNIT = 9;
const W = 62;
/** The side panel, drawn in a simple oblique projection. */
const DX = 20;
const DY = 11;
const FLOOR = 150;

/** One cabinet: side, top, glass front, servers with blinking lights, and the Kachel plate. */
function Cabinet({ x, units, seed }: { x: number; units: number; seed: number }) {
  const h = 22 + units * UNIT;
  const top = FLOOR - h;
  return (
    <g>
      {/* Side panel and top */}
      <polygon
        points={`${x + W},${top} ${x + W + DX},${top - DY} ${x + W + DX},${FLOOR - DY} ${x + W},${FLOOR}`}
        fill="#17191d"
      />
      <polygon
        points={`${x},${top} ${x + DX},${top - DY} ${x + W + DX},${top - DY} ${x + W},${top}`}
        fill="#3a3e45"
      />
      {/* Side vents */}
      {Array.from({ length: Math.floor(units / 2) }, (_, i) => (
        <line
          key={i}
          x1={x + W + 5}
          y1={top + 14 + i * UNIT * 2 - 3}
          x2={x + W + DX - 5}
          y2={top + 14 + i * UNIT * 2 - 3 - DY + 4}
          stroke="#2a2d33"
          strokeWidth="2"
        />
      ))}
      {/* Front frame */}
      <rect x={x} y={top} width={W} height={h} rx="2" fill="#262a30" />
      <rect x={x + 3} y={top + 12} width={W - 6} height={h - 15} rx="1.5" fill="#0f1114" />
      {/* Kachel plate */}
      <rect x={x + 3} y={top + 3} width={W - 6} height="6" rx="1" fill="#ea580c" />
      <text
        x={x + W / 2}
        y={top + 7.9}
        textAnchor="middle"
        fontSize="4.6"
        fontWeight="700"
        letterSpacing="1.2"
        fill="#fff"
      >
        KACHEL
      </text>
      {/* Servers */}
      {Array.from({ length: units }, (_, i) => {
        const y = top + 14 + i * UNIT;
        return (
          <g key={i}>
            <rect x={x + 5} y={y} width={W - 10} height={UNIT - 2} rx="1" fill="#1d2025" />
            <line
              x1={x + 22}
              y1={y + 3.5}
              x2={x + W - 8}
              y2={y + 3.5}
              stroke="#2b2f36"
              strokeWidth="2.5"
              strokeDasharray="1.5 1.5"
            />
            {[0, 1, 2].map((k) => (
              <circle
                key={k}
                cx={x + 9 + k * 4}
                cy={y + 3.5}
                r="1.1"
                fill={k === 2 ? "#fbbf24" : k === 1 && (i + seed) % 3 === 0 ? "#f97316" : "#4ade80"}
                style={{
                  animation: `led ${0.7 + ((i * 7 + k * 3 + seed) % 9) / 6}s ease-in-out infinite`,
                  animationDelay: `${((i * 5 + k * 11 + seed) % 10) / 10}s`,
                }}
              />
            ))}
          </g>
        );
      })}
      {/* Glass door reflection */}
      <polygon
        points={`${x + 3},${top + 12} ${x + 22},${top + 12} ${x + 3},${top + 50}`}
        fill="#ffffff"
        opacity="0.06"
      />
    </g>
  );
}

/** Wavy line of warm air drifting up. */
function Heat({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <path
      d={`M${x} ${y} q4 -5 0 -10 q-4 -5 0 -10`}
      fill="none"
      stroke="#f97316"
      strokeWidth="2.2"
      strokeLinecap="round"
      style={{ animation: "heat-rise 2.4s ease-in-out infinite", animationDelay: `${delay}s` }}
    />
  );
}

/** An illustration of the picked Kachel rack: one or two cabinets, warm air rising off the top. */
export function RackArt({ rack }: { rack: Rack }) {
  const { units, cabinets } = LOOK[rack.id] ?? { units: 10, cabinets: 1 };
  const span = cabinets * W + (cabinets - 1) * 6 + DX;
  const x0 = (200 - span) / 2;
  const top = FLOOR - 22 - units * UNIT;
  return (
    <svg viewBox="0 0 200 165" className="size-full" role="img" aria-label={rack.name}>
      <defs>
        <radialGradient id="rack-glow" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stopColor="#ea580c" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Warm glow above, and the shadow on the floor */}
      <ellipse cx="100" cy={top - 4} rx={span / 1.4} ry="30" fill="url(#rack-glow)" />
      <ellipse cx={100 + DX / 2} cy={FLOOR + 2} rx={span / 1.7} ry="6" fill="#000" opacity="0.16" />
      {Array.from({ length: cabinets }, (_, c) => (
        <Cabinet key={c} x={x0 + c * (W + 6)} units={units} seed={c * 4} />
      ))}
      {[0.15, 0.45, 0.75].map((f, i) => (
        <Heat key={f} x={x0 + DX / 2 + (span - DX) * f} y={top - DY - 3} delay={i * 0.7} />
      ))}
    </svg>
  );
}
