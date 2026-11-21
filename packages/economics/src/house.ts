// House quality (#159): a building's yearly heat from its heated floor area and the period it was
// built in, as the building register (GWR) gives them. The numbers and their sources live in
// services/scheduler/config.json (house_quality); heatsched/house.py reads the same block.
import config from "../../../services/scheduler/config.json" with { type: "json" };

const Q = config.house_quality;

export type PeriodId = keyof typeof Q.period_factor;
/** What the building is used for, by GWR class: its space heating and hot water per m². */
export type HouseKind = keyof typeof Q.space_heating_kwh_per_m2;

/** The periods, oldest first, with the words the card shows. */
export const PERIODS: readonly { id: PeriodId; label: string }[] = [
  { id: "before_1919", label: "before 1919" },
  { id: "1919_1945", label: "1919–1945" },
  { id: "1946_1960", label: "1946–1960" },
  { id: "1961_1970", label: "1961–1970" },
  { id: "1971_1980", label: "1971–1980" },
  { id: "1981_1990", label: "1981–1990" },
  { id: "1991_2000", label: "1991–2000" },
  { id: "2001_2005", label: "2001–2005" },
  { id: "2006_2010", label: "2006–2010" },
  { id: "2011_2015", label: "2011–2015" },
  { id: "after_2015", label: "after 2015" },
];

/** GWR gbaup codes (BFS feature catalogue 4.2); the register splits the 1980s and 1990s in two. */
const GBAUP: Readonly<Record<number, PeriodId>> = {
  8011: "before_1919",
  8012: "1919_1945",
  8013: "1946_1960",
  8014: "1961_1970",
  8015: "1971_1980",
  8016: "1981_1990",
  8017: "1981_1990",
  8018: "1991_2000",
  8019: "1991_2000",
  8020: "2001_2005",
  8021: "2006_2010",
  8022: "2011_2015",
  8023: "after_2015",
};

/** Last year of each period but the newest. */
const ENDS = [1918, 1945, 1960, 1970, 1980, 1990, 2000, 2005, 2010, 2015];

/** The period from the GWR year built (gbauj) or, without one, its period code (gbaup). */
export function periodOf(gbaup: number | null, gbauj: number | null = null): PeriodId | null {
  if (gbauj !== null) {
    const at = ENDS.findIndex((end) => gbauj <= end);
    return PERIODS[at === -1 ? PERIODS.length - 1 : at]?.id ?? null;
  }
  return gbaup === null ? null : (GBAUP[gbaup] ?? null);
}

export function periodLabel(period: PeriodId): string {
  return PERIODS.find((p) => p.id === period)?.label ?? period;
}

/** GWR building class (gklas) to the use whose figures it takes (Egon AG for SFOE, Tabelle 1). */
const USE_OF_GKLAS: Readonly<Record<number, HouseKind>> = {
  1110: "single",
  1121: "single",
  1122: "multi",
  1130: "multi",
  1211: "multi",
  1212: "multi",
  1220: "office",
  1230: "shop",
  1231: "restaurant",
  1251: "industry",
  1261: "assembly",
  1272: "assembly",
  1262: "school",
  1263: "school",
  1264: "hospital",
  1265: "sport",
};

/** The use a GWR class takes its figures from; null for classes the table gives no heat (garages, barns). */
export function kindOf(gklas: number | null): HouseKind | null {
  return gklas === null ? null : (USE_OF_GKLAS[gklas] ?? null);
}

/** The words the card shows for a use. */
export const USE_LABEL: Readonly<Record<HouseKind, string>> = {
  single: "single-family house",
  multi: "flats",
  office: "offices",
  shop: "shops",
  restaurant: "restaurant",
  industry: "industry",
  assembly: "hall or church",
  school: "school, museum or library",
  hospital: "hospital",
  sport: "sports hall",
};

export interface HeatDemand {
  spaceHeatingKwh: number;
  hotWaterKwh: number;
  totalKwh: number;
}

/** A period's space heating against the stock's mean, after a renovation if there was one. */
export function periodFactor(period: PeriodId, renovated = false): number {
  const f = Q.period_factor[period];
  return renovated ? Math.max(f * Q.renovated_factor, Q.period_factor.after_2015) : f;
}

/**
 * Space heating and hot water a year, kWh, for a building of `areaM2` heated floor built in
 * `period`. A renovation halves space heating, but never below a new building's.
 */
export function heatDemand(
  areaM2: number,
  period: PeriodId,
  renovated = false,
  kind: HouseKind = "single",
): HeatDemand {
  const spaceHeatingKwh =
    areaM2 * Q.space_heating_kwh_per_m2[kind] * periodFactor(period, renovated);
  const hotWaterKwh = areaM2 * Q.hot_water_kwh_per_m2[kind];
  return { spaceHeatingKwh, hotWaterKwh, totalKwh: spaceHeatingKwh + hotWaterKwh };
}

/** Where the figures come from, short enough for the card. */
export const HOUSE_SOURCE =
  "SIA 2024 stock means by period, as SFOE's Sonnendach uses them (Meteotest 2022, Egon AG 2021); renovation halves space heating (EnergieSchweiz, 2019)";
