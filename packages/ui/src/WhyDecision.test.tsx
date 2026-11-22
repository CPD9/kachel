import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { replayed, verdict, WhyDecision, type Decision } from "./WhyDecision";

const paused: Decision = {
  hash: "5ec7b4868fd0" + "1".repeat(52),
  prev_hash: "bbd5351f864b" + "2".repeat(52),
  seq: 24,
  time: "2025-07-15T00:00:00+02:00",
  temp_c: 19.5,
  demand_kwh: 0.5,
  soc_kwh: 34.8,
  tank_kwh: 35,
  interactive: 0,
  batch: 0,
  opportunistic: 0,
  reason: "tank full / no heat sink: backlog paused",
  run: [],
  placed: 0,
};
const running: Decision = {
  ...paused,
  hash: "91156f8a4342" + "3".repeat(52),
  prev_hash: paused.hash,
  seq: 25,
  time: "2025-07-15T01:00:00+02:00",
  soc_kwh: 34.3,
  opportunistic: 1,
  reason: "heat needed",
  run: ["00000000-0000-4000-8000-000000000304"],
};

afterEach(cleanup);

describe("WhyDecision", () => {
  it("shows the newest decision with what it saw, why, and its hash", () => {
    render(<WhyDecision decisions={[running, paused]} status="live" />);
    expect(screen.getByRole("heading", { name: /Why this decision/ })).toBeTruthy();
    expect(screen.getByText("Backlog runs on 1 server")).toBeTruthy();
    expect(screen.getByText("heat needed")).toBeTruthy();
    expect(screen.getByText("34.3 kWh")).toBeTruthy();
    expect(screen.getByText("Tank of 35")).toBeTruthy();
    expect(screen.getByText("19.5 °C")).toBeTruthy();
    expect(screen.getByText(running.hash)).toBeTruthy();
    expect(screen.getByText(/after 5ec7b4868fd0/)).toBeTruthy();
    expect(screen.getByText(/15 Jul 2025, 01:00/)).toBeTruthy();
    // the one before, in the list
    expect(screen.getByText("5ec7b4868fd0")).toBeTruthy();
    expect(screen.getByText(/Backlog paused/)).toBeTruthy();
  });

  it("says how to start the loop when there is no decision yet", () => {
    render(<WhyDecision decisions={[]} status="live" tone="dark" />);
    expect(screen.getByText(/make live/)).toBeTruthy();
  });

  it("names sessions and batch next to the backlog", () => {
    expect(verdict({ ...paused, interactive: 1, batch: 2 })).toBe(
      "Backlog paused; 1 session, 2 batch too",
    );
  });

  it("marks a replayed day's hour, so 2025 is not read as a stale row", () => {
    const replay = { ...running, written_at: "2026-11-22T02:00:00Z" };
    expect(replayed(replay)).toBe(true);
    expect(replayed({ ...running, written_at: "2025-07-15T01:00:05+02:00" })).toBe(false);
    expect(replayed(running)).toBe(false);
    render(<WhyDecision decisions={[replay]} status="live" />);
    expect(screen.getByText(/Replayed hour: 15 Jul 2025, 01:00/)).toBeTruthy();
  });
});
