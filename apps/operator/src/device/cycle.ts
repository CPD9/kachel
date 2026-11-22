/** The parts of the device, as named nodes in docs/models/orc-concept.glb. */
export type Part =
  "Rack" | "HeatExchanger" | "HeatPump" | "Evaporator" | "Turbine" | "Generator" | "Condenser";

export const PART_LABEL: Record<Part, string> = {
  Rack: "Server rack",
  HeatExchanger: "Heat exchanger",
  HeatPump: "Heat pump",
  Evaporator: "Evaporator",
  Turbine: "Turbine",
  Generator: "Generator",
  Condenser: "Condenser",
};

/** What runs in a pipe, and so its colour: ember for heat, light vapour, system blue power. */
export type Stream = "warm" | "lifted" | "vapour" | "liquid" | "power" | "cool";

export const STREAM_COLOUR: Record<Stream, string> = {
  warm: "#ff9500",
  lifted: "#ff5a1f",
  vapour: "#e9eef5",
  liquid: "#9aa0a8",
  power: "#0a84ff",
  cool: "#bcd7f0",
};

/** The model's Flow_* pipes, what each carries, and the step that starts it (summer: null). */
export const PIPES: Record<string, { stream: Stream; step: number | null }> = {
  Flow_ServerWarm: { stream: "warm", step: 0 },
  Flow_ToHeatPump: { stream: "warm", step: 0 },
  Flow_Lifted: { stream: "lifted", step: 1 },
  Flow_HotIn: { stream: "lifted", step: 1 },
  Flow_Vapour: { stream: "vapour", step: 2 },
  Flow_Exhaust: { stream: "vapour", step: 2 },
  Flow_Liquid: { stream: "liquid", step: 2 },
  Flow_Liquid2: { stream: "liquid", step: 2 },
  Flow_Power: { stream: "power", step: 4 },
  Flow_ServerReturn: { stream: "cool", step: null },
  Flow_HeatPumpReturn: { stream: "cool", step: null },
  Flow_ORCReturn: { stream: "cool", step: null },
  Flow_CoolOut: { stream: "cool", step: null },
};

export interface CycleStep {
  title: string;
  text: string;
  parts: Part[];
}

/** The cycle in plain words, one step at a time. */
export const STEPS: readonly CycleStep[] = [
  {
    title: "Warm water from the servers",
    text: "Cold plates on the chips warm the water. A plate heat exchanger passes that heat on.",
    parts: ["Rack", "HeatExchanger"],
  },
  {
    title: "The heat pump lifts the temperature",
    text: "Server water is too cool to drive a turbine well, so a small heat pump makes it hotter first.",
    parts: ["HeatPump"],
  },
  {
    title: "Vapour turns the turbine",
    text: "In the evaporator the hot water boils a fluid with a low boiling point. Its vapour drives the turbine; the condenser turns it back into liquid.",
    parts: ["Evaporator", "Turbine", "Condenser"],
  },
  {
    title: "The generator spins",
    text: "The turbine's shaft turns the generator, which makes electricity.",
    parts: ["Turbine", "Generator"],
  },
  {
    title: "Electricity back to the servers",
    text: "The electricity goes back to the rack. The device recovers part of the summer heat as electricity; the servers still draw from the grid.",
    parts: ["Generator", "Rack"],
  },
];

/** Celsius to kelvin. */
export const kelvin = (c: number) => c + 273.15;

/** The Carnot bound on any heat engine between a hot and a cold side: η ≤ 1 − Tc/Th, in kelvin. */
export const carnotBound = (hotC: number, coldC: number) => 1 - kelvin(coldC) / kelvin(hotC);

/** Our worked example's temperatures, labelled as ours on the page: not a design point. */
export const EXAMPLE = { hotC: 80, coldC: 25 } as const;
