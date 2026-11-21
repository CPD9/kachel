import { ZONE } from "./day";

const one = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 9.8 */
export const kwh = (v: number) => one.format(v);
/** −3.8 with a real minus sign. */
export const celsius = (v: number) => one.format(v).replace("-", "−");
/** CHF 72.00 for a day, CHF 15,538 for a year. */
export const chf = (v: number, year = false) => `CHF ${(year ? whole : cents).format(Math.abs(v))}`;
export const count = (v: number) => whole.format(v);

/** 13 January 2025, in Basel. */
export const longDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: ZONE }).format(
    new Date(`${date}T12:00:00Z`),
  );
/** 13 Jan */
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: ZONE }).format(
    new Date(`${date}T12:00:00Z`),
  );
/** 14:00 */
export const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
