import { BYFANGWEG_AT, TARGET } from "./target";
import {
  Box,
  BrainCircuit,
  Clapperboard,
  Clock,
  Cpu,
  Gamepad2,
  HardDrive,
  type LucideIcon,
  Monitor,
  Server,
  Thermometer,
  Users,
  Volume2,
  Zap,
} from "lucide-react";

/** The presenter's home, hard-coded for the demo: [lng, lat]. */
export const HOME: [number, number] = TARGET.at;

export type Plan = {
  id: string;
  name: string;
  /** Headline of the offer card, e.g. the GPU. */
  spec: string;
  detail: string;
  hours: number;
  price: number;
  /** Average power while it runs: all of it ends up as heat at HOME. */
  kw: number;
};

/**
 * Someone near HOME who could use its rack. Hand-written demo data: names, prices and loads are
 * made up for the pitch.
 */
export type Neighbour = {
  id: string;
  /** [lng, lat]; the building under (or nearest to) it lights up. */
  at: [number, number];
  color: string;
  /** The colour while another neighbour is picked. */
  dim: string;
  icon: LucideIcon;
  name: string;
  what: string;
  /** Under the header graphic, e.g. "Online · in a match". */
  status: string;
  /** On the roof tag: "Noah · plays on your rack". */
  tag: string;
  facts: { icon: LucideIcon; k: string; v: string }[];
  tags: string[];
  service: string;
  plans: [Plan, Plan, Plan];
  /** What the rack replaces, for "Instead of". */
  instead: string;
  /** Heat card: title and the hour-by-hour load (0–1) that turns into heat at HOME. */
  heatTitle: string;
  load: { h: string; v: number }[];
  hint: string;
};

const PLACED: Neighbour[] = [
  {
    id: "noah",
    at: [7.581800279272595, 47.55543369350158],
    color: "#06b6d4",
    dim: "#1f5c69",
    icon: Gamepad2,
    name: "Noah, 24",
    what: "Gamer & streamer",
    status: "Online · in a match",
    tag: "Noah · plays on your rack",
    facts: [
      { icon: Clock, k: "Plays", v: "≈ 4 h a night" },
      { icon: Monitor, k: "Setup today", v: "Gaming PC · 450 W" },
      { icon: Thermometer, k: "Room in summer", v: "29 °C with the PC on" },
    ],
    tags: ["4K · 120 fps", "Streams evenings", "Fibre 10 Gbit/s"],
    service: "Kachel Play · gaming on the rack",
    plans: [
      {
        id: "casual",
        name: "Casual",
        spec: "Mid-range GPU",
        detail: "1440p · 120 fps",
        hours: 40,
        price: 9,
        kw: 0.6,
      },
      {
        id: "pro",
        name: "Pro",
        spec: "High-end GPU",
        detail: "4K · 120 fps",
        hours: 120,
        price: 19,
        kw: 1,
      },
      {
        id: "stream",
        name: "Streamer",
        spec: "2 GPUs + encoder",
        detail: "4K · 144 fps + stream",
        hours: 160,
        price: 29,
        kw: 1.6,
      },
    ],
    instead: "CHF 3'200 PC + 260/yr",
    heatTitle: "Tonight's games",
    load: [
      { h: "18", v: 0.15 },
      { h: "19", v: 0.35 },
      { h: "20", v: 0.9 },
      { h: "21", v: 1 },
      { h: "22", v: 0.95 },
      { h: "23", v: 0.7 },
      { h: "00", v: 0.3 },
    ],
    hint: "Noah's room stays cool and quiet. The heat lands in your hot water instead.",
  },
  {
    id: "lena",
    at: [7.5862, 47.5538],
    color: "#06b6d4",
    dim: "#1f5c69",
    icon: Box,
    name: "Lena, 31",
    what: "Architect & 3D artist",
    status: "Rendering · 62 %",
    tag: "Lena · renders on your rack",
    facts: [
      { icon: Clock, k: "Renders", v: "Overnight, 5 nights a week" },
      { icon: Monitor, k: "Setup today", v: "Laptop + render queue" },
      { icon: Volume2, k: "Pain point", v: "Fans scream till 3 am" },
    ],
    tags: ["Blender · V-Ray", "Client deadlines", "Visualisations"],
    service: "Kachel Render · renders overnight",
    plans: [
      {
        id: "draft",
        name: "Draft",
        spec: "1 GPU node",
        detail: "Stills in 1080p",
        hours: 60,
        price: 12,
        kw: 0.8,
      },
      {
        id: "studio",
        name: "Studio",
        spec: "4 GPU nodes",
        detail: "4K stills in ≈ 6 min",
        hours: 150,
        price: 25,
        kw: 1.5,
      },
      {
        id: "anim",
        name: "Animation",
        spec: "8 GPU nodes",
        detail: "4K walk-throughs",
        hours: 300,
        price: 39,
        kw: 2.5,
      },
    ],
    instead: "CHF 4'800 workstation",
    heatTitle: "Tonight's renders",
    load: [
      { h: "22", v: 0.6 },
      { h: "23", v: 1 },
      { h: "00", v: 1 },
      { h: "01", v: 1 },
      { h: "02", v: 0.9 },
      { h: "03", v: 0.7 },
      { h: "04", v: 0.2 },
    ],
    hint: "Renders run while you sleep, exactly when the house needs heat most.",
  },
  {
    id: "jonas",
    at: [7.5768, 47.5507],
    color: "#06b6d4",
    dim: "#1f5c69",
    icon: BrainCircuit,
    name: "Jonas, 27",
    what: "PhD student · trains AI models",
    status: "Training · epoch 14 / 40",
    tag: "Jonas · trains on your rack",
    facts: [
      { icon: Clock, k: "Runs", v: "12–48 h per experiment" },
      { icon: Cpu, k: "Setup today", v: "Waits days for uni GPUs" },
      { icon: HardDrive, k: "Data", v: "Stays in Switzerland" },
    ],
    tags: ["PyTorch", "Uni Basel", "Swiss data"],
    service: "Kachel Compute · GPUs for research",
    plans: [
      {
        id: "notebook",
        name: "Notebook",
        spec: "1 GPU · 24 GB",
        detail: "Prototyping",
        hours: 80,
        price: 15,
        kw: 0.5,
      },
      {
        id: "lab",
        name: "Lab",
        spec: "4 GPUs · 96 GB",
        detail: "Fine-tuning",
        hours: 200,
        price: 29,
        kw: 1.8,
      },
      {
        id: "cluster",
        name: "Cluster",
        spec: "8 GPUs · 192 GB",
        detail: "Full training runs",
        hours: 400,
        price: 45,
        kw: 3.2,
      },
    ],
    instead: "Cloud GPUs ≈ CHF 2.50/h",
    heatTitle: "Tonight's training run",
    load: [
      { h: "18", v: 0.85 },
      { h: "20", v: 0.9 },
      { h: "22", v: 1 },
      { h: "00", v: 1 },
      { h: "02", v: 1 },
      { h: "04", v: 0.95 },
      { h: "06", v: 0.9 },
    ],
    hint: "Long runs mean steady heat: your rack never cools down overnight.",
  },
  {
    id: "rhein",
    at: [7.5845, 47.5492],
    color: "#06b6d4",
    dim: "#1f5c69",
    icon: Clapperboard,
    name: "Studio Rhein",
    what: "Video studio · 3 people",
    status: "Exporting · 4K edit",
    tag: "Studio Rhein · exports on your rack",
    facts: [
      { icon: Users, k: "Team", v: "3 editors" },
      { icon: Clock, k: "Exports", v: "≈ 20 videos a week" },
      { icon: Zap, k: "Setup today", v: "2 render PCs · 1.2 kW" },
    ],
    tags: ["4K · 8K", "Colour grading", "Ads & weddings"],
    service: "Kachel Stream · editing & export",
    plans: [
      {
        id: "solo",
        name: "Solo",
        spec: "1 workstation",
        detail: "Remote 4K editing",
        hours: 80,
        price: 19,
        kw: 0.7,
      },
      {
        id: "team",
        name: "Team",
        spec: "3 workstations",
        detail: "Shared storage",
        hours: 240,
        price: 35,
        kw: 1.8,
      },
      {
        id: "prod",
        name: "Production",
        spec: "3 seats + export farm",
        detail: "8K exports",
        hours: 400,
        price: 49,
        kw: 2.8,
      },
    ],
    instead: "CHF 9'000 in PCs",
    heatTitle: "Today's exports",
    load: [
      { h: "09", v: 0.4 },
      { h: "10", v: 0.6 },
      { h: "11", v: 0.75 },
      { h: "13", v: 0.5 },
      { h: "15", v: 0.85 },
      { h: "17", v: 1 },
      { h: "19", v: 0.6 },
    ],
    hint: "Daytime exports top up your hot water tank for the evening.",
  },
  {
    id: "fluxa",
    at: [7.577, 47.5552],
    color: "#06b6d4",
    dim: "#1f5c69",
    icon: Server,
    name: "Fluxa",
    what: "Start-up · booking app",
    status: "Serving 1.2k users now",
    tag: "Fluxa · hosts on your rack",
    facts: [
      { icon: Users, k: "Users", v: "≈ 40k a month" },
      { icon: Server, k: "Setup today", v: "Cloud in Frankfurt" },
      { icon: HardDrive, k: "Wants", v: "Data in Basel" },
    ],
    tags: ["Always on", "Swiss hosting", "ISO 27001"],
    service: "Kachel Cloud · hosting next door",
    plans: [
      {
        id: "starter",
        name: "Starter",
        spec: "4 vCPU · 16 GB",
        detail: "1 app server",
        hours: 720,
        price: 25,
        kw: 0.3,
      },
      {
        id: "scale",
        name: "Scale",
        spec: "16 vCPU · 64 GB",
        detail: "App + database",
        hours: 720,
        price: 39,
        kw: 0.9,
      },
      {
        id: "dedicated",
        name: "Dedicated",
        spec: "Own server",
        detail: "64 cores · 256 GB",
        hours: 720,
        price: 49,
        kw: 1.6,
      },
    ],
    instead: "CHF 410/mo in the cloud",
    heatTitle: "Tonight's traffic",
    load: [
      { h: "18", v: 0.8 },
      { h: "19", v: 0.9 },
      { h: "20", v: 1 },
      { h: "21", v: 0.85 },
      { h: "22", v: 0.6 },
      { h: "23", v: 0.45 },
      { h: "00", v: 0.35 },
    ],
    hint: "Servers run around the clock: a steady base load of heat, all year.",
  },
];

/** The neighbours keep their places relative to the target, wherever the demo points. */
export const NEIGHBOURS: Neighbour[] = PLACED.map((n) => ({
  ...n,
  at: [n.at[0] + HOME[0] - BYFANGWEG_AT[0], n.at[1] + HOME[1] - BYFANGWEG_AT[1]],
}));

/** Straight-line distance from HOME in metres. */
export function distanceFromHome([lng, lat]: [number, number]): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat - HOME[1]);
  const dLng = r(lng - HOME[0]);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(HOME[1])) * Math.sin(dLng / 2) ** 2;
  return Math.round((2 * 6371000 * Math.asin(Math.sqrt(a))) / 10) * 10;
}
