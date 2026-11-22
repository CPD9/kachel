import config from "../../../../services/scheduler/config.json";
import { MONTHS, type MonthsFile } from "./months";

const W = config.workloads;

export type Workload = "image" | "video";
export type Zone = "Basel" | "Bern" | "Switzerland";

export const ZONES: Record<Zone, string> = {
  Basel: "Basel",
  Bern: "Bern",
  Switzerland: "Basel and Bern",
};

/** The two tagging jobs DigitalHeat named (#159), sized in config.json: workloads. */
export const WORKLOADS = {
  image: {
    label: "Image tagging",
    unit: "images a day",
    /** Items one 1 kW server tags in an hour. */
    perServerHour: W.image_tagging.images_per_server_hour,
    deadlineH: W.image_tagging.deadline_h,
    /** The hour the overnight batch starts. */
    startsAt: Number(Object.keys(W.image_tagging.arrivals_server_h)[0]),
    priceUnit: 1_000_000,
    priceUnitLabel: "per million images",
    source: W.image_tagging.source,
  },
  video: {
    label: "Video tagging",
    unit: "hours of footage a day",
    /** Decode sets the pace: 3,600 s ÷ decode seconds per hour of footage, per decoder engine. */
    perServerHour: 3600 / W.video_tagging.decode_s_per_footage_hour,
    deadlineH: W.video_tagging.deadline_h,
    startsAt: Number(Object.keys(W.video_tagging.arrivals_server_h)[0]),
    priceUnit: 1000,
    priceUnitLabel: "per 1'000 hours of footage",
    source: W.video_tagging.source,
  },
} as const;

export interface QuoteInput {
  workload: Workload;
  perDay: number;
  zone: Zone;
  month: number;
  offset: number;
}

export interface Quote {
  /** CHF per price unit (a million images, or 1'000 hours of footage). */
  unitPrice: number;
  serverHoursPerDay: number;
  chfPerDay: number;
  /** Electricity the job draws a day, kWh, on 1 kW servers. */
  kwhPerDay: number;
  houses: number;
  /** Server-hours a day the zone's homes ran on their heat demand in the month, model. */
  capacityPerDay: number;
  /** Heat the homes used of all the servers made in the month (the rest was dumped). */
  usefulShare: number;
  /** Clock hour the job is done by. */
  doneBy: number;
}

/** A quote for a tagging job from the model's prices and the zone's month in the fleet run. */
export function quote(input: QuoteInput, file: MonthsFile = MONTHS): Quote {
  const w = WORKLOADS[input.workload];
  const p = file.prices;
  const o = file.offsets_c.indexOf(input.offset);
  if (o < 0) throw new Error(`No what-if for ${input.offset} °C`);
  const houses = file.houses.filter((h) => input.zone === "Switzerland" || h.city === input.zone);
  const at = (rows: number[][]) => rows[o]?.[input.month] ?? 0;
  const days = (file.hours[input.month] ?? 0) / 24;
  const serverHours = houses.reduce((s, h) => s + at(h.server_hours), 0);
  const served = houses.reduce((s, h) => s + at(h.served_kwh), 0);
  const dumped = houses.reduce((s, h) => s + at(h.dumped_kwh), 0);
  const serverHoursPerDay = Math.max(0, input.perDay) / w.perServerHour;
  return {
    unitPrice: (w.priceUnit / w.perServerHour) * p.compute_chf_per_server_hour,
    serverHoursPerDay,
    chfPerDay: serverHoursPerDay * p.compute_chf_per_server_hour,
    kwhPerDay: serverHoursPerDay * p.server_power_kw,
    houses: houses.length,
    capacityPerDay: days > 0 ? serverHours / days : 0,
    usefulShare: served + dumped > 0 ? served / (served + dumped) : 0,
    doneBy: (w.startsAt + w.deadlineH) % 24,
  };
}
