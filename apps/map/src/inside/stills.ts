import cutaway from "../../../../docs/media/dreispitz-cutaway.webp";
import campusPlantRoom from "../../../../docs/media/dreispitz-basement-plantroom.webp";
import daynight from "../../../../docs/media/daynight.webp";
import schedulerJanuary from "../../../../docs/media/scheduler-january.webp";
import schedulerJuly from "../../../../docs/media/scheduler-july.webp";
import serverCloseUp from "../../../../docs/media/server-closeup-34.webp";
import setup from "../../../../docs/media/setup.webp";

/** One of our Blender stills (docs/media), with what it shows. */
export interface Still {
  readonly src: string;
  readonly caption: string;
}

/** Which building's inside is open: the FHNW campus, or a house of the synthetic fleet. */
export type InsideOf = "campus" | "house";

/** The plant room stills, the same for every building: they show our model, not this house. */
const PLANT_ROOM: readonly Still[] = [
  {
    src: setup,
    caption:
      "How a server goes into a basement: rack, pump, plate heat exchanger, tank and backup heater.",
  },
  {
    src: daynight,
    caption: "13 January 2025 in Basel, outside and inside on the same clock.",
  },
  {
    src: schedulerJanuary,
    caption: "13 January 2025, 12:00: six servers running, the backup heater adding 3.7 kWh.",
  },
  {
    src: schedulerJuly,
    caption: "15 July 2025, 19:00: the tank is full, so the flexible backlog is paused.",
  },
  { src: serverCloseUp, caption: "One server in the rack, close up." },
];

/** The campus in the film: an earlier block, 72 × 46 m, than the one on the map. */
const CAMPUS: readonly Still[] = [
  {
    src: cutaway,
    caption:
      "The campus in the pitch film, an earlier block model (shape assumed), cut away to a plant room in the basement.",
  },
  {
    src: campusPlantRoom,
    caption: "A plant room in the campus basement: our concept, not the building's.",
  },
];

/** The stills for a building's Inside view, campus pictures first for the campus. */
export function stillsFor(of: InsideOf): readonly Still[] {
  return of === "campus" ? [...CAMPUS, ...PLANT_ROOM] : PLANT_ROOM;
}
