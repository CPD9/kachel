import { describe, expect, it } from "vitest";
import { NO_HOUSE, watchHouse, type HouseFeed, type HouseHour, type HouseState } from "./index";

const SITE = "00000000-0000-4000-8000-000000000100";
const hour: HouseHour = {
  site_id: SITE,
  time: "2025-01-13T14:00:00+01:00",
  temp_c: 2.0,
  demand_kwh: 7.53,
  server_hours: 6,
  heat_produced: 4.8,
  heat_used: 4.8,
  backup_kwh: 2.73,
  dumped_kwh: 0,
  soc_kwh: 0,
  reason: "heat needed",
};
const site = { id: SITE, name: "Reference house", city: "Basel", tank_kwh: 35 };

/** A house feed the test drives by hand, with a read it lets through when it likes. */
function fakeFeed() {
  const listeners: Parameters<HouseFeed["subscribe"]>[0][] = [];
  let release: () => void = () => undefined;
  const feed: HouseFeed = {
    load: () =>
      new Promise((resolve) => {
        release = () => resolve({ site, hours: [hour], year: null, assumptions: [] });
      }),
    subscribe(on) {
      listeners.push(on);
      return () => listeners.splice(listeners.indexOf(on), 1);
    },
  };
  let state: HouseState = NO_HOUSE;
  const stop = watchHouse(feed, (next) => {
    state = next(state);
  });
  return {
    listeners,
    stop,
    state: () => state,
    push: (h: HouseHour) => listeners.forEach((on) => on.hour(h)),
    release: async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const at = Date.parse(hour.time);

describe("watchHouse", () => {
  it("keeps an hour that changes before the first read", async () => {
    const f = fakeFeed();
    f.push({ ...hour, backup_kwh: 1.0 });
    await f.release();
    expect(f.state().status).toBe("live");
    expect(f.state().hours.get(at)?.backup_kwh).toBe(1.0);
  });

  it("places a new hour and replaces a changed one", async () => {
    const f = fakeFeed();
    await f.release();
    f.push({ ...hour, time: "2025-01-13T15:00:00+01:00" });
    f.push({ ...hour, heat_used: 3.2 });
    expect(f.state().hours.size).toBe(2);
    expect(f.state().hours.get(at)?.heat_used).toBe(3.2);
  });

  it("ignores another house's hours", async () => {
    const f = fakeFeed();
    await f.release();
    f.push({ ...hour, site_id: "another", heat_used: 0 });
    expect(f.state().hours.get(at)?.heat_used).toBe(4.8);
  });

  it("stops listening and ignores a read that comes back late", async () => {
    const f = fakeFeed();
    f.stop();
    expect(f.listeners).toHaveLength(0);
    await f.release();
    expect(f.state().status).toBe("loading");
  });
});
