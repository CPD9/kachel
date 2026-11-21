import raw from "../../../../services/scheduler/out/fleet_months.json";

/**
 * The scheduler's fleet month by month (services/scheduler/out/fleet_months.json, `make months`):
 * every synthetic Basel and Bern house through the year on its city's real 2025 weather, as it
 * was and with every hour moved by an offset in °C. Arrays are [offset][month].
 */
export interface MonthsFile {
  profile_source: string;
  synthetic: boolean;
  run: string;
  model: string;
  offsets_c: number[];
  hours: number[];
  prices: {
    electricity_chf_per_kwh: number;
    heat_pump_cop: number;
    compute_chf_per_server_hour: number;
    server_power_kw: number;
    heat_recovery: number;
    source: string;
  };
  cities: Record<string, { mean_temp_c: number[]; peak_servers_running: number[][] }>;
  houses: FleetHouse[];
}

export interface FleetHouse {
  id: string;
  name: string;
  city: string;
  servers: number;
  tank_kwh: number;
  hot_water_kwh_per_day: number;
  heat_demand_kwh_2025: number;
  demand_kwh: number[][];
  served_kwh: number[][];
  backup_kwh: number[][];
  dumped_kwh: number[][];
  server_hours: number[][];
}

export const MONTHS: MonthsFile = raw;

export const MONTH_NAMES = [
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

/** Which month and which what-if: `month` 0 to 11, `offset` in °C (one of offsets_c). */
export interface View {
  month: number;
  offset: number;
}

/** A house in the chosen month: kWh for the month, and its averages per hour (kW). */
export interface HouseMonth {
  house: FleetHouse;
  demandKwh: number;
  servedKwh: number;
  backupKwh: number;
  serverHours: number;
  demandKw: number;
  servedKw: number;
  backupKw: number;
  /** Servers running on average: server-hours over the hours of the month. */
  running: number;
}

/** The money for some server-hours and heat, as kpis.json counts it (heatsched/sim.py: kpis). */
export interface Money {
  revenue: number;
  electricity: number;
  heatValue: number;
  /** Revenue − electricity + value of the heat, before hardware. */
  margin: number;
}

export interface FleetMonth {
  houses: HouseMonth[];
  hours: number;
  days: number;
  servers: number;
  running: number;
  peakRunning: number;
  demandKwh: number;
  servedKwh: number;
  backupKwh: number;
  serverHours: number;
  money: Money;
  /** The month's mean outdoor temperature in each city, with the offset. */
  temp: Record<string, number>;
}

const at = (rows: number[][], o: number, m: number) => rows[o]?.[m] ?? 0;

function offsetIndex(file: MonthsFile, offset: number) {
  const i = file.offsets_c.indexOf(offset);
  if (i < 0) throw new Error(`No what-if for ${offset} °C in fleet_months.json`);
  return i;
}

export function money(file: MonthsFile, serverHours: number, servedKwh: number): Money {
  const p = file.prices;
  const revenue = serverHours * p.compute_chf_per_server_hour;
  const electricity = serverHours * p.server_power_kw * p.electricity_chf_per_kwh;
  const heatValue = (servedKwh * p.electricity_chf_per_kwh) / p.heat_pump_cop;
  return { revenue, electricity, heatValue, margin: revenue - electricity + heatValue };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Every house and the fleet's totals for one month of one what-if. */
export function fleetMonth(file: MonthsFile, { month, offset }: View, city?: string): FleetMonth {
  const o = offsetIndex(file, offset);
  const hours = file.hours[month] ?? 0;
  const houses = file.houses
    .filter((h) => city === undefined || h.city === city)
    .map((house): HouseMonth => {
      const demandKwh = at(house.demand_kwh, o, month);
      const servedKwh = at(house.served_kwh, o, month);
      const backupKwh = at(house.backup_kwh, o, month);
      const serverHours = at(house.server_hours, o, month);
      return {
        house,
        demandKwh,
        servedKwh,
        backupKwh,
        serverHours,
        demandKw: demandKwh / hours,
        servedKw: servedKwh / hours,
        backupKw: backupKwh / hours,
        running: serverHours / hours,
      };
    });
  const cities = Object.entries(file.cities).filter(([c]) => city === undefined || c === city);
  const serverHours = sum(houses.map((h) => h.serverHours));
  const servedKwh = sum(houses.map((h) => h.servedKwh));
  return {
    houses,
    hours,
    days: hours / 24,
    servers: sum(houses.map((h) => h.house.servers)),
    running: serverHours / hours,
    peakRunning: sum(cities.map(([, c]) => at(c.peak_servers_running, o, month))),
    demandKwh: sum(houses.map((h) => h.demandKwh)),
    servedKwh,
    backupKwh: sum(houses.map((h) => h.backupKwh)),
    serverHours,
    money: money(file, serverHours, servedKwh),
    temp: Object.fromEntries(cities.map(([c, v]) => [c, (v.mean_temp_c[month] ?? 0) + offset])),
  };
}

/** The twelve months of one what-if, for the year's totals and the chart. */
export function fleetYear(file: MonthsFile, offset: number, city?: string) {
  const months = MONTH_NAMES.map((_, month) => fleetMonth(file, { month, offset }, city));
  const serverHours = sum(months.map((m) => m.serverHours));
  const servedKwh = sum(months.map((m) => m.servedKwh));
  return {
    months,
    serverHours,
    servedKwh,
    demandKwh: sum(months.map((m) => m.demandKwh)),
    backupKwh: sum(months.map((m) => m.backupKwh)),
    money: money(file, serverHours, servedKwh),
  };
}
