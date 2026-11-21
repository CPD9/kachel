/**
 * GWR codes in plain English, from the BFS feature catalogue 4.2 (Merkmalskatalog), as listed in
 * Canton Aargau's guide "Bereinigung Energiedaten GWR", Anhang 2.
 */

/** GENH1 / GENW1: the energy source for heating or hot water. */
export const ENERGY_SOURCE: Readonly<Record<number, string>> = {
  7500: "none",
  7501: "air (heat pump)",
  7510: "ground heat",
  7511: "ground heat (borehole)",
  7512: "ground heat (collector)",
  7513: "water (ground or surface)",
  7520: "gas",
  7530: "heating oil",
  7540: "wood",
  7541: "wood (logs)",
  7542: "wood (pellets)",
  7543: "wood (chips)",
  7550: "waste heat",
  7560: "electricity",
  7570: "solar thermal",
  7580: "district heating",
  7581: "district heating (high temperature)",
  7582: "district heating (low temperature)",
  7598: "not known",
  7599: "other",
};

/** GBAUP: the period the building was built in. */
export const BUILD_PERIOD: Readonly<Record<number, string>> = {
  8011: "before 1919",
  8012: "1919–1945",
  8013: "1946–1960",
  8014: "1961–1970",
  8015: "1971–1980",
  8016: "1981–1985",
  8017: "1986–1990",
  8018: "1991–1995",
  8019: "1996–2000",
  8020: "2001–2005",
  8021: "2006–2010",
  8022: "2011–2015",
  8023: "2016 or later",
};

/** How a heating energy source turns into energy bought, for the "energy use" line. */
export type SourceKind = "heat pump" | "boiler" | "district" | "electric" | "solar" | "unknown";

export function sourceKind(code: number | null): SourceKind {
  if (code === null) return "unknown";
  if (code === 7501 || (code >= 7510 && code <= 7513)) return "heat pump";
  if (code === 7520 || code === 7530 || (code >= 7540 && code <= 7543)) return "boiler";
  if (code === 7550 || (code >= 7580 && code <= 7582)) return "district";
  if (code === 7560) return "electric";
  if (code === 7570) return "solar";
  return "unknown";
}
