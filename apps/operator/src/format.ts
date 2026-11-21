const one = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** 9.8 */
export const fixed1 = (v: number) => one.format(v);
/** 15,538 */
export const count = (v: number) => whole.format(v);
/** 412 MWh from kWh. */
export const mwh = (kwh: number) => whole.format(kwh / 1000);
/** −3.8 with a real minus sign. */
export const celsius = (v: number) => one.format(v).replace("-", "−");
/** +2 °C, −4 °C, ±0 °C */
export const offsetLabel = (v: number) => (v === 0 ? "±0" : v > 0 ? `+${v}` : `−${-v}`);
/** CHF 1,234 (whole francs), with a real minus sign below zero. */
export const chf = (v: number) => `${v < 0 ? "−" : ""}CHF ${whole.format(Math.abs(v))}`;
