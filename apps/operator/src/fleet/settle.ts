import { fleetMonth, type MonthsFile, type Money, type View } from "./months";

export interface ZoneSettlement {
  zone: string;
  houses: number;
  serverHours: number;
  servedKwh: number;
  money: Money;
}

/** The month's settlement by zone, as the scheduler's kpis count the money (months.ts: money). */
export function settlement(file: MonthsFile, view: View) {
  const zones: ZoneSettlement[] = Object.keys(file.cities).map((zone) => {
    const m = fleetMonth(file, view, zone);
    return {
      zone,
      houses: m.houses.length,
      serverHours: m.serverHours,
      servedKwh: m.servedKwh,
      money: m.money,
    };
  });
  const total = fleetMonth(file, view);
  return { zones, total };
}

/** The settlement as CSV, one row per zone and a total. */
export function settlementCsv(file: MonthsFile, view: View): string {
  const { zones, total } = settlement(file, view);
  const r = (n: number) => n.toFixed(2);
  const rows = [
    "zone,homes,server_hours,invoiced_chf,heat_delivered_kwh,heat_value_chf,electricity_chf,margin_before_hardware_chf",
    ...zones.map((z) =>
      [
        z.zone,
        z.houses,
        r(z.serverHours),
        r(z.money.revenue),
        r(z.servedKwh),
        r(z.money.heatValue),
        r(z.money.electricity),
        r(z.money.margin),
      ].join(","),
    ),
    [
      "Total",
      total.houses.length,
      r(total.serverHours),
      r(total.money.revenue),
      r(total.servedKwh),
      r(total.money.heatValue),
      r(total.money.electricity),
      r(total.money.margin),
    ].join(","),
  ];
  return rows.join("\n") + "\n";
}
