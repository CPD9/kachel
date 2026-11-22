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

test("lists the solar cases side by side with their sources", () => {
  const text = page(config);
  assert.match(
    text,
    /\| Roof PV price +\| `pv_chf_per_kwp` +\| 1659 +\| 1911 +\| 2237 +\| CHF\/kWp +\| \[29\]/,
  );
  assert.match(text, /\| Price for PV sold to the grid +\| .* \| 0\.14 +\| CHF\/kWh +\| \[31\]/);
});

test("refuses a new solar case value that has no source", () => {
  const cases = { ...config.solar.cases, mid: { ...config.solar.cases.mid, inverter_chf: 900 } };
  assert.throws(() => page({ ...config, solar: { ...config.solar, cases } }), /inverter_chf/);
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
  assert.ok(paths.includes("fleet.tank_kwh"));
  assert.ok(!paths.includes("fleet.tank_kwh.0"));
});

test("prints a fleet range as low to high", () => {
  assert.match(
    page(config),
    /\| Hot-water tank +\| `tank_kwh` +\| 20 to 50 +\| kWh +\| our guess +\|/,
  );
});

test("lays tables out as Prettier does", () => {
  assert.deepEqual(table(["A", "Bee"], [["long cell", GUESS]]), [
    "| A         | Bee       |",
    "| --------- | --------- |",
    "| long cell | our guess |",
  ]);
});

test("keeps the tagging jobs' derived figures in step with their sources", () => {
  const { image_tagging: img, video_tagging: vid } = config.workloads;
  const joules = img.mlperf_system_w / img.mlperf_images_per_s;
  assert.equal(Number(joules.toFixed(4)), img.j_per_image);
  assert.equal(Math.round(3.6e6 / joules / 1000) * 1000, img.images_per_server_hour);
  // Wh per hour of footage: frames a second x 3,600 s x J a frame, over 3,600 J a Wh
  assert.equal(Number((vid.sampled_fps * joules).toFixed(4)), vid.tag_wh_per_footage_hour);
  const decodeS = (vid.footage_fps * 3600) / vid.decode_fps_per_engine;
  assert.equal(Number(decodeS.toFixed(1)), vid.decode_s_per_footage_hour);
  for (const job of [img, vid]) assert.equal(job.runs_as, "batch");
});
