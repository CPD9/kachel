import type { LiveJob } from "@kachel/db";
import { useId, useMemo } from "react";
import type { HouseMonth } from "../fleet/months";
import type { BuyerRow, PlacedSite } from "../live/live";
import { fit, place, tiles, tileUrl, type Frame } from "./project";

export const ORANGE = "#ff5a1f";
export const CYAN = "#06b6d4";

const W = 1120;
const H = 640;
const MAP_W = 440;
const CITY = { Basel: 0, Bern: W - MAP_W } as const;
type City = keyof typeof CITY;

type Spot = { x: number; y: number };

function CityTiles({ frame, left, clip }: { frame: Frame; left: number; clip: string }) {
  return (
    <g clipPath={`url(#${clip})`} transform={`translate(${left} 0)`}>
      <rect width={MAP_W} height={H} fill="#16181c" />
      <g style={{ filter: "invert(1) grayscale(1) brightness(0.5) contrast(1.05)" }} opacity={0.75}>
        {tiles(frame).map((t) => (
          <image
            key={`${t.z}/${t.x}/${t.y}`}
            href={tileUrl(t)}
            x={t.left}
            y={t.top}
            width={t.size + 0.5}
            height={t.size + 0.5}
            preserveAspectRatio="none"
          />
        ))}
      </g>
      <rect width={MAP_W} height={H} fill="url(#vignette)" />
      <rect width={MAP_W} height={120} fill="url(#shade)" />
    </g>
  );
}

/**
 * Basel and Bern side by side on swisstopo's map, darkened: every house of the model fleet as an
 * orange dot that glows with the heat its servers give in the chosen month, the houses in the
 * database as racks, and the buyers in cyan between the cities, a line to each house where one
 * of their jobs runs now (dashed: paused).
 */
export function FleetMap({
  houses,
  places,
  buyers,
  brightest,
}: {
  /** The most heat one house gets from its servers in any month, kW: the brightest a dot gets. */
  brightest: number;
  houses: HouseMonth[];
  places: PlacedSite[];
  buyers: BuyerRow[];
}) {
  const id = useId().replace(/:/g, "");
  const frames = useMemo(() => {
    const out = {} as Record<City, Frame>;
    for (const city of Object.keys(CITY) as City[]) {
      const pts = [
        ...houses
          .filter((h) => h.house.city === city)
          .map((h) => ({ lat: h.house.latitude, lon: h.house.longitude })),
        ...places
          .filter((p) => p.city === city && p.latitude !== null && p.longitude !== null)
          .map((p) => ({ lat: p.latitude ?? 0, lon: p.longitude ?? 0 })),
      ];
      out[city] = fit(pts.length ? pts : [{ lat: 47.56, lon: 7.59 }], MAP_W, H, 56);
    }
    return out;
  }, [houses, places]);

  const at = (city: string, lat: number, lon: number): Spot | null => {
    if (!(city in CITY)) return null;
    const c = city as City;
    const p = place(frames[c], { lat, lon });
    return { x: p.x + CITY[c], y: p.y };
  };

  const racks = new Map<string, Spot>();
  for (const p of places) {
    if (p.latitude === null || p.longitude === null) continue;
    const s = at(p.city, p.latitude, p.longitude);
    if (s) racks.set(p.id, s);
  }

  const gap = H / (buyers.length + 1);
  const nodes = buyers.map((b, i) => ({ row: b, x: W / 2, y: gap * (i + 1) }));
  const top = Math.max(0.1, brightest);

  const link = (from: Spot, to: Spot) => {
    const mid = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`;
  };
  const live = (j: LiveJob) => (j.state === "RUNNING" || j.state === "PAUSED") && j.site_id;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label="Basel and Bern: the fleet's houses in orange, the compute buyers in cyan"
    >
      <defs>
        {(Object.keys(CITY) as City[]).map((c) => (
          <clipPath key={c} id={`${id}-${c}`}>
            <rect width={MAP_W} height={H} rx={22} />
          </clipPath>
        ))}
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e1013" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#0e1013" stopOpacity={0} />
        </linearGradient>
        <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
          <stop offset="55%" stopColor="#0e1013" stopOpacity={0} />
          <stop offset="100%" stopColor="#0e1013" stopOpacity={0.85} />
        </radialGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor={ORANGE} stopOpacity={0.9} />
          <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
        </radialGradient>
      </defs>

      {(Object.keys(CITY) as City[]).map((c) => (
        <g key={c}>
          <CityTiles frame={frames[c]} left={CITY[c]} clip={`${id}-${c}`} />
          <rect
            x={CITY[c] + 0.5}
            y={0.5}
            width={MAP_W - 1}
            height={H - 1}
            rx={22}
            fill="none"
            stroke="white"
            strokeOpacity={0.1}
          />
          <text x={CITY[c] + 24} y={44} fill="white" fontSize={26} fontWeight={600}>
            {c}
          </text>
          <text x={CITY[c] + 24} y={70} fill="white" fillOpacity={0.55} fontSize={15}>
            {houses.filter((h) => h.house.city === c).length} houses ·{" "}
            {houses.filter((h) => h.house.city === c).reduce((s, h) => s + h.house.servers, 0)}{" "}
            servers
          </text>
          <text
            x={CITY[c] + MAP_W - 16}
            y={H - 14}
            fill="white"
            fillOpacity={0.45}
            fontSize={11}
            textAnchor="end"
          >
            © swisstopo
          </text>
        </g>
      ))}

      {/* The model fleet: glow and dot grow with the heat the servers give this month. */}
      {houses.map((h) => {
        const s = at(h.house.city, h.house.latitude, h.house.longitude);
        if (!s) return null;
        const share = Math.min(1, h.servedKw / top);
        return (
          <g key={h.house.id}>
            <title>
              {`${h.house.name}: ${h.servedKw.toFixed(1)} kW from ${h.running.toFixed(1)} of ${h.house.servers} servers`}
            </title>
            <circle cx={s.x} cy={s.y} r={6 + 18 * share} fill={`url(#${id}-glow)`} />
            <circle
              cx={s.x}
              cy={s.y}
              r={2.5 + h.house.servers * 0.45}
              fill={ORANGE}
              fillOpacity={0.35 + 0.65 * share}
            />
          </g>
        );
      })}

      {/* Lines from each buyer to the racks running or holding their jobs now. */}
      {nodes.flatMap((n) =>
        n.row.jobs.filter(live).map((j) => {
          const to = racks.get(j.site_id ?? "");
          if (!to) return null;
          const from = { x: n.x + (to.x < n.x ? -14 : 14), y: n.y };
          return (
            <path
              key={j.id}
              d={link(from, to)}
              fill="none"
              stroke={CYAN}
              strokeWidth={j.state === "RUNNING" ? 2 : 1.5}
              strokeOpacity={j.state === "RUNNING" ? 0.8 : 0.45}
              strokeDasharray={j.state === "RUNNING" ? "6 6" : "2 6"}
              className={j.state === "RUNNING" ? "flow" : undefined}
            />
          );
        }),
      )}

      {/* The houses in the database: racks. */}
      {places.map((p) => {
        const s = racks.get(p.id);
        if (!s) return null;
        return (
          <g key={p.id}>
            <title>{`${p.name}, ${p.city}`}</title>
            <rect
              x={s.x - 6}
              y={s.y - 6}
              width={12}
              height={12}
              rx={3}
              fill="#0e1013"
              stroke={ORANGE}
              strokeWidth={2.5}
            />
          </g>
        );
      })}

      {/* The buyers, between the two cities. */}
      {nodes.map((n) => (
        <g key={n.row.buyer.id}>
          <circle cx={n.x} cy={n.y} r={14} fill="#0e1013" stroke={CYAN} strokeWidth={2.5} />
          <circle cx={n.x} cy={n.y} r={5} fill={CYAN} fillOpacity={n.row.running ? 1 : 0.35} />
          <text
            x={n.x}
            y={n.y + 32}
            fill="white"
            fontSize={14}
            fontWeight={600}
            textAnchor="middle"
          >
            {n.row.buyer.name}
          </text>
          <text
            x={n.x}
            y={n.y + 49}
            fill={CYAN}
            fontSize={12}
            textAnchor="middle"
            className="tabular-nums"
          >
            {n.row.running} running · {n.row.paused} paused
          </text>
        </g>
      ))}
    </svg>
  );
}
