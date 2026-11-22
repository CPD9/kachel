import { TARGET } from "./target";
import { JOB_TYPES } from "@kachel/economics/model";
import {
  Atom,
  Baby,
  Bed,
  Brain,
  BuildingApartment,
  Buildings,
  ChatCircleDots,
  Cube,
  FilmSlate,
  GameController,
  GraduationCap,
  HouseLine,
  HouseSimple,
  type Icon,
  ImageSquare,
  Plant,
  SwimmingPool,
} from "@phosphor-icons/react";
import { HOME } from "./neighbours";

/**
 * The other side of Kachel: someone with computing to run picks a house whose rack has room.
 * Hand-written demo data; prices, houses and hosts are made up for the pitch.
 */

export type Workload = "tagging" | "gaming" | "render" | "train" | "infer" | "science" | "video";

export type Needs = {
  workload: Workload;
  /** GPUs at once; 0 runs on CPUs only. */
  gpus: number;
  /** Memory per GPU, GB. */
  vram: number;
  /** RAM, GB. */
  ram: number;
  /** Hours a month, or how long the job runs if it's one-time. */
  hours: number;
  /** A single job instead of every month: billed once, at the on-demand rate. */
  once: boolean;
  /** Someone is waiting on it (gaming, a chatbot): it has to be free now and close by. */
  interactive: boolean;
  /** Runs only while the house needs heat, which makes it cheaper. */
  flex: boolean;
};

/** Image and video tagging as the scheduler runs it (config.json: workloads, from #200). */
const TAGGING = JOB_TYPES;
/** Server-hours a night of tagging: the image batch at 20:00 plus the video batch at 22:00. */
const TAGGING_NIGHT_H = [TAGGING.image_tagging, TAGGING.video_tagging]
  .flatMap((t) => Object.values(t.arrivals_server_h))
  .reduce((a, b) => a + b, 0);

export const WORKLOADS: Record<
  Workload,
  {
    icon: Icon;
    name: string;
    note: string;
    needs: Omit<Needs, "workload" | "flex" | "once">;
    /** How long a typical one-time job runs, h. */
    job: number;
  }
> = {
  tagging: {
    icon: ImageSquare,
    name: "Image and video tagging",
    // Our own measured speed on an RTX 2080 Ti (#211), as the operator's quote uses (#214)
    note: `≈ ${TAGGING.image_tagging.measured_images_per_server_hour.toLocaleString("en-GB")} images a server-hour, measured`,
    // 8 GB: the measured speed comes from our 11 GB card, so a card like it must fit; the
    // hours are the scheduler's
    needs: { gpus: 1, vram: 8, ram: 32, hours: TAGGING_NIGHT_H * 30, interactive: false },
    job: TAGGING_NIGHT_H,
  },
  gaming: {
    icon: GameController,
    name: "Cloud gaming",
    note: "4K at 120 fps, streamed",
    needs: { gpus: 1, vram: 16, ram: 32, hours: 60, interactive: true },
    job: 4,
  },
  render: {
    icon: Cube,
    name: "3D rendering",
    note: "Blender, Cinema 4D, Unreal",
    needs: { gpus: 2, vram: 24, ram: 64, hours: 120, interactive: false },
    job: 12,
  },
  train: {
    icon: Brain,
    name: "AI training",
    note: "Fine-tune and train models",
    needs: { gpus: 4, vram: 80, ram: 512, hours: 200, interactive: false },
    job: 48,
  },
  infer: {
    icon: ChatCircleDots,
    name: "AI inference",
    note: "Serve an LLM or an API",
    needs: { gpus: 1, vram: 48, ram: 128, hours: 300, interactive: true },
    job: 24,
  },
  science: {
    icon: Atom,
    name: "Simulation",
    note: "Climate, CFD, genomics",
    needs: { gpus: 0, vram: 0, ram: 256, hours: 160, interactive: false },
    job: 36,
  },
  video: {
    icon: FilmSlate,
    name: "Video encoding",
    note: "Transcode and upscale",
    needs: { gpus: 1, vram: 12, ram: 32, hours: 80, interactive: false },
    job: 6,
  },
};

export const GPU_COUNTS = [0, 1, 2, 4, 8] as const;
export const VRAM_STEPS = [8, 12, 16, 24, 48, 80] as const;
export const RAM_STEPS = [16, 32, 64, 128, 256, 512, 1024, 2048] as const;

/** Longest one-time job, h (a week). */
export const MAX_JOB_HOURS = 168;

export function needsFor(workload: Workload, flex: boolean, once = false): Needs {
  const w = WORKLOADS[workload];
  return { workload, flex, once, ...w.needs, hours: once ? w.job : w.needs.hours };
}

export type HeatNeed = "high" | "medium" | "low";
/** Heat-flex discount: the colder the house, the more it wants the job. */
export const FLEX_DISCOUNT: Record<HeatNeed, number> = { high: 0.35, medium: 0.2, low: 0.05 };
export const HEAT_LABEL: Record<HeatNeed, string> = {
  high: "Needs heat now",
  medium: "Some heat needed",
  low: "Warm enough",
};

export type BuildingKind =
  | "house"
  | "bungalow"
  | "flats"
  | "coop"
  | "hostel"
  | "villa"
  | "greenhouse"
  | "school"
  | "daycare";

/** One icon per kind of building, in the lists and on the map's price pins. */
export const BUILDING_ICON: Record<BuildingKind, Icon> = {
  house: HouseLine,
  bungalow: HouseSimple,
  flats: BuildingApartment,
  coop: Buildings,
  hostel: Bed,
  villa: SwimmingPool,
  greenhouse: Plant,
  school: GraduationCap,
  daycare: Baby,
};

export type Offer = {
  id: string;
  /** What kind of building it is, for its icon. */
  kind: BuildingKind;
  at: [number, number];
  address: string;
  area: string;
  /** Who lives there, in a few words. */
  host: string;
  /** What the job's heat goes into. */
  heatsWhat: string;
  gpu: { name: string; count: number; vram: number } | null;
  cpu: string;
  ram: number;
  /** CHF per hour for the machine's share, plus per GPU-hour. */
  baseH: number;
  gpuH: number;
  heat: HeatNeed;
  /** Null when free now, else when it frees up. */
  freeFrom: string | null;
  /** Power per GPU while computing, kW (all of it ends up as heat). */
  kwPerGpu: number;
  /** The house from the start of the pitch. */
  home?: boolean;
};

export const OFFERS: Offer[] = [
  {
    id: "byfang",
    kind: TARGET.building.kind === "school" ? "school" : "house",
    at: HOME,
    address: TARGET.name,
    area: "Gotthelf",
    host: "Family of four · 1930s house",
    heatsWhat: "the radiators and the kids' baths",
    gpu: { name: "RTX 4090", count: 4, vram: 24 },
    cpu: "64 cores",
    ram: 256,
    baseH: 0.08,
    gpuH: 0.42,
    heat: "high",
    freeFrom: null,
    kwPerGpu: 0.45,
    home: true,
  },
  {
    id: "gueter",
    kind: "flats",
    at: [7.5915, 47.5425],
    address: "Güterstrasse 112",
    area: "Gundeldingen",
    host: "Meier block · 8 flats from 1912",
    heatsWhat: "hot water for 8 flats",
    gpu: { name: "RTX 4090", count: 8, vram: 24 },
    cpu: "128 cores",
    ram: 512,
    baseH: 0.1,
    gpuH: 0.39,
    heat: "high",
    freeFrom: null,
    kwPerGpu: 0.45,
  },
  {
    id: "rheinblick",
    kind: "coop",
    at: [7.5775, 47.5672],
    address: "Elsässerstrasse 41",
    area: "St. Johann",
    host: "Co-op Rheinblick · 24 flats",
    heatsWhat: "the floor heating of 24 flats",
    gpu: { name: "H100", count: 2, vram: 80 },
    cpu: "96 cores",
    ram: 1024,
    baseH: 0.15,
    gpuH: 2.1,
    heat: "medium",
    freeFrom: null,
    kwPerGpu: 0.7,
  },
  {
    id: "hostel",
    kind: "hostel",
    at: [7.5952, 47.5655],
    address: "Klybeckstrasse 77",
    area: "Kleinbasel",
    host: "Hostel am Rhy · 60 beds",
    heatsWhat: "hot water for 60 beds",
    gpu: { name: "L40S", count: 4, vram: 48 },
    cpu: "96 cores",
    ram: 384,
    baseH: 0.1,
    gpuH: 0.85,
    heat: "high",
    freeFrom: null,
    kwPerGpu: 0.35,
  },
  {
    id: "vogt",
    kind: "greenhouse",
    at: [7.5405, 47.5505],
    address: "Baslerstrasse 210",
    area: "Allschwil",
    host: "Gärtnerei Vogt · tomato greenhouse",
    heatsWhat: "a greenhouse, all year round",
    gpu: { name: "H100", count: 8, vram: 80 },
    cpu: "192 cores",
    ram: 2048,
    baseH: 0.25,
    gpuH: 1.95,
    heat: "high",
    freeFrom: null,
    kwPerGpu: 0.7,
  },
  {
    id: "wenken",
    kind: "villa",
    at: [7.6455, 47.5835],
    address: "Bettingerstrasse 8",
    area: "Riehen",
    host: "Brunner family · villa with a pool",
    heatsWhat: "the pool and the house",
    gpu: { name: "RTX 6000 Ada", count: 2, vram: 48 },
    cpu: "48 cores",
    ram: 256,
    baseH: 0.1,
    gpuH: 0.8,
    heat: "medium",
    freeFrom: "from 18:00",
    kwPerGpu: 0.3,
  },
  {
    id: "bruderholz",
    kind: "bungalow",
    at: [7.5955, 47.5305],
    address: "Batteriestrasse 20",
    area: "Bruderholz",
    host: "Retired couple · 1960s bungalow",
    heatsWhat: "a bungalow that's always a bit cold",
    gpu: { name: "RTX 4080", count: 1, vram: 16 },
    cpu: "16 cores",
    ram: 64,
    baseH: 0.05,
    gpuH: 0.32,
    heat: "high",
    freeFrom: null,
    kwPerGpu: 0.32,
  },
  {
    id: "breite",
    kind: "school",
    at: [7.6125, 47.5535],
    address: "Zürcherstrasse 150",
    area: "Breite",
    host: "Schulhaus Breite · school and gym",
    heatsWhat: "the school's space heating and hot water",
    gpu: null,
    cpu: "2× EPYC · 192 cores",
    ram: 768,
    baseH: 0.9,
    gpuH: 0,
    heat: "medium",
    freeFrom: null,
    kwPerGpu: 0,
  },
  {
    id: "sunneschii",
    kind: "daycare",
    at: [7.5705, 47.5405],
    address: "Hauptstrasse 30",
    area: "Binningen",
    host: "Kita Sunneschii · day-care",
    heatsWhat: "warm floors for crawling toddlers",
    gpu: { name: "RTX 4070", count: 2, vram: 12 },
    cpu: "24 cores",
    ram: 64,
    baseH: 0.05,
    gpuH: 0.22,
    heat: "low",
    freeFrom: null,
    kwPerGpu: 0.22,
  },
];

/** Why an offer doesn't fit, or null if it does. */
export function mismatch(o: Offer, n: Needs): string | null {
  if (n.gpus > 0 && !o.gpu) return "CPUs only";
  if (o.gpu && n.gpus > o.gpu.count) return `Only ${o.gpu.count} GPU${o.gpu.count > 1 ? "s" : ""}`;
  if (o.gpu && n.gpus > 0 && n.vram > o.gpu.vram) return `Only ${o.gpu.vram} GB per GPU`;
  if (n.ram > o.ram) return `Only ${o.ram} GB RAM`;
  if (n.interactive && o.freeFrom) return `Free ${o.freeFrom}`;
  return null;
}

/** What one hour costs here, CHF, before any heat-flex discount. */
export function hourly(o: Offer, n: Needs): number {
  const gpus = o.gpu ? Math.min(n.gpus, o.gpu.count) : 0;
  // CPU-only jobs pay for the machine's share by how much RAM they take
  const share = o.gpu ? 1 : Math.max(0.25, n.ram / o.ram);
  return o.baseH * share + o.gpuH * gpus;
}

/** A one-time job pays the on-demand rate: no commitment, so 20 % more per hour. */
export const ONE_TIME_PREMIUM = 0.2;

/** Same hardware in a hyperscaler cloud, roughly. */
const CLOUD_FACTOR = 2.3;

export type Quote = {
  offer: Offer;
  miss: string | null;
  /** CHF a month, or for the whole job if it's one-time, after the heat-flex discount. */
  total: number;
  perHour: number;
  discount: number;
  cloud: number;
  /** kWh of heat the house gets (a month, or from the one job). */
  heatKwh: number;
  /** kg of CO₂ the house doesn't burn in gas. */
  co2: number;
  /** For "Best match": higher is better. */
  score: number;
};

const GAS_CO2_PER_KWH = 0.2;
const CPU_KW = 0.15;

export function quote(o: Offer, n: Needs): Quote {
  const miss = mismatch(o, n);
  const discount = n.flex ? FLEX_DISCOUNT[o.heat] : 0;
  const perHour = hourly(o, n) * (n.once ? 1 + ONE_TIME_PREMIUM : 1) * (1 - discount);
  const total = perHour * n.hours;
  const gpus = o.gpu ? Math.min(n.gpus, o.gpu.count) : 0;
  const heatKwh = (CPU_KW + gpus * o.kwPerGpu) * n.hours;
  const heatBonus = { high: 0.25, medium: 0.1, low: 0 }[o.heat];
  return {
    offer: o,
    miss,
    total,
    perHour,
    discount,
    cloud: hourly(o, n) * CLOUD_FACTOR * n.hours,
    heatKwh,
    co2: heatKwh * GAS_CO2_PER_KWH,
    // Cheaper is better, and a house that needs the heat counts as up to 25 % cheaper
    score: -total * (1 - heatBonus),
  };
}

export type Sort = "match" | "price" | "heat";

export function quotes(n: Needs, sort: Sort): Quote[] {
  const heatRank = { high: 0, medium: 1, low: 2 };
  return OFFERS.map((o) => quote(o, n)).sort((a, b) => {
    if (!!a.miss !== !!b.miss) return a.miss ? 1 : -1;
    if (sort === "price") return a.total - b.total;
    if (sort === "heat")
      return heatRank[a.offer.heat] - heatRank[b.offer.heat] || a.total - b.total;
    return b.score - a.score || a.total - b.total;
  });
}
