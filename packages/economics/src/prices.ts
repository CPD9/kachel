// Electricity price per municipality (#159): ElCom's 2027 household tariff for the building's
// municipality, asked live at click and cached; without an answer, the saved tariffs for
// Basel-Stadt and Bern (prices.json, scripts/elcom-prices.mjs); else ElCom's Swiss median.
import saved from "./prices.json" with { type: "json" };
import {
  ELCOM_GRAPHQL,
  TARIFF,
  byMunicipality,
  observationsQuery,
  parseObservations,
} from "./elcom";

export interface Price {
  readonly chfPerKwh: number;
  /** The municipality the price is for; null for the Swiss median. */
  readonly municipality: string | null;
  readonly operators: readonly string[];
  /** Where it comes from, for the card. */
  readonly source: string;
  readonly kind: "live" | "saved" | "median";
}

const TAG = `ElCom ${TARIFF.period} ${TARIFF.category}`;
const savedTariffs = saved.municipalities as Record<
  string,
  { name: string; operators: string[]; rpPerKwh: number }
>;

/** ElCom's Swiss median for the year, the price when nothing else is known. */
export const SWISS_MEDIAN: Price = {
  chfPerKwh: saved.swissMedianRpPerKwh / 100,
  municipality: null,
  operators: [],
  source: `${TAG} Swiss median (saved ${saved.fetched})`,
  kind: "median",
};

/** The saved price for a municipality, else the Swiss median. No network. */
export function savedPrice(bfs: number | null): Price {
  const m = bfs === null ? undefined : savedTariffs[String(bfs)];
  if (m === undefined) return SWISS_MEDIAN;
  return {
    chfPerKwh: m.rpPerKwh / 100,
    municipality: m.name,
    operators: m.operators,
    source: `${TAG}, ${m.operators.join(", ")} (saved ${saved.fetched})`,
    kind: "saved",
  };
}

export type Post = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const live = new Map<number, Promise<Price>>();

/**
 * The building's municipality's price, asked from ElCom's API at `url` once per municipality and
 * session. Falls back to the saved price, then the Swiss median; a failed answer is asked again
 * on the next call.
 */
export function electricityPrice(
  bfs: number | null,
  post: Post,
  url: string = ELCOM_GRAPHQL,
): Promise<Price> {
  if (bfs === null) return Promise.resolve(SWISS_MEDIAN);
  const hit = live.get(bfs);
  if (hit !== undefined) return hit;
  const job = post(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: observationsQuery([bfs]) }),
  })
    .then(async (res) => (res.ok ? parseObservations(await res.json()) : []))
    .catch(() => [])
    .then((obs): Price => {
      const m = byMunicipality(obs)[String(bfs)];
      if (m === undefined) return savedPrice(bfs);
      return {
        chfPerKwh: m.rpPerKwh / 100,
        municipality: m.name,
        operators: m.operators,
        source: `${TAG}, ${m.operators.join(", ")} (live)`,
        kind: "live",
      };
    });
  live.set(bfs, job);
  void job.then((p) => {
    if (p.kind !== "live") live.delete(bfs);
  });
  return job;
}

/** For tests. */
export function clearPriceCache(): void {
  live.clear();
}
