#!/usr/bin/env node
// Writes the README's key figures from the scheduler's kpis.json, so no figure is typed by hand.
//   node scripts/readme-figures.mjs           rewrite the block between the markers
//   node scripts/readme-figures.mjs --check   fail if the block differs from kpis.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const START = "<!-- figures:start -->";
export const END = "<!-- figures:end -->";
export const KPIS = "services/scheduler/out/kpis.json";

const percent = (v) => `${v.toFixed(0)} %`;
const kwh = (v) => `${Math.round(v).toLocaleString("en-GB")} kWh`;
const chf = (v) => `CHF ${Math.round(v).toLocaleString("en-GB")}`;

/** The figures in table order: the kpis.json key, the label and how to print it. */
export const FIGURES = [
  ["servers_per_house", "Servers per house", (v) => String(v)],
  ["share_of_heat_covered_pct", "Share of heat demand covered", percent],
  ["heat_dumped_kwh", "Heat dumped", kwh],
  ["utilisation_pct", "Server utilisation", percent],
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
  return [START, "| Figure | Value |", "| --- | --- |", ...rows, "", source, END].join("\n");
}

/** The README with its figures block replaced, or null if it has no markers. */
export function withFigures(readme, kpis) {
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from === -1 || to === -1 || to < from) return null;
  return readme.slice(0, from) + figuresBlock(kpis) + readme.slice(to + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const readme = readFileSync("README.md", "utf8");
  const marked = readme.includes(START);
  if (!existsSync(KPIS)) {
    if (marked) {
      console.error(`README.md has figures but ${KPIS} does not exist`);
      process.exit(1);
    }
    console.log(`No ${KPIS} yet and no figures in README.md: nothing to check`);
    process.exit(0);
  }
  const next = withFigures(readme, JSON.parse(readFileSync(KPIS, "utf8")));
  if (next === null) {
    if (check) {
      console.log("No figures in README.md yet: nothing to check");
      process.exit(0);
    }
    console.error(`README.md needs ${START} and ${END} for the figures`);
    process.exit(1);
  }
  if (check) {
    if (next !== readme) {
      console.error("README.md figures differ from kpis.json: run node scripts/readme-figures.mjs");
      process.exit(1);
    }
    console.log("README.md figures match kpis.json");
  } else {
    writeFileSync("README.md", next);
    console.log("README.md figures written from kpis.json");
  }
}
