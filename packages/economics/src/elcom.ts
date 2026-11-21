// ElCom's public electricity tariffs (strompreis.elcom.admin.ch): the GraphQL query for one or
// more municipalities by BFS number, and its answer. Used live by the map's card (prices.ts) and
// by scripts/elcom-prices.mjs, which saves Basel-Stadt's and Bern's municipalities to prices.json.
// Plain TypeScript with no imports, so Node can run it as it is.

export const ELCOM_GRAPHQL = "https://www.strompreis.elcom.admin.ch/api/graphql";
/** The tariff year, the household category (H4: 4,500 kWh a year) and the standard product. */
export const TARIFF = { period: "2027", category: "H4", product: "standard" } as const;

/** One operator's total price in one municipality, Rp per kWh without VAT. */
export interface Observation {
  readonly municipality: number;
  readonly name: string;
  readonly operator: string;
  readonly rpPerKwh: number;
}

/**
 * The query for the municipalities' totals. ElCom's API answers with an empty list unless the
 * dimension fields (period, municipality, operator, category) are asked for too.
 */
export function observationsQuery(bfs: readonly number[]): string {
  const ids = bfs.map((n) => `"${n}"`).join(",");
  return (
    `query { observations(locale: "de", filters: { period: ["${TARIFF.period}"], ` +
    `category: ["${TARIFF.category}"], product: ["${TARIFF.product}"], municipality: [${ids}] }, ` +
    `observationKind: Municipality) { ... on OperatorObservation { period municipality ` +
    `municipalityLabel operator operatorLabel category value(priceComponent: total) } } }`
  );
}

export function parseObservations(body: unknown): Observation[] {
  const data = (body as { data?: { observations?: unknown } } | null)?.data?.observations;
  if (!Array.isArray(data)) return [];
  return data.flatMap((o: unknown) => {
    const r = o as Record<string, unknown>;
    const municipality = Number(r.municipality);
    const value = r.value;
    if (!Number.isFinite(municipality) || typeof value !== "number" || !Number.isFinite(value))
      return [];
    return [
      {
        municipality,
        name: typeof r.municipalityLabel === "string" ? r.municipalityLabel : String(municipality),
        operator: typeof r.operatorLabel === "string" ? r.operatorLabel : "",
        rpPerKwh: value,
      },
    ];
  });
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** One municipality's price: the median over its operators (most have one). */
export interface MunicipalityPrice {
  readonly name: string;
  readonly operators: readonly string[];
  readonly rpPerKwh: number;
}

export function byMunicipality(obs: readonly Observation[]): Record<string, MunicipalityPrice> {
  const out: Record<string, MunicipalityPrice> = {};
  for (const id of [...new Set(obs.map((o) => o.municipality))].sort((a, b) => a - b)) {
    const mine = obs.filter((o) => o.municipality === id);
    out[String(id)] = {
      name: mine[0]?.name ?? String(id),
      operators: [...new Set(mine.map((o) => o.operator))],
      rpPerKwh: median(mine.map((o) => o.rpPerKwh)) ?? 0,
    };
  }
  return out;
}

/** ElCom's Swiss median for the same year, category and product. */
export function swissMedianQuery(): string {
  return (
    `query { swissMedianObservations(locale: "de", filters: { period: ["${TARIFF.period}"], ` +
    `category: ["${TARIFF.category}"], product: ["${TARIFF.product}"] }) ` +
    `{ ... on SwissMedianObservation { value(priceComponent: total) } } }`
  );
}

export function parseSwissMedian(body: unknown): number | null {
  const list = (body as { data?: { swissMedianObservations?: unknown } } | null)?.data
    ?.swissMedianObservations;
  if (!Array.isArray(list)) return null;
  const v = (list[0] as { value?: unknown } | undefined)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
