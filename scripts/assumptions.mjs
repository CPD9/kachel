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
const WEATHER = "Open-Meteo archive, 2025 (CC BY 4.0)";
const ELCOM = "[3] ElCom 2026 H4 median, a placeholder for Basel (IWB)";
const FIELD_COP = "[4] Fraunhofer ISE field test";
const PCSP = "[9] PCSP server prices 2026";
const VRLA = "[10] VRLA Tech workstation 2026";
const LOOP = "[11] Watercooling UK";
const WBAG = "[12] WBAG Regietarif 2025";
const EIT = "[13] EIT.nordwest rates 2026";
const LIFE = "[14] SiliconANGLE, [15] Amazon 10-K 2025; 6 also the case owner (21 Nov 2026)";
const RESALE = "[41] Servnet ITAD value study 2026";
const WACC = "[16] UVEK grid WACC, [17] pv magazine";
export const GUESS = "our guess";
const ASR = "[19] Open ASR Leaderboard";
const MLPERF = "[21] MLPerf Inference v6.0";
const BATCH_API = "[22] OpenAI Batch API";
const MEASURED = "[24] our measurement";
const PVGIS = "[25] PVGIS 5.3";
const PV_MODEL = "[26] Spencer, [27] Erbs et al., [28] Liu and Jordan";
const PV_PRICES = "[29] EnergieSchweiz PV prices 2025";
const KLEIV = "[30] federal one-off payment (CKW)";
const FEED_IN = "[31] IWB feed-in tariff";
const SWISSOLAR = "[32] Swissolar factsheet 2025";
const IWB_2027 = "[3] ElCom, IWB Basel 2027 H4";
const SONNENDACH = "[38] Meteotest and Egon AG for SFOE (Sonnendach), from SIA 2024";
const RENOVATION = "[39] EnergieSchweiz and EnFK 2019";

/** Job values that have a source; every other job value is our guess (docs/job-types.md). */
const JOB_SOURCES = {
  "batch.label": `${MLPERF}, ${ASR}`,
  "batch.interruptible": `${MLPERF} (offline: the whole batch is there at the start)`,
  "batch.deadline_h": BATCH_API,
  "opportunistic.label": MEASURED,
  "opportunistic.interruptible": `${MEASURED}: it checkpoints every 64 items`,
};

const hour = (h) => `${String(h).padStart(2, "0")}:00`;

/** How to print a value. */
const show = {
  plain: (v) => (v === null ? "none" : String(v)),
  pct: (v) => `${Math.round(v * 100)} %`,
  rate: (v) => `${Number((v * 100).toFixed(2))} %`,
  hours: (v) => (v === null ? "none" : `${v} h`),
  range: (v) => (Array.isArray(v) ? `${v[0]} to ${v[1]}` : String(v)),
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
  "server.sizes_kw": [
    "Server sizes the map's card offers; price, flows and heat per kW",
    "kW",
    (v) => v.join(", "),
    GUESS,
  ],
  "server.gpu_workstation_kw": [
    "GPU workstation's power, at its case's full price",
    "kW",
    show.plain,
    `${VRLA}: 600 W GPU; the rest of the machine ${GUESS}`,
  ],
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
  "solar.roof_kwp": ["Roof PV size", "kWp", show.plain, GUESS],
  "solar.tilt_deg": ["Roof tilt", "°", show.plain, GUESS],
  "solar.azimuth_deg": ["Roof facing, 0 = south", "°", show.plain, GUESS],
  "solar.latitude": ["Latitude, Basel", "°", show.plain, PVGIS],
  "solar.longitude": ["Longitude, Basel", "°", show.plain, PVGIS],
  "solar.utc_offset_h": ["Time zone of the weather file", "h", show.plain, PV_MODEL],
  "solar.ground_albedo": ["Light the ground reflects", "", show.plain, PV_MODEL],
  "solar.performance_ratio": ["PV performance ratio", "", show.plain, PVGIS],
  "solar.battery_kwh": ["Battery size", "kWh", show.plain, GUESS],
  "solar.battery_round_trip": ["Battery round trip", "", show.pct, GUESS],
  "solar.feed_in_chf_per_kwh": ["Price for PV sold to the grid", "CHF/kWh", show.plain, FEED_IN],
  "solar.subsidy_chf_per_kwp": ["Federal one-off payment", "CHF/kWp", show.plain, KLEIV],
  "solar.iwb_2027_chf_per_kwh": ["Electricity price, IWB 2027", "CHF/kWh", show.plain, IWB_2027],
  "solar.case_for_results": ["Solar case the results use", "", show.plain, GUESS],
};

/** House quality (config.json: house_quality): heat by construction period, for the map's card. */
const USES = {
  single: "single-family house",
  multi: "flats and hotels",
  office: "offices",
  shop: "shops",
  restaurant: "restaurants",
  industry: "industry",
  assembly: "halls and churches",
  school: "schools, museums, libraries",
  hospital: "hospitals",
  sport: "sports halls",
};
for (const [kind, who] of Object.entries(USES)) {
  VALUES[`house_quality.space_heating_kwh_per_m2.${kind}`] = [
    `Space heating, stock mean, ${who}`,
    "kWh/m²",
    show.plain,
    SONNENDACH,
  ];
  VALUES[`house_quality.hot_water_kwh_per_m2.${kind}`] = [
    `Hot water, ${who}`,
    "kWh/m²",
    show.plain,
    SONNENDACH,
  ];
}
const PERIOD_WORDS = (p) =>
  p.startsWith("before_") || p.startsWith("after_") ? p.replace("_", " ") : p.replace("_", " to ");
for (const period of [
  "before_1919",
  "1919_1945",
  "1946_1960",
  "1961_1970",
  "1971_1980",
  "1981_1990",
  "1991_2000",
  "2001_2005",
  "2006_2010",
  "2011_2015",
  "after_2015",
]) {
  VALUES[`house_quality.period_factor.${period}`] = [
    `Space heating, built ${PERIOD_WORDS(period)}, times the mean`,
    "",
    show.plain,
    SONNENDACH,
  ];
}
VALUES["house_quality.renovated_factor"] = [
  "Space heating after a renovation, times before",
  "",
  show.plain,
  `${RENOVATION}; never below a new building: ${GUESS}`,
];

/** The synthetic fleet for make fleet (config.json: fleet). A [low, high] pair is one value. */
const FLEET_VALUES = {
  houses: ["Houses per city", "", show.plain],
  seed: ["Random seed that draws the jobs", "", show.plain],
  servers_per_house: ["Servers per house", "", show.range],
  tank_kwh: ["Hot-water tank", "kWh", show.range],
  space_heating_scale: ["Space heating, times the reference house", "", show.range],
  hot_water_kwh_per_day: ["Hot water a day", "kWh", show.range],
  interactive_jobs_per_house_per_day: ["Interactive jobs a day, per house", "", show.plain],
  interactive_hours_of_day: ["Interactive jobs start from, until before", "h", show.range],
  batch_jobs_per_house_per_day: ["Batch jobs a day, per house", "", show.plain],
  batch_hours: ["Size of a batch job", "server-hours", show.range],
  batch_deadline_h: ["Batch deadline after arrival", "h", show.range],
  backlog_jobs_per_house_per_day: ["Backlog jobs a day, per house", "", show.plain],
  backlog_hours: ["Size of a backlog job", "server-hours", show.range],
  backlog_deadline_h: ["Backlog deadline after arrival", "h", show.plain],
  warmup_days: ["Days run before the shown day", "", show.plain],
};

for (const [key, [what, unit, print, source]] of Object.entries(FLEET_VALUES)) {
  VALUES[`fleet.${key}`] = [what, unit, print, source ?? GUESS];
}

/** Each fleet city (config.json: fleet.cities) and each fleet run (fleet.runs). */
const CITY_VALUES = {
  weather: ["weather file", "", show.plain, WEATHER],
  seed: ["random seed that draws the houses", "", show.plain],
  id_prefix: ["house id prefix", "", show.plain],
  name_prefix: ["house name prefix", "", show.plain],
  latitude: ["latitude range of the houses", "°N", show.range],
  longitude: ["longitude range of the houses", "°E", show.range],
};

for (const city of ["Basel", "Bern"]) {
  for (const [key, [what, unit, print, source]] of Object.entries(CITY_VALUES)) {
    VALUES[`fleet.cities.${city}.${key}`] = [`${city}: ${what}`, unit, print, source ?? GUESS];
  }
}

const runs = (v) => v.join(" and ");
for (const run of ["fleet", "fleet_bern", "fleet_basel_bern"]) {
  VALUES[`fleet.runs.${run}`] = [`Run ${run}: one fleet of`, "", runs, GUESS];
}

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
    VALUES[`jobs.${kind}.${key}`] = [what, unit, print, JOB_SOURCES[`${kind}.${key}`] ?? GUESS];
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
  resale_share: ["Resale at the end of life, share of the server price", "", show.rate, RESALE],
  discount_rate: ["Discount rate", "", show.rate, `${WACC}; high case ${GUESS}`],
};

/** Each solar case's values (config.json: solar.cases), shown side by side. */
export const SOLAR = {
  pv_chf_per_kwp: ["Roof PV price", "CHF/kWp", show.plain, PV_PRICES],
  battery_chf: ["Battery, 10 kWh", "CHF", show.plain, `${PV_PRICES}, ${SWISSOLAR}`],
  pv_upkeep_share_per_year: ["PV upkeep a year, share of its price", "", show.rate, GUESS],
  pv_lifetime_years: ["PV lifetime", "years", show.plain, `${SWISSOLAR}; mid, high ${GUESS}`],
  battery_lifetime_years: ["Battery lifetime", "years", show.plain, GUESS],
  discount_rate: ["Discount rate", "", show.rate, "[17] pv magazine"],
};

const CASES = "hardware.cases.";
const SOLAR_CASES = "solar.cases.";

/** Keys that describe the file rather than hold a value. */
const NOT_VALUES = new Set(["_note", "source"]);

/** Every value path in config.json, depth first, stopping at a value or a job's arrivals. */
export function valuePaths(node, prefix = "") {
  return Object.entries(node).flatMap(([key, value]) => {
    if (NOT_VALUES.has(key)) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    const leaf =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      key === "arrivals_server_h";
    return leaf ? [path] : valuePaths(value, path);
  });
}

const at = (config, path) => path.split(".").reduce((node, key) => node?.[key], config);
const known = (path) => {
  if (path.startsWith(CASES)) return path.split(".").pop() in HARDWARE;
  if (path.startsWith(SOLAR_CASES)) return path.split(".").pop() in SOLAR;
  return path in VALUES;
};

/** One table with a column per case, then the notes from config.json. */
function casesTable(config, prefix, title, spec) {
  const cases = at(config, `${prefix}.cases`);
  if (!cases) return [];
  const names = Object.keys(cases);
  const rows = Object.entries(spec).map(([key, [what, unit, print, source]]) => [
    what,
    `\`${key}\``,
    ...names.map((n) => (cases[n][key] === undefined ? "" : print(cases[n][key]))),
    unit,
    source,
  ]);
  const head = ["What", "Key", ...names.map((n) => n[0].toUpperCase() + n.slice(1)), "Unit"];
  const out = ["", `### ${title}`, "", ...table([...head, "Source"], rows)];
  const notes = at(config, `${prefix}.source`) ?? {};
  if (typeof notes === "object" && Object.keys(notes).length) {
    out.push("", "Notes in config.json:", "");
    for (const [key, note] of Object.entries(notes)) out.push(`- \`${key}\`: ${note}`);
  }
  return out;
}

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
  ["House quality (the map's card)", "house_quality"],
  ["Server", "server"],
  ["Prices", "prices"],
  ["Model", null],
  ["Interactive jobs", "jobs.interactive"],
  ["Batch jobs", "jobs.batch"],
  ["Backlog jobs", "jobs.opportunistic"],
  ["Fleet (synthetic, make fleet)", "fleet"],
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
  const section = (title, prefix) => {
    const mine = paths.filter((p) =>
      prefix
        ? p.startsWith(`${prefix}.`) && !p.startsWith(CASES) && !p.startsWith(SOLAR_CASES)
        : !p.includes("."),
    );
    if (mine.length === 0) return;
    const rows = mine.map((p) => {
      const [what, unit, print, source] = VALUES[p];
      return [what, `\`${p.split(".").pop()}\``, print(at(config, p)), unit, source];
    });
    out.push("", `## ${title}`, "", ...table(["What", "Key", "Value", "Unit", "Source"], rows));
    const note = prefix ? at(config, prefix).source : undefined;
    if (typeof note === "string") out.push("", `Note in config.json: ${note}`);
  };
  for (const [title, prefix] of SECTIONS) section(title, prefix);
  out.push(...casesTable(config, "hardware", "Hardware cases", HARDWARE));
  section("Solar and battery", "solar");
  out.push(...casesTable(config, "solar", "Solar cases", SOLAR));
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
