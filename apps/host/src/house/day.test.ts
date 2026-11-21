import { describe, expect, it } from "vitest";
import { chooseDay, dayMoney, hourAt, toDays, toPrices } from "./day";
import { ASSUMPTIONS, janHour, julHour } from "./fixtures";

const hours = (make: typeof janHour) => Array.from({ length: 24 }, (_, h) => make(h));
const days = toDays([...hours(julHour), ...hours(janHour)]);
const at = (iso: string) => new Date(iso);

describe("toDays", () => {
  it("groups heat_state by the day in Basel, oldest first, one slot per local hour", () => {
    expect(days.map((d) => d.date)).toEqual(["2025-01-13", "2025-07-15"]);
    expect(days[0]?.hours[0]?.time).toBe("2025-01-13T00:00:00+01:00");
    expect(days[1]?.hours[23]?.time).toBe("2025-07-15T23:00:00+02:00");
  });
});

describe("chooseDay", () => {
  it("replays the stored day nearest this time of year", () => {
    expect(chooseDay(days, at("2026-11-21T14:30:00+01:00"))).toMatchObject({
      day: { date: "2025-01-13" },
      live: false,
    });
    expect(chooseDay(days, at("2026-06-02T09:00:00+02:00"))?.day.date).toBe("2025-07-15");
  });

  it("shows today as live once the scheduler has written it", () => {
    const today = toDays([janHour(9, { time: "2026-11-21T09:00:00+01:00" })]);
    expect(chooseDay([...days, ...today], at("2026-11-21T14:30:00+01:00"))).toMatchObject({
      day: { date: "2026-11-21" },
      live: true,
    });
  });

  it("keeps the day the host picked", () => {
    expect(chooseDay(days, at("2026-11-21T14:30:00+01:00"), "2025-07-15")?.day.date).toBe(
      "2025-07-15",
    );
  });

  it("has nothing to show before the first hour arrives", () => {
    expect(chooseDay([], at("2026-11-21T14:30:00+01:00"))).toBeUndefined();
  });
});

describe("hourAt", () => {
  it("takes the clock's hour in Basel, whatever the viewer's zone", () => {
    const jan = days[0];
    if (!jan) throw new Error("no January day");
    expect(hourAt(jan, at("2026-11-21T13:30:00Z"))?.hour).toBe(14);
  });

  it("falls back to the latest hour before it", () => {
    const partial = toDays([janHour(6), janHour(9)])[0];
    if (!partial) throw new Error("no day");
    expect(hourAt(partial, at("2026-11-21T12:00:00+01:00"))?.hour).toBe(9);
    expect(hourAt(partial, at("2026-11-21T05:00:00+01:00"))).toBeUndefined();
  });
});

describe("dayMoney", () => {
  it("counts a day as the scheduler counts its year", () => {
    const prices = toPrices(ASSUMPTIONS);
    const jan = days[0];
    if (!prices || !jan) throw new Error("fixtures");
    const money = dayMoney(jan, prices);
    expect(money.serverHours).toBe(144);
    expect(money.earned).toBeCloseTo(72);
    expect(money.electricity).toBeCloseTo(144 * 0.277);
    expect(money.heatSaved).toBeCloseTo((115.2 * 0.277) / 2.5);
    expect(money.left).toBeCloseTo(72 - 39.888 + 12.7642, 3);
  });

  it("waits for every price it needs", () => {
    expect(toPrices(ASSUMPTIONS.slice(1))).toBeUndefined();
  });
});
