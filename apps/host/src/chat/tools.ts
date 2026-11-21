import type { HouseFeed, HouseRows, JobFeed, JobState, LiveJob, LiveServer } from "@kachel/db";
import { SOLAR, TARIFFS, building } from "@kachel/economics";
import { ZONE, chooseDay, dayMoney, hourAt, toDays, toPrices, type Day } from "../house/day";
import { clock, longDate } from "../house/format";
import type { ToolSpec } from "./model";

/** One value a tool read, with where it came from. Tool cards show these as they are. */
export type Fact = { label: string; value: number | string; unit?: string; source: string };

/** What a tool returns: its facts, or none and a note that says why. */
export type ToolResult = { tool: ToolName; title: string; facts: Fact[]; note?: string };

/** The newest run of a job, from job_runs: why the agent last paused or resumed it. */
export type JobRun = {
  job_id: string;
  tick: number;
  at: string;
  state: JobState;
  reason: string | null;
};

/** Where the tools read: the app's own feeds, plus job_runs for the reasons. */
export interface ChatData {
  house: HouseFeed;
  jobs: JobFeed;
  /** The newest run of each of these jobs. */
  runs(jobIds: string[]): Promise<JobRun[]>;
  now(): Date;
}

export const TOOL_SPECS = [
  {
    name: "heat_now",
    description:
      "The house this hour: heat stored in the hot-water tank (kWh, and how full), outdoor temperature, heat demand, heat from the servers, backup heat, servers working and the scheduler's reason.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "heat_today",
    description:
      "Totals for today (or the replayed day): heat demand, heat from the servers, backup heat, heat dumped, server-hours and the servers' share of the heat.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "money",
    description:
      "What the servers earned today and this year: computing income, electricity cost, value of the heat they saved and what is left before hardware.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "jobs",
    description:
      "Each server's state (running, paused, off), the job on it and why the agent last paused or resumed it. Pass server to ask about one server by its number.",
    parameters: {
      type: "object",
      properties: { server: { type: "integer", description: "The server's number, e.g. 4." } },
    },
  },
  {
    name: "solar",
    description:
      "What a roof PV system (and a battery) would save this house on the servers' electricity a year, its payback, and the electricity tariffs behind it.",
    parameters: { type: "object", properties: {} },
  },
] as const satisfies readonly ToolSpec[];

export type ToolName = (typeof TOOL_SPECS)[number]["name"];

const TITLES: Record<ToolName, string> = {
  heat_now: "Heat now",
  heat_today: "Heat today",
  money: "Money",
  jobs: "Servers and jobs",
  solar: "Solar",
};

export const isToolName = (name: string): name is ToolName => name in TITLES;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

const stamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: ZONE,
});
/** 21 Nov 2026, 14:16 in Basel. */
const when = (iso: string) => stamp.format(new Date(iso));

const empty = (tool: ToolName, note: string): ToolResult => ({
  tool,
  title: TITLES[tool],
  facts: [],
  note,
});

/** The day the host screen shows: today when the scheduler wrote it, else a replay. */
function shownDay(rows: HouseRows, now: Date): { day: Day; live: boolean; label: string } | string {
  if (rows.site === null) return "No house is linked to this account yet.";
  const shown = chooseDay(toDays(rows.hours), now);
  if (!shown) return "The scheduler has not written any hours for this house yet.";
  const label = shown.live
    ? "Live: today's hours from the scheduler"
    : `Replay of ${longDate(shown.day.date)} from the scheduler's yearly run; no hours for today yet`;
  return { ...shown, label };
}

async function heatNow(data: ChatData): Promise<ToolResult> {
  const rows = await data.house.load();
  const shown = shownDay(rows, data.now());
  if (typeof shown === "string") return empty("heat_now", shown);
  const current = hourAt(shown.day, data.now());
  if (!current) return empty("heat_now", "No hour has been written yet for this time of day.");
  const { row, hour } = current;
  const at = `heat_state at ${clock(hour)} on ${longDate(shown.day.date)}`;
  const tank = rows.site?.tank_kwh ?? 0;
  const facts: Fact[] = [
    { label: "Data", value: shown.label, source: "heat_state" },
    {
      label: "Heat stored in the tank",
      value: r1(row.soc_kwh),
      unit: "kWh",
      source: `${at}: soc_kwh`,
    },
    { label: "Tank size", value: r1(tank), unit: "kWh", source: "sites.tank_kwh" },
  ];
  if (tank > 0) {
    facts.push({
      label: "Tank full",
      value: Math.round((row.soc_kwh / tank) * 100),
      unit: "%",
      source: "soc_kwh ÷ tank_kwh",
    });
  }
  if (row.temp_c !== null) {
    facts.push({ label: "Outdoor", value: r1(row.temp_c), unit: "°C", source: `${at}: temp_c` });
  }
  facts.push(
    { label: "Heat demand", value: r1(row.demand_kwh), unit: "kWh", source: `${at}: demand_kwh` },
    {
      label: "Heat from the servers",
      value: r1(row.heat_used),
      unit: "kWh",
      source: `${at}: heat_used`,
    },
    { label: "Backup heat", value: r1(row.backup_kwh), unit: "kWh", source: `${at}: backup_kwh` },
    { label: "Servers working", value: row.server_hours, source: `${at}: server_hours` },
  );
  if (row.reason)
    facts.push({ label: "Scheduler's reason", value: row.reason, source: `${at}: reason` });
  return {
    tool: "heat_now",
    title: TITLES.heat_now,
    facts,
    note: "The tank has no water temperature reading, only the heat it stores.",
  };
}

async function heatToday(data: ChatData): Promise<ToolResult> {
  const shown = shownDay(await data.house.load(), data.now());
  if (typeof shown === "string") return empty("heat_today", shown);
  const rows = shown.day.hours.filter((r) => r !== undefined);
  const sum = (k: "demand_kwh" | "heat_used" | "backup_kwh" | "dumped_kwh" | "server_hours") =>
    rows.reduce((s, r) => s + r[k], 0);
  const used = sum("heat_used");
  const backup = sum("backup_kwh");
  const at = `sum of heat_state over ${rows.length} hours of ${longDate(shown.day.date)}`;
  const facts: Fact[] = [
    { label: "Data", value: shown.label, source: "heat_state" },
    {
      label: "Heat demand",
      value: r1(sum("demand_kwh")),
      unit: "kWh",
      source: `${at}: demand_kwh`,
    },
    { label: "Heat from the servers", value: r1(used), unit: "kWh", source: `${at}: heat_used` },
    { label: "Backup heat", value: r1(backup), unit: "kWh", source: `${at}: backup_kwh` },
    {
      label: "Heat dumped",
      value: r1(sum("dumped_kwh")),
      unit: "kWh",
      source: `${at}: dumped_kwh`,
    },
    { label: "Server-hours", value: sum("server_hours"), unit: "h", source: `${at}: server_hours` },
  ];
  if (used + backup > 0) {
    facts.push({
      label: "Servers' share of the heat",
      value: Math.round((used / (used + backup)) * 100),
      unit: "%",
      source: "heat_used ÷ (heat_used + backup_kwh)",
    });
  }
  return { tool: "heat_today", title: TITLES.heat_today, facts };
}

async function money(data: ChatData): Promise<ToolResult> {
  const rows = await data.house.load();
  const shown = shownDay(rows, data.now());
  const prices = toPrices(rows.assumptions);
  const facts: Fact[] = [];
  const notes: string[] = [];
  if (typeof shown === "string") notes.push(shown);
  else if (!prices) notes.push("The prices for a day's money are missing from assumptions.");
  else {
    const m = dayMoney(shown.day, prices);
    const day = shown.live ? "Today" : longDate(shown.day.date);
    const why = `${m.serverHours} server-hours on ${day}`;
    facts.push(
      { label: "Day", value: shown.label, source: "heat_state" },
      {
        label: `${day}: earned from computing`,
        value: r2(m.earned),
        unit: "CHF",
        source: `${why} × ${prices.compute.label} ${prices.compute.value} (assumptions)`,
      },
      {
        label: `${day}: electricity for the servers`,
        value: r2(m.electricity),
        unit: "CHF",
        source: `${why} × ${prices.power.value} kW × ${prices.electricity.label} ${prices.electricity.value} (assumptions)`,
      },
      {
        label: `${day}: heat it saved`,
        value: r2(m.heatSaved),
        unit: "CHF",
        source: `${r1(m.heatUsedKwh)} kWh × ${prices.electricity.value} ÷ COP ${prices.cop.value} (assumptions)`,
      },
      {
        label: `${day}: left before hardware`,
        value: r2(m.left),
        unit: "CHF",
        source: "earned − electricity + heat saved",
      },
    );
  }
  const year = rows.year;
  if (!year) notes.push("The yearly balance has not been computed yet.");
  else {
    const src = (col: string) =>
      `kpis.${col}, computed ${year.computed_at.slice(0, 10)} on ${year.profile_source}`;
    facts.push(
      {
        label: "Year: earned from computing",
        value: Math.round(year.computing_income_chf),
        unit: "CHF",
        source: src("computing_income_chf"),
      },
      {
        label: "Year: electricity for the servers",
        value: Math.round(year.electricity_cost_chf),
        unit: "CHF",
        source: src("electricity_cost_chf"),
      },
      {
        label: "Year: heat it saved",
        value: Math.round(year.value_of_heat_used_chf),
        unit: "CHF",
        source: src("value_of_heat_used_chf"),
      },
      {
        label: "Year: left before hardware",
        value: Math.round(
          year.computing_income_chf - year.electricity_cost_chf + year.value_of_heat_used_chf,
        ),
        unit: "CHF",
        source: "kpis: earned − electricity + heat saved",
      },
      {
        label: "Year: share of heat from the servers",
        value: r1(year.share_of_heat_covered_pct),
        unit: "%",
        source: src("share_of_heat_covered_pct"),
      },
    );
  }
  return {
    tool: "money",
    title: TITLES.money,
    facts,
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
}

const newestJob = (jobs: LiveJob[]) =>
  jobs.reduce<LiveJob | undefined>(
    (a, b) => (a && Date.parse(a.updated_at) >= Date.parse(b.updated_at) ? a : b),
    undefined,
  );

async function jobs(data: ChatData, args: Record<string, unknown>): Promise<ToolResult> {
  const { servers, jobs: all } = await data.jobs.load();
  if (servers.length === 0) return empty("jobs", "No servers are linked to this house.");
  const wanted = Number(args["server"]);
  const picked: LiveServer[] =
    Number.isInteger(wanted) && wanted > 0
      ? servers.filter((s) => s.slot === wanted)
      : [...servers].sort((a, b) => a.slot - b.slot);
  if (picked.length === 0) return empty("jobs", `This house has no server ${wanted}.`);
  const onServer = new Map(
    picked.map((s) => [
      s.id,
      newestJob(all.filter((j) => j.server_id === s.id && j.state !== "QUEUED")),
    ]),
  );
  const ids = [...onServer.values()].flatMap((j) => (j ? [j.id] : []));
  const runs = ids.length ? await data.runs(ids) : [];
  const facts: Fact[] = [];
  for (const s of picked) {
    facts.push({
      label: s.name,
      value: s.state,
      source: `servers.state, updated ${when(s.updated_at)}`,
    });
    const job = onServer.get(s.id);
    if (!job) continue;
    facts.push({
      label: `${s.name}: job`,
      value: `${job.label} (${job.state})`,
      source: `jobs.label, jobs.state`,
    });
    const run = runs.find((r) => r.job_id === job.id);
    if (run?.reason) {
      facts.push({
        label: `${s.name}: why`,
        value: run.reason,
        source: `job_runs.reason, ${when(run.at)} (${run.state})`,
      });
    }
  }
  const queued = all.filter((j) => j.state === "QUEUED");
  if (queued.length && picked.length > 1) {
    facts.push({
      label: "Jobs waiting in the queue",
      value: queued.length,
      source: "jobs.state = QUEUED",
    });
  }
  return { tool: "jobs", title: TITLES.jobs, facts };
}

/**
 * Roof PV for this house at its own tariff (the reference house pays IWB's household price), from
 * the economics page's yearly runs. The Swiss median is the fallback when that price is not run.
 */
function solar(): ToolResult {
  const own = building("basel_house")?.defaultTariff;
  const tariff = own ? TARIFFS[own] : undefined;
  const run = SOLAR.byPrice.find((p) => p.chfPerKwh === tariff?.chfPerKwh) ?? SOLAR.byPrice[0];
  if (!run) return empty("solar", "The economics page has no solar run yet.");
  const name = Object.values(TARIFFS).find((t) => t.chfPerKwh === run.chfPerKwh);
  const src = `packages/economics SOLAR (${SOLAR.source})`;
  const cost = `${src}, ${SOLAR.costCase} prices`;
  const pv = run.setups.pv;
  const battery = run.setups.pv_battery;
  const facts: Fact[] = [
    {
      label: "Electricity price",
      value: run.chfPerKwh,
      unit: "CHF/kWh",
      source: name ? `${name.name}: ${name.source}` : "packages/economics",
    },
    {
      label: "Roof PV",
      value: SOLAR.roofKwp,
      unit: "kWp",
      source: "config.json solar.roof_kwp (our guess)",
    },
    {
      label: "PV saves the servers",
      value: pv.savingChfPerYear ?? 0,
      unit: "CHF a year",
      source: src,
    },
    {
      label: "Servers' power from own PV",
      value: pv.ownPvShareOfServerPowerPct,
      unit: "%",
      source: src,
    },
    { label: "PV costs", value: pv.solarCapexChf ?? 0, unit: "CHF", source: cost },
    { label: "PV pays back in", value: pv.paybackYearsMid ?? 0, unit: "years", source: cost },
    {
      label: `PV and a ${SOLAR.batteryKwh} kWh battery save`,
      value: battery.savingChfPerYear ?? 0,
      unit: "CHF a year",
      source: src,
    },
    {
      label: "PV and battery pay back in",
      value: battery.paybackYearsMid ?? 0,
      unit: "years",
      source: cost,
    },
  ];
  return {
    tool: "solar",
    title: TITLES.solar,
    facts,
    note: `For the ${SOLAR.house} on the 2025 Basel weather, not measured on this roof. The saving is on the servers' electricity only; sun they cannot use is sold at ${SOLAR.feedInChfPerKwh} CHF/kWh.`,
  };
}

/** Run one of the closed tools; anything else is refused. Reads fail as a note, never a throw. */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  data: ChatData,
): Promise<ToolResult | undefined> {
  if (!isToolName(name)) return undefined;
  try {
    switch (name) {
      case "heat_now":
        return await heatNow(data);
      case "heat_today":
        return await heatToday(data);
      case "money":
        return await money(data);
      case "jobs":
        return await jobs(data, args);
      case "solar":
        return solar();
    }
  } catch {
    return empty(name, "The house's data could not be read right now.");
  }
}
