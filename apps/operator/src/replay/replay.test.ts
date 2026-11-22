import { describe, expect, it } from "vitest";
import { houseAt } from "./House";
import { asDecision, dayOf, REPLAY } from "./replay";

describe("the replay of the scheduler's decisions", () => {
  it("is the live loop's two days, one decision an hour, in one hash chain", () => {
    const e = REPLAY.entries;
    expect(e).toHaveLength(48);
    expect(dayOf(e[0]?.time ?? "")).toBe("13 January 2025");
    expect(dayOf(e[24]?.time ?? "")).toBe("15 July 2025");
    e.forEach((x, i) => {
      expect(x.seq).toBe(i);
      expect(x.hash).toMatch(/^[0-9a-f]{64}$/);
      if (i > 0) expect(x.prev).toBe(e[i - 1]?.hash);
    });
  });

  it("reads as a replayed hour, not a live one", () => {
    const first = REPLAY.entries[0];
    if (!first) throw new Error("empty replay");
    expect(asDecision(first).written_at?.startsWith("2026")).toBe(true);
  });

  it("shows the house's jobs as the decision left them: run, paused, or placed", () => {
    const first = REPLAY.entries[0];
    if (!first) throw new Error("empty replay");
    const rows = houseAt(first);
    expect(
      rows.filter((r) => r.state === "Running" || r.state === "Placed").map((r) => r.id),
    ).toEqual(expect.arrayContaining(first.run));
    expect(rows.some((r) => r.state === "Placed")).toBe(first.placed.length > 0);
    const july = REPLAY.entries.find((x) => x.reason.startsWith("tank full"));
    expect(
      july && houseAt(july).every((r) => r.state !== "Running" || july.run.includes(r.id)),
    ).toBe(true);
  });
});
