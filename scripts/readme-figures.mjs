#!/usr/bin/env node
// Writes the key figures in the README and the submission text from the scheduler's kpis.json,
// so no figure is typed by hand.
//   node scripts/readme-figures.mjs           rewrite the block between the markers
//   node scripts/readme-figures.mjs --check   fail if a block differs from kpis.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const START = "<!-- figures:start -->";
export const END = "<!-- figures:end -->";
export const KPIS = "services/scheduler/out/kpis.json";

/** The files that may hold a figures block. docs/submission.md must hold one. */
export const TARGETS = [
  { path: "README.md", required: false },
  { path: "docs/submission.md", required: true },
];

const percent = (v) => `${v.toFixed(0)} %`;
const kwh = (v) => `${Math.round(v).toLocaleString("en-GB")} kWh`;
const chf = (v) => `CHF ${Math.round(v).toLocaleString("en-GB")}`;

/** The figures in table order: the kpis.json key, the label and how to print it. */
export const FIGURES = [
  ["servers_per_house", "Servers per house", (v) => String(v)],
  ["heat_demand_kwh", "Heat demand, space heating and hot water", kwh],
  ["share_of_heat_covered_pct", "Share of heat demand covered", percent],
  ["heat_dumped_kwh", "Heat dumped", kwh],
  ["utilisation_pct", "Server utilisation", percent],
  ["server_hours_sold", "Server-hours sold per year", (v) => Math.round(v).toLocaleString("en-GB")],
  ["missed_deadlines_pct_of_jobs", "Missed deadlines", (v) => `${v.toFixed(1)} %`],
  ["electricity_cost_chf", "Electricity cost per year", chf],
  ["computing_income_chf", "Compute income per year", chf],
  ["break_even_chf_per_server_hour", "Break-even per server-hour", (v) => `CHF ${v.toFixed(2)}`],
];

/** The Markdown block for these kpis, markers included. Throws if a figure is missing. */
export function figuresBlock(kpis) {
  const rows = FIGURES.map(([key, label, show]) => {
    if (typeof kpis[key] !== "number") throw new Error(`kpis.json has no number for ${key}`);
    return `| ${label} | ${show(kpis[key])} |`;
  });
  const generated = kpis.generated ? `, generated ${kpis.generated}` : "";
  const source = `Source: ${kpis.profile_source ?? "unknown"}${generated}`;
  const loses = kpis.does_not_pay_off_when
    ? [`It does not pay off when ${kpis.does_not_pay_off_when}.`, ""]
    : [];
  return [START, "| Figure | Value |", "| --- | --- |", ...rows, "", ...loses, source, END].join(
    "\n",
  );
}

/** The text with its figures block replaced, or null if it has no markers. */
export function withFigures(readme, kpis) {
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from === -1 || to === -1 || to < from) return null;
  return readme.slice(0, from) + figuresBlock(kpis) + readme.slice(to + END.length);
}

/** Checks or rewrites one file. Returns an error message, or null when it is fine. */
function update({ path, required }, kpis, check) {
  if (!existsSync(path)) return required ? `${path} does not exist` : null;
  const text = readFileSync(path, "utf8");
  if (kpis === null) {
    return text.includes(START) ? `${path} has figures but ${KPIS} does not exist` : null;
  }
  const next = withFigures(text, kpis);
  if (next === null) {
    if (required) return `${path} needs ${START} and ${END} for the figures`;
    console.log(`No figures in ${path}: nothing to check`);
    return null;
  }
  if (!check) {
    writeFileSync(path, next);
    console.log(`${path} figures written from kpis.json`);
    return null;
  }
  if (next !== text) {
    return `${path} figures differ from kpis.json: run node scripts/readme-figures.mjs`;
  }
  console.log(`${path} figures match kpis.json`);
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const kpis = existsSync(KPIS) ? JSON.parse(readFileSync(KPIS, "utf8")) : null;
  const errors = TARGETS.map((target) => update(target, kpis, check)).filter(Boolean);
  for (const error of errors) console.error(error);
  if (errors.length > 0) process.exit(1);
}
