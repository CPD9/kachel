#!/usr/bin/env node
// Writes docs/assumptions.md from services/scheduler/config.json: every value the model uses,
// its unit and where it comes from, so no assumption is hidden or typed by hand.
//   node scripts/assumptions.mjs           rewrite docs/assumptions.md
//   node scripts/assumptions.mjs --check   fail if the page differs from config.json, or if
//                                          config.json has a value this script gives no source
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CONFIG = "services/scheduler/config.json";
export const PAGE = "docs/assumptions.md";

/** Sources, numbered as in docs/economics/README.md#sources. */
const BRIEF = "[1] DigitalHeat case brief";
const ELCOM = "[3] ElCom 2026 H4 median";
const FIELD_COP = "[4] Fraunhofer ISE field test";
const PCSP = "[9] PCSP server prices 2026";
const VRLA = "[10] VRLA Tech workstation 2026";
const LOOP = "[11] Watercooling UK";
const WBAG = "[12] WBAG Regietarif 2025";
const EIT = "[13] EIT.nordwest rates 2026";
const LIFE = "[14] SiliconANGLE, [15] Amazon 10-K 2025";
const WACC = "[16] UVEK grid WACC, [17] pv magazine";
export const GUESS = "our guess";

const hour = (h) => `${String(h).padStart(2, "0")}:00`;

/** How to print a value. */
const show = {
  plain: (v) => (v === null ? "none" : String(v)),
  pct: (v) => `${Math.round(v * 100)} %`,
  rate: (v) => `${Number((v * 100).toFixed(2))} %`,
  hours: (v) => (v === null ? "none" : `${v} h`),
  arrivals: (v) =>
    Object.entries(v)
      .map(([h, n]) => `${n} at ${hour(h)}`)
      .join(", "),
};

/**
 * Every value in config.json, by its path: what it is, its unit, how to print it and its
 * source. A value missing here fails the check, so a new assumption cannot slip in unsourced.
 */
export const VALUES = {
  "house.tank_kwh": ["Hot-water tank", "kWh", show.plain, BRIEF],
  "house.hot_water_kwh_per_day": ["Hot water a day", "kWh", show.plain, BRIEF],
  "house.hot_water_shape": ["How hot water use spreads over the day", "", show.plain, GUESS],
  "server.power_kw": ["Server power", "kW", show.plain, BRIEF],
  "server.heat_recovery": ["Share of server power recovered as heat", "", show.pct, BRIEF],
  "server.idle_power_kw": ["Power a paused server draws", "kW", show.plain, GUESS],
  "prices.electricity_chf_per_kwh": ["Electricity price", "CHF/kWh", show.plain, ELCOM],
  "prices.heat_pump_cop": [
    "Heat pump efficiency (COP) the server heat replaces",
    "",
    show.plain,
    `${BRIEF}; field tests 2.6 to 4.9, ${FIELD_COP}`,
  ],
  "prices.compute_chf_per_server_hour": [
    "Price of a server-hour of compute",
    "CHF",
    show.plain,
    GUESS,
  ],
  forecast: ["Heat demand forecast", "", show.plain, `${GUESS}: the next hour as this one`],
  "hardware.case_for_results": ["Hardware case the results use", "", show.plain, GUESS],
  "hardware.service_chf_per_hour": ["Service fitter with van", "CHF/h", show.plain, WBAG],
  "hardware.service_callout_chf": ["Service call-out", "CHF", show.plain, WBAG],
};

const JOB_VALUES = {
  label: ["What it is", "", show.plain],
  interruptible: ["Can be paused", "", show.plain],
  deadline_h: ["Deadline after arrival", "", show.hours],
  arrivals_server_h: ["Server-hours arriving each day", "server-hours", show.arrivals],
  unlimited: ["Backlog never runs out", "", show.plain],
  when_heat_not_needed: ["When the house needs no heat", "", show.plain],
};

for (const kind of ["interactive", "batch", "opportunistic"]) {
  for (const [key, [what, unit, print]] of Object.entries(JOB_VALUES)) {
    VALUES[`jobs.${kind}.${key}`] = [what, unit, print, GUESS];
  }
}

/** Each hardware case's values (config.json: hardware.cases), shown side by side. */
export const HARDWARE = {
  label: ["What it is", "", show.plain, `${PCSP}, ${VRLA}`],
  server_chf: ["Server, about 1 kW", "CHF", show.plain, `${PCSP}, ${VRLA}; 1 kW is ${GUESS}`],
  cooling_kit_chf: ["Water loop to the tank", "CHF", show.plain, `${LOOP}, ${GUESS}`],
  fitter_hours_per_house: ["Fitter hours per house", "h", show.plain, GUESS],
  fitter_chf_per_hour: ["Fitter rate", "CHF/h", show.plain, WBAG],
  electrician_hours_per_house: ["Electrician hours per house", "h", show.plain, GUESS],
  electrician_chf_per_hour: ["Electrician rate", "CHF/h", show.plain, EIT],
  service_visits_per_year: ["Service visits a year", "", show.plain, GUESS],
  service_hours_per_visit: ["Hours per service visit", "h", show.plain, GUESS],
  lifetime_years: ["Lifetime", "years", show.plain, LIFE],
  discount_rate: ["Discount rate", "", show.rate, `${WACC}; high case ${GUESS}`],
};

const CASES = "hardware.cases.";

/** Keys that describe the file rather than hold a value. */
const NOT_VALUES = new Set(["_note", "source"]);

/** Every value path in config.json, depth first, stopping at a value or a job's arrivals. */
export function valuePaths(node, prefix = "") {
  return Object.entries(node).flatMap(([key, value]) => {
    if (NOT_VALUES.has(key)) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    const leaf = value === null || typeof value !== "object" || key === "arrivals_server_h";
    return leaf ? [path] : valuePaths(value, path);
  });
}

const at = (config, path) => path.split(".").reduce((node, key) => node?.[key], config);
const known = (path) =>
  path.startsWith(CASES) ? path.split(".").pop() in HARDWARE : path in VALUES;

/** A Markdown table laid out as Prettier lays it out, so the page passes format:check. */
export function table(head, rows) {
  const all = [head, ...rows];
  const widths = head.map((_, i) => Math.max(3, ...all.map((r) => [...r[i]].length)));
  const pad = (c, i) => c + " ".repeat(widths[i] - [...c].length);
  const line = (r) => `| ${r.map(pad).join(" | ")} |`;
  return [line(head), `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`, ...rows.map(line)];
}

const SECTIONS = [
  ["House", "house"],
  ["Server", "server"],
  ["Prices", "prices"],
  ["Model", null],
  ["Interactive jobs", "jobs.interactive"],
  ["Batch jobs", "jobs.batch"],
  ["Backlog jobs", "jobs.opportunistic"],
  ["Hardware", "hardware"],
];

/** The whole page for this config. Throws on a value with no source here. */
export function page(config) {
  const paths = valuePaths(config);
  const unsourced = paths.filter((p) => !known(p));
  if (unsourced.length) {
    throw new Error(`${CONFIG} has values with no source in scripts/assumptions.mjs: ${unsourced}`);
  }
  const out = [
    "# Assumptions",
    "",
    `Every value the scheduler uses, from \`${CONFIG}\`, with its unit and where it comes from.`,
    "The numbered sources are listed on [the economics page](economics/README.md#sources).",
    `"${GUESS[0].toUpperCase()}${GUESS.slice(1)}" means no outside source backs the value yet.`,
    "",
    "This page is generated: change `config.json`, then run `node scripts/assumptions.mjs`.",
  ];
  for (const [title, prefix] of SECTIONS) {
    const mine = paths.filter((p) =>
      prefix ? p.startsWith(`${prefix}.`) && !p.startsWith(CASES) : !p.includes("."),
    );
    if (mine.length === 0) continue;
    const rows = mine.map((p) => {
      const [what, unit, print, source] = VALUES[p];
      return [what, `\`${p.split(".").pop()}\``, print(at(config, p)), unit, source];
    });
    out.push("", `## ${title}`, "", ...table(["What", "Key", "Value", "Unit", "Source"], rows));
    const note = prefix ? at(config, prefix).source : undefined;
    if (typeof note === "string") out.push("", `Note in config.json: ${note}`);
  }
  const cases = at(config, "hardware.cases");
  if (cases) {
    const names = Object.keys(cases);
    const rows = Object.entries(HARDWARE).map(([key, [what, unit, print, source]]) => [
      what,
      `\`${key}\``,
      ...names.map((n) => (cases[n][key] === undefined ? "" : print(cases[n][key]))),
      unit,
      source,
    ]);
    const head = ["What", "Key", ...names.map((n) => n[0].toUpperCase() + n.slice(1)), "Unit"];
    out.push("", "### Hardware cases", "", ...table([...head, "Source"], rows));
    const notes = at(config, "hardware.source") ?? {};
    if (Object.keys(notes).length) {
      out.push("", "Notes in config.json:", "");
      for (const [key, note] of Object.entries(notes)) out.push(`- \`${key}\`: ${note}`);
    }
  }
  return out.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = page(JSON.parse(readFileSync(CONFIG, "utf8")));
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(PAGE, "utf8");
    } catch {
      // A missing page is stale too.
    }
    if (current !== next) {
      console.error(`${PAGE} differs from ${CONFIG}: run node scripts/assumptions.mjs`);
      process.exit(1);
    }
    console.log(`${PAGE} matches ${CONFIG}`);
  } else {
    writeFileSync(PAGE, next);
    console.log(`${PAGE} written from ${CONFIG}`);
  }
}
