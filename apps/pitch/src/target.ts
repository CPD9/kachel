import { heatDemand } from "@kachel/economics/house";

/**
 * Where the scripted demo goes. Byfangweg 18 (a home) is the default; `?at=fhnw` points the
 * same flow at FHNW Campus Dreispitz, where the pitch takes place, for the pitch film.
 * The FHNW point is the building register's address point for Dornacherstrasse 394
 * (LV95 2612623.3 / 1265205.4, converted to WGS84).
 */
export type Target = {
  id: "byfangweg" | "fhnw";
  /** What the scripted voice prompt "hears", in interim chunks then the final line. */
  interim: [number, string][];
  transcript: string;
  name: string;
  at: [number, number];
  /** The looked-up building card only fits the home: its facts are Byfangweg's. */
  showBuildingCard: boolean;
  /** The building's published figures: the questions start from them, the map opens at it. */
  building: Published;
};

/**
 * One building as the federal building register (BFS GWR) gives it, and its heat a year as the
 * map's card shows it: SFOE Sonnendach where SFOE has the building, else our period estimate.
 */
export type Published = {
  /** GWR building number: the map (apps/map) opens at it with its card. */
  egid: number;
  /** A home, or a school such as the campus: the questions follow it. */
  kind: "home" | "school";
  /** Heated floor area, m² (GWR gebf). */
  areaM2: number;
  built: number;
  /** What heats it today (GWR genh1). */
  heating: "district";
  /** BFS municipality number: it picks the electricity price (ElCom, packages/economics). */
  bfs: number;
  spaceHeatingKwh: number;
  hotWaterKwh: number;
  /** Where the heat figures come from, for the screen. */
  heatSource: string;
};

/**
 * BFS GWR, EGID 442141 (export 19.11.2026), read on api3.geo.admin.ch on 21 Nov 2026: built 1894,
 * 330 m², low-temperature district heating. SFOE Sonnendach: 30,321 kWh space heating and 9,288
 * kWh hot water a year (data status 21.02.2023).
 */
const BYFANGWEG_18: Published = {
  egid: 442141,
  kind: "home",
  areaM2: 330,
  built: 1894,
  heating: "district",
  bfs: 2701,
  spaceHeatingKwh: 30_321,
  hotWaterKwh: 9_288,
  heatSource: "SFOE Sonnendach",
};

/**
 * BFS GWR, EGID 243058419 (export 19.11.2026): built 2026, class 1263 (schools), 14,436 m²,
 * low-temperature district heating. SFOE has no roof for it yet (it is newer than
 * swissBUILDINGS3D), so its heat is our period estimate, as on the map's card.
 */
const FHNW_AREA_M2 = 14_436;
const fhnwHeat = heatDemand(FHNW_AREA_M2, "after_2015", false, "school");
const FHNW_CAMPUS: Published = {
  egid: 243058419,
  kind: "school",
  areaM2: FHNW_AREA_M2,
  built: 2026,
  heating: "district",
  bfs: 2701,
  spaceHeatingKwh: fhnwHeat.spaceHeatingKwh,
  hotWaterKwh: fhnwHeat.hotWaterKwh,
  heatSource: "our estimate for a school built after 2015 (SIA 2024 means, as the map's card)",
};

const BYFANGWEG: Target = {
  id: "byfangweg",
  interim: [
    [700, "I'm living"],
    [1050, "I'm living in"],
    [1400, "I'm living in bass"],
    [1750, "I'm living in Basel"],
    [2150, "I'm living in Basel, in street"],
  ],
  transcript: "I'm living in Basel, at Byfangweg 18.",
  name: "Byfangweg 18",
  at: [7.58215, 47.55212],
  showBuildingCard: true,
  building: BYFANGWEG_18,
};

const FHNW: Target = {
  id: "fhnw",
  interim: [
    [700, "We're at"],
    [1050, "We're at F"],
    [1400, "We're at FHNW"],
    [1750, "We're at FHNW Campus"],
    [2150, "We're at FHNW Campus Dreispitz"],
  ],
  transcript: "We're at FHNW Campus Dreispitz, in Basel.",
  name: "FHNW Campus Dreispitz",
  at: [7.60627, 47.53746],
  showBuildingCard: false,
  building: FHNW_CAMPUS,
};

/** The target for a query string such as "?at=fhnw"; anything else is Byfangweg. */
export function targetFor(search: string): Target {
  return new URLSearchParams(search).get("at") === "fhnw" ? FHNW : BYFANGWEG;
}

export const TARGET = targetFor(typeof window === "undefined" ? "" : window.location.search);

/** Byfangweg's point: the neighbours were placed around it and move with the target. */
export const BYFANGWEG_AT = BYFANGWEG.at;
