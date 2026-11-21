import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { Fleet } from "./fleet/Fleet";

afterEach(cleanup);

const reading = (label: string) => {
  const el = document.querySelector(`[data-reading="${label}"] [data-value]`);
  if (el === null) throw new Error(`no reading ${label}`);
  return el.textContent ?? "";
};

describe("operator app", () => {
  it("shows the fleet's totals, the year and every house", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Kachel operator" })).toBeTruthy();
    expect(reading("Houses")).toContain("100");
    expect(document.querySelectorAll("tbody tr[data-house]")).toHaveLength(100);
    expect(document.querySelectorAll("li[data-house-card]")).toHaveLength(100);
    expect(screen.getByRole("heading", { name: /The year/ })).toBeTruthy();
  });

  it("follows the month slider: less heat and revenue in July than in January", () => {
    render(<Fleet startMonth={0} />);
    const heat = () => Number(reading("Heat delivered").replace(/\D/g, ""));
    const revenue = () => Number(reading("Revenue today").replace(/\D/g, ""));
    const [winterHeat, winterRevenue] = [heat(), revenue()];
    fireEvent.change(screen.getByRole("slider", { name: /Month/ }), { target: { value: "6" } });
    expect(screen.getByRole("heading", { name: /July/ })).toBeTruthy();
    expect(heat()).toBeLessThan(winterHeat);
    expect(revenue()).toBeLessThan(winterRevenue);
  });

  it("follows the temperature slider, and says when it shows a what-if", () => {
    render(<Fleet startMonth={0} />);
    const backup = () => Number(reading("Backup").replace(/\D/g, ""));
    const before = backup();
    fireEvent.change(screen.getByRole("slider", { name: /Outdoor temperature/ }), {
      target: { value: "4" },
    });
    expect(document.querySelector("[data-model]")?.textContent).toContain("+4 °C");
    expect(backup()).toBeLessThan(before);
  });

  it("filters to one city", () => {
    render(<Fleet startMonth={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Bern" }));
    expect(document.querySelectorAll("tbody tr[data-house]")).toHaveLength(50);
    expect(reading("Houses")).toContain("50");
  });
});
