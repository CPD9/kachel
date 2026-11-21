import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, residentialNearest, wgs84 } from "./place-fleet.mjs";

test("converts LV95 to WGS84 within a few metres", () => {
  // Grünpfahlgasse 8, Basel, as GWR gives it in both systems.
  const [lon, lat] = wgs84(2611228.626, 1267339.125);
  assert.ok(Math.abs(lon - 7.587826) < 0.00005, `lon ${lon}`);
  assert.ok(Math.abs(lat - 47.556639) < 0.00005, `lat ${lat}`);
});

test("keeps residential buildings only, nearest first, once each", () => {
  const near = residentialNearest(
    [
      { properties: { egid: "1", gkat: 1060, gkode: 2611300, gkodn: 1267400 } },
      { properties: { egid: "2", gkat: 1020, gkode: 2611400, gkodn: 1267400 } },
      { properties: { egid: "3", gkat: 1040, gkode: 2611310, gkodn: 1267400 } },
      { properties: { egid: "3", gkat: 1040, gkode: 2611310, gkodn: 1267400 } },
    ],
    ...wgs84(2611300, 1267400),
    5,
  );
  assert.deepEqual(
    near.map((b) => b.egid),
    [3, 2],
  );
});

test("reads the fleet CSV header and rows", () => {
  const rows = parseCsv("id,city,servers\nhouse-01,Basel,7\n");
  assert.deepEqual(rows, [{ id: "house-01", city: "Basel", servers: "7" }]);
});
