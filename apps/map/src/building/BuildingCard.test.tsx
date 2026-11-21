import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuildingCard } from "./BuildingCard";
import type { BuildingFacts } from "./geoadmin";

const FACTS: BuildingFacts = {
  register: {
    egid: 441428,
    address: "Missionsstrasse 55",
    built: "1874",
    period: "before_1919",
    kind: "single",
    heatedAreaM2: 668,
    floors: 4,
    dwellings: 2,
    heating: "district heating (low temperature)",
    heatingKind: "district",
    hotWater: "district heating (low temperature)",
    asOf: "19.11.2026",
  },
  roof: {
    buildingId: 1599044,
    heatingKwh: 314_659,
    hotWaterKwh: 71_408,
    degreeDays: [545, 488, 393, 187, 71, 5, 0, 0, 36, 166, 394, 535],
    solarKwh: 13_268,
  },
  hectare: { totalMwh: 4561.6, districtSharePct: 81.8 },
  // A group of one: the Sonnendach figure is this building's alone.
  group: { egids: [441428], floorM2: 668 },
  osmSolar: { photovoltaic: 1, thermal: 0, other: 0 },
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
    expect(screen.getByText("Mapped within 40 m: 1 photovoltaic.")).toBeTruthy();
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

  it("adds our period-based estimate and a renovated box that cuts the Kachel servers", () => {
    render(<BuildingCard facts={FACTS} month={10} onClose={() => undefined} />);
    // 668 m² × (156 × 0.89 space heating + 12 hot water) = 100,761 kWh.
    expect(screen.getByText("Our estimate, built before 1919")).toBeTruthy();
    expect(screen.getByText("101 MWh")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Renovated/ }));
    // Space heating halved: 668 × (69.42 + 12) = 54,389 kWh.
    expect(screen.getByText("Our estimate, built before 1919, renovated")).toBeTruthy();
    expect(screen.getByText("54.4 MWh")).toBeTruthy();
    // SFOE's published figure stays; Kachel gets 314,659 ÷ 2 + 71,408 = 228,738 kWh: 43.9 servers.
    expect(screen.getAllByText("386 MWh")).toHaveLength(2);
    expect(screen.getByText("about 44")).toBeTruthy();
  });

  it("halves space heating for a renovated building with no period in the register", () => {
    if (FACTS.register === null) throw new Error("the fixture has a register");
    const noPeriod = { ...FACTS, register: { ...FACTS.register, period: null } };
    render(<BuildingCard facts={noPeriod} month={10} onClose={() => undefined} />);
    expect(screen.queryByText(/^Our estimate, built/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Renovated/ }));
    expect(screen.getByText("about 44")).toBeTruthy();
  });

  it("says a fleet house is synthetic and the building real", () => {
    const house = {
      id: "house-07",
      city: "Basel",
      servers: 6,
      heatDemandKwh: 30_000,
      egid: 441428,
      lon: 7.5754,
      lat: 47.5608,
      hectareHeatMwh: 4562,
    };
    render(<BuildingCard facts={FACTS} month={10} fleet={house} onClose={() => undefined} />);
    expect(
      screen.getByText(/here this building gets 6 servers, as synthetic house house-07/),
    ).toBeTruthy();
    expect(screen.getByText(/the fleet is not/)).toBeTruthy();
    // The whole-building estimate is named apart from the fleet's servers.
    expect(screen.getByText("If Kachel heated the whole building, estimated")).toBeTruthy();
  });

  it("flags a heat figure that is high for any building", () => {
    // 386,067 kWh over 668 m² is 578 kWh/m².
    const facts = {
      ...FACTS,
      register: FACTS.register && { ...FACTS.register, heatedAreaM2: 668 },
    };
    render(<BuildingCard facts={facts} month={10} onClose={() => undefined} />);
    expect(screen.getByText("578 kWh, high, check")).toBeTruthy();
  });

  it("splits a block's figure by floor area when the roof covers several buildings", () => {
    // Missionsstrasse 55 shares its Sonnendach roof with three more GWR buildings, 7,307 m² in all
    // (api3.geo.admin.ch, 21 Nov 2026): 386,067 kWh × 668 ÷ 7,307 = 35.3 MWh, 53 kWh/m².
    const facts = { ...FACTS, group: { egids: [441428, 2, 3, 4], floorM2: 7307 } };
    render(<BuildingCard facts={facts} month={10} onClose={() => undefined} />);
    expect(screen.getByText("Heat a year, estimated, this building's share")).toBeTruthy();
    expect(screen.getAllByText("35.3 MWh").length).toBeGreaterThan(0);
    expect(screen.getByText("53 kWh")).toBeTruthy();
    expect(screen.getByText("SFOE figure for 4 buildings under one roof")).toBeTruthy();
    expect(
      screen.getByText(/split among its 4 GWR buildings by floor area \(our split\)/),
    ).toBeTruthy();
  });

  it("names a group figure as such, and hides an implausible per-m² line, without the group", () => {
    const facts = { ...FACTS, group: null };
    render(<BuildingCard facts={facts} month={10} onClose={() => undefined} />);
    expect(screen.getByText("Heat a year, SFOE estimate for the building group")).toBeTruthy();
    expect(screen.queryByText(/kWh, high, check/)).toBeNull();
  });

  it("calls it the group figure when this building has no floor area to split by", () => {
    const facts = {
      ...FACTS,
      register: FACTS.register && { ...FACTS.register, heatedAreaM2: null },
      group: { egids: [441428, 2, 3], floorM2: 5000 },
    };
    render(<BuildingCard facts={facts} month={10} onClose={() => undefined} />);
    expect(screen.getByText("Heat a year, SFOE estimate for the building group")).toBeTruthy();
  });

  it("says so when nothing is published", () => {
    render(
      <BuildingCard
        facts={{ register: null, roof: null, hectare: null, group: null, osmSolar: null }}
        month={10}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("No published data found for this building.")).toBeTruthy();
  });
});
