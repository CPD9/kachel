/**
 * ElCom's tariff for one municipality, for the building card on the deployed map (Vercel
 * function at /api/elcom?bfs=2701). ElCom's API rejects calls from other sites, so the map asks
 * here and this asks ElCom. Only one fixed query is ever sent: the 2027 H4 standard totals for
 * the given BFS number, never a query from the caller, so this is not an open proxy.
 * In dev the Vite server's /elcom proxy does the same job (vite.config.ts).
 */

const ELCOM_GRAPHQL = "https://www.strompreis.elcom.admin.ch/api/graphql";
/** Kept in step with packages/economics/src/elcom.ts (src/elcom-api.test.ts checks it). */
const TARIFF = { period: "2027", category: "H4", product: "standard" } as const;
/** A tariff changes once a year; a day is plenty. */
const DAY_S = 86_400;
const TIMEOUT_MS = 8_000;

/** The same query as observationsQuery([bfs]) in packages/economics/src/elcom.ts. */
export function elcomQuery(bfs: number): string {
  return (
    `query { observations(locale: "de", filters: { period: ["${TARIFF.period}"], ` +
    `category: ["${TARIFF.category}"], product: ["${TARIFF.product}"], municipality: ["${bfs}"] }, ` +
    `observationKind: Municipality) { ... on OperatorObservation { period municipality ` +
    `municipalityLabel operator operatorLabel category value(priceComponent: total) } } }`
  );
}

/** A Swiss municipality's BFS number (1 to 9999), else null. */
export function parseBfs(raw: string | null): number | null {
  if (raw === null || !/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

/** The handler, with ElCom's fetch passed in for tests. */
export const elcomHandler =
  (post: typeof fetch) =>
  async (request: Request): Promise<Response> => {
    const bfs = parseBfs(new URL(request.url).searchParams.get("bfs"));
    if (bfs === null) return json({ error: "bfs must be a municipality number" }, 400, "no-store");
    try {
      const res = await post(ELCOM_GRAPHQL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: elcomQuery(bfs) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return json({ error: "ElCom did not answer" }, 502, "no-store");
      // GraphQL answers 200 with { errors } too: only a list of observations is kept
      const body = (await res.json()) as { data?: { observations?: unknown } } | null;
      if (!Array.isArray(body?.data?.observations))
        return json({ error: "ElCom did not answer" }, 502, "no-store");
      // Cached by the browser and Vercel's edge for a day; the card falls back on its saved tariff
      return json(
        body,
        200,
        `public, max-age=${DAY_S}, s-maxage=${DAY_S}, stale-while-revalidate=${DAY_S}`,
      );
    } catch {
      return json({ error: "ElCom did not answer" }, 502, "no-store");
    }
  };

export const GET = elcomHandler((input, init) => fetch(input, init));
