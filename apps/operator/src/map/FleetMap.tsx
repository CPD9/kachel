import type { LiveJob } from "@kachel/db";
import { useId, useMemo } from "react";
import type { HouseMonth } from "../fleet/months";
import type { BuyerRow, PlacedSite } from "../live/live";
import { fit, place, tiles, tileUrl, type Frame } from "./project";

export const ORANGE = "#ff5a1f";
/** System blue as on a dark surface: the buyers and their live jobs. */
export const BLUE = "#0a84ff";
const ATTENTION = "#ff9500";

const W = 1120;
const H = 540;
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
    </g>
  );
}

/**
 * Basel and Bern side by side on swisstopo's map, darkened: every house of the model fleet as an
 * ember dot, fuller with the heat its servers give in the chosen month, the houses that need the
 * operator marked with their name, the houses in the database as racks, and the buyers in blue
 * between the cities, a line to each house where one of their jobs runs now (dashed: paused).
 */
export function FleetMap({
  houses,
  places,
  buyers,
  brightest,
  marked = new Map(),
}: {
  /** Houses to mark, by id, with the name to show. */
  marked?: Map<string, string>;
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

  // Name tags above each marked house, or below it when that would cover another tag.
  const labels: { id: string; name: string; at: Spot; x: number; y: number; w: number }[] = [];
  for (const h of houses) {
    const spot = marked.has(h.house.id)
      ? at(h.house.city, h.house.latitude, h.house.longitude)
      : null;
    if (!spot) continue;
    const name = marked.get(h.house.id) ?? "";
    const w = 34 + name.length * 8.4;
    const x = Math.min(Math.max(spot.x - w / 2, 8), W - w - 8);
    const hits = (y: number) =>
      labels.some((o) => Math.abs(o.y - y) < 32 && o.x < x + w && x < o.x + o.w);
    const options = [spot.y - 44, spot.y + 16, spot.y - 78, spot.y + 50];
    const y = options.find((v) => !hits(v)) ?? options[0] ?? spot.y;
    labels.push({ id: h.house.id, name, at: spot, x, y, w });
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
      aria-label="Basel and Bern: the fleet's houses, the ones that need you marked, and the compute buyers"
    >
      <defs>
        {(Object.keys(CITY) as City[]).map((c) => (
          <clipPath key={c} id={`${id}-${c}`}>
            <rect width={MAP_W} height={H} rx={22} />
          </clipPath>
        ))}
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
          <rect
            x={CITY[c] + 12}
            y={12}
            width={236}
            height={72}
            rx={14}
            fill="#000"
            fillOpacity={0.72}
          />
          <text x={CITY[c] + 24} y={44} fill="white" fontSize={26} fontWeight={600}>
            {c}
          </text>
          <text x={CITY[c] + 24} y={70} fill="white" fillOpacity={0.75} fontSize={15}>
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

      {/* The model fleet: a dot fuller with the heat the servers give this month. */}
      {houses.map((h) => {
        const s = at(h.house.city, h.house.latitude, h.house.longitude);
        if (!s) return null;
        const share = Math.min(1, h.servedKw / top);
        return (
          <g key={h.house.id}>
            <title>
              {`${h.house.name}: ${h.servedKw.toFixed(1)} kW from ${h.running.toFixed(1)} of ${h.house.servers} servers`}
            </title>
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
              stroke={BLUE}
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

      {/* The houses that need the operator, named. */}
      {labels.map((l) => (
        <g key={`mark-${l.id}`} data-marked={l.id}>
          <circle cx={l.at.x} cy={l.at.y} r={9} fill="none" stroke={ATTENTION} strokeWidth={2.5} />
          <rect x={l.x} y={l.y} width={l.w} height={28} rx={14} fill="#000" />
          <circle cx={l.x + 15} cy={l.y + 14} r={5} fill={ATTENTION} />
          <text x={l.x + 26} y={l.y + 19} fill="white" fontSize={14} fontWeight={600}>
            {l.name}
          </text>
        </g>
      ))}

      {/* The buyers, between the two cities. */}
      {nodes.map((n) => (
        <g key={n.row.buyer.id}>
          <circle cx={n.x} cy={n.y} r={14} fill="#0e1013" stroke={BLUE} strokeWidth={2.5} />
          <circle cx={n.x} cy={n.y} r={5} fill={BLUE} fillOpacity={n.row.running ? 1 : 0.35} />
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
            fill={BLUE}
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
