import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuildingCard } from "./BuildingCard";
import type { BuildingFacts } from "./geoadmin";

const FACTS: BuildingFacts = {
  register: {
    egid: 441428,
    address: "Missionsstrasse 55",
    built: "1874",
    heatedAreaM2: 668,
    floors: 4,
    dwellings: 2,
    heating: "district heating (low temperature)",
    heatingKind: "district",
    hotWater: "district heating (low temperature)",
    asOf: "19.11.2026",
  },
  roof: {
    heatingKwh: 314_659,
    hotWaterKwh: 71_408,
    degreeDays: [545, 488, 393, 187, 71, 5, 0, 0, 36, 166, 394, 535],
    solarKwh: 13_268,
  },
  hectare: { totalMwh: 4561.6, districtSharePct: 81.8 },
};

afterEach(cleanup);

describe("building card", () => {
  it("shows the yearly heat as an estimate, with its sources", () => {
    render(<BuildingCard facts={FACTS} month={10} onClose={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Missionsstrasse 55" })).toBeTruthy();
    // District heating: the heat bought equals the heat used, so the figure shows twice.
    expect(screen.getAllByText("386 MWh")).toHaveLength(2);
    expect(screen.getByText("Heat a year, estimated")).toBeTruthy();
    expect(screen.getByText(/SFOE Sonnendach, computed from GWR data/)).toBeTruthy();
    expect(screen.getByText("Source: BFS GWR, as of 19.11.2026.")).toBeTruthy();
    expect(screen.getByText(/Dense enough for a heating network/)).toBeTruthy();
  });

  it("shows the chosen month's heat on the slider", () => {
    render(<BuildingCard facts={FACTS} month={10} onClose={() => undefined} />);
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^November: /);
    fireEvent.change(slider, { target: { value: "6" } });
    // July: no heating degree days, so only a month of hot water: 71,408 × 31 ÷ 365.
    expect(screen.getByLabelText("July")).toBeTruthy();
    expect(slider.getAttribute("aria-valuetext")).toBe("July: 6,060 kWh");
    // January: 314,659 × 545 ÷ 2,820 degree days, plus 71,408 × 31 ÷ 365 of hot water.
    fireEvent.change(slider, { target: { value: "0" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("January: 66.9 MWh");
  });

  it("scales the Kachel reference house to the building", () => {
    render(<BuildingCard facts={FACTS} month={10} onClose={() => undefined} />);
    // 386,067 kWh ÷ 31,231 kWh × 6 servers = 74.2, so about 74 servers.
    expect(screen.getByText("about 74")).toBeTruthy();
    expect(screen.getByText(/scaled from Kachel's Basel reference house/)).toBeTruthy();
  });

  it("says so when nothing is published", () => {
    render(
      <BuildingCard
        facts={{ register: null, roof: null, hectare: null }}
        month={10}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("No published data found for this building.")).toBeTruthy();
  });
});
