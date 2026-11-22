/** Swiss grouping with a plain apostrophe: 29'587. */
const group = (s: string) => s.replace(/,/g, "'");
const one = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 9.8 */
export const fixed1 = (v: number) => group(one.format(v));
/** 15'538 */
export const count = (v: number) => group(whole.format(v));
/** 412 MWh from kWh. */
export const mwh = (kwh: number) => group(whole.format(kwh / 1000));
/** −3.8 with a real minus sign. */
export const celsius = (v: number) => one.format(v).replace("-", "−");
/** +2 °C, −4 °C, ±0 °C */
export const offsetLabel = (v: number) => (v === 0 ? "±0" : v > 0 ? `+${v}` : `−${-v}`);
/** CHF 1'234 (whole francs), with a real minus sign below zero. */
export const chf = (v: number) => `${v < 0 ? "−" : ""}CHF ${count(Math.abs(v))}`;
/** CHF 0.06, for prices below a franc. */
export const chf2 = (v: number) => `${v < 0 ? "−" : ""}CHF ${group(two.format(Math.abs(v)))}`;
/** 17 % */
export const pct = (share: number) => `${whole.format(share * 100)} %`;
/** 99.8 % */
export const pct1 = (share: number) => `${one.format(share * 100)} %`;
