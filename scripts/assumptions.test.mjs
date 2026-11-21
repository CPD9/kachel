import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONFIG, GUESS, page, table, valuePaths } from "./assumptions.mjs";

const config = JSON.parse(readFileSync(CONFIG, "utf8"));

test("gives every value in config.json a row with its source", () => {
  const text = page(config);
  assert.match(text, /\| Hot-water tank +\| `tank_kwh` +\| 35 +\| kWh +\| \[1\] DigitalHeat/);
  assert.match(text, /\| Price of a server-hour of compute +\| .* \| our guess +\|/);
  assert.match(text, /\| Discount rate .*\| 3\.28 % +\| 3\.75 % +\| 6 % +\|/);
  for (const line of text.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| -"))) {
    const source = line.split("|").at(-2).trim();
    assert.ok(source.length > 0, `no source on: ${line}`);
  }
});

test("refuses a new value that has no source", () => {
  const more = { ...config, server: { ...config.server, fan_watts: 40 } };
  assert.throws(() => page(more), /server\.fan_watts/);
});

test("skips the notes and keeps a job's arrivals as one value", () => {
  const paths = valuePaths(config);
  assert.ok(!paths.some((p) => p.endsWith(".source") || p === "_note"));
  assert.ok(paths.includes("jobs.batch.arrivals_server_h"));
  assert.ok(!paths.includes("jobs.batch.arrivals_server_h.6"));
});

test("lays tables out as Prettier does", () => {
  assert.deepEqual(table(["A", "Bee"], [["long cell", GUESS]]), [
    "| A         | Bee       |",
    "| --------- | --------- |",
    "| long cell | our guess |",
  ]);
});
