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
};

/** The target for a query string such as "?at=fhnw"; anything else is Byfangweg. */
export function targetFor(search: string): Target {
  return new URLSearchParams(search).get("at") === "fhnw" ? FHNW : BYFANGWEG;
}

export const TARGET = targetFor(typeof window === "undefined" ? "" : window.location.search);

/** Byfangweg's point: the neighbours were placed around it and move with the target. */
export const BYFANGWEG_AT = BYFANGWEG.at;
