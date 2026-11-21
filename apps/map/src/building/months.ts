export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Days in each month of a common year. */
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Spreads a building's yearly heat over the months: space heating in proportion to the heating
 * degree days Sonnendach gives for its roof, hot water by the days in each month. The twelve
 * months add up to the year. With no degree days at all, heating is spread like hot water.
 */
export function monthlyHeat(
  heatingKwh: number,
  hotWaterKwh: number,
  degreeDays: readonly number[],
): number[] {
  const dd = DAYS.map((_, i) => Math.max(0, degreeDays[i] ?? 0));
  const ddTotal = dd.reduce((a, b) => a + b, 0);
  const heatingShare = ddTotal > 0 ? dd.map((d) => d / ddTotal) : DAYS.map((d) => d / 365);
  return DAYS.map((days, i) => heatingKwh * (heatingShare[i] ?? 0) + hotWaterKwh * (days / 365));
}
