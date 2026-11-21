import assert from "node:assert/strict";
import { test } from "node:test";
import { END, FIGURES, START, figuresBlock, withFigures } from "./readme-figures.mjs";

const kpis = {
  servers_per_house: 6,
  share_of_heat_covered_pct: 73.4,
  heat_dumped_kwh: 1234.4,
  utilisation_pct: 61,
  missed_deadlines_pct_of_jobs: 0.4,
  electricity_cost_chf: 2890.2,
  computing_income_chf: 4100.9,
  break_even_chf_per_server_hour: 0.2851,
  profile_source: "Open-Meteo archive, Basel 2025",
  generated: "2026-11-21",
};

test("prints every figure with its unit, and the source line", () => {
  const block = figuresBlock(kpis);
  assert.match(block, /\| Share of heat demand covered \| 73 % \|/);
  assert.match(block, /\| Heat dumped \| 1,234 kWh \|/);
  assert.match(block, /\| Break-even per server-hour \| CHF 0\.29 \|/);
  assert.match(block, /Source: Open-Meteo archive, Basel 2025, generated 2026-11-21/);
  assert.equal(block.split("\n").filter((l) => l.startsWith("| ")).length, FIGURES.length + 2);
});

test("refuses kpis with a figure missing", () => {
  const { utilisation_pct: _, ...partial } = kpis;
  assert.throws(() => figuresBlock(partial), /utilisation_pct/);
});

test("replaces only the block between the markers", () => {
  const readme = `# Kachel\n\n${START}\nold\n${END}\n\nMore.\n`;
  const next = withFigures(readme, kpis);
  assert.ok(next?.startsWith("# Kachel\n\n<!-- figures:start -->"));
  assert.ok(next?.endsWith(`${END}\n\nMore.\n`));
  assert.ok(!next?.includes("old"));
  assert.equal(withFigures(next ?? "", kpis), next);
});

test("says when the README has no markers", () => {
  assert.equal(withFigures("# Kachel\n", kpis), null);
});
