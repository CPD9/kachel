import { describe, expect, it } from "vitest";
import {
  keepNewest,
  NO_DECISIONS,
  watchDecisions,
  type DecisionFeed,
  type DecisionState,
  type LiveDecision,
} from "./decisions";

const decision = (seq: number, at = seq): LiveDecision => ({
  hash: String(seq).padStart(64, "a"),
  prev_hash: "0".repeat(64),
  seq,
  site_id: "00000000-0000-4000-8000-000000000100",
  time: `2025-07-15T${String(seq % 24).padStart(2, "0")}:00:00+02:00`,
  temp_c: 19.5,
  demand_kwh: 0.5,
  soc_kwh: 34.3,
  tank_kwh: 35,
  interactive: 0,
  batch: 0,
  opportunistic: seq % 2,
  reason: seq % 2 ? "heat needed" : "tank full / no heat sink: backlog paused",
  run: [],
  placed: 0,
  written_at: new Date(Date.UTC(2026, 10, 22, 2, 0, at)).toISOString(),
});

describe("keepNewest", () => {
  it("keeps the newest few, newest first, each once", () => {
    let list: LiveDecision[] = [];
    for (const seq of [3, 1, 2, 5, 4, 2]) list = keepNewest(list, decision(seq), 3);
    expect(list.map((d) => d.seq)).toEqual([5, 4, 3]);
  });

  it("orders by seq when two were written in the same instant", () => {
    const list = keepNewest([decision(7, 1)], decision(8, 1));
    expect(list.map((d) => d.seq)).toEqual([8, 7]);
  });
});

describe("watchDecisions", () => {
  it("keeps a decision heard before the first read finished", async () => {
    let hear: (d: LiveDecision) => void = () => undefined;
    let release: () => void = () => undefined;
    const feed: DecisionFeed = {
      load: () => new Promise((resolve) => (release = () => resolve([decision(1)]))),
      subscribe(on) {
        hear = on;
        return () => undefined;
      },
    };
    let state: DecisionState = NO_DECISIONS;
    const stop = watchDecisions(feed, (next) => (state = next(state)));
    hear(decision(2));
    release();
    await Promise.resolve();
    expect(state.status).toBe("live");
    expect(state.decisions.map((d) => d.seq)).toEqual([2, 1]);
    stop();
  });

  it("says so when the read fails", async () => {
    const feed: DecisionFeed = {
      load: () => Promise.reject(new Error("down")),
      subscribe: () => () => undefined,
    };
    let state: DecisionState = NO_DECISIONS;
    watchDecisions(feed, (next) => (state = next(state)));
    await Promise.resolve();
    await Promise.resolve();
    expect(state.status).toBe("error");
  });
});
