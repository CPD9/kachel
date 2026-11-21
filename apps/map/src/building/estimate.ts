import type { SourceKind } from "./codes";

/**
 * Heat delivered per unit of energy bought, by kind of heating. Shown on the card with its source.
 * Heat pump: Fraunhofer ISE field test in existing houses, seasonal COP 3.4 on average
 * (docs/economics/README.md, source 4). The others are our assumptions.
 */
export const EFFICIENCY: Readonly<Record<SourceKind, { value: number; source: string } | null>> = {
  "heat pump": { value: 3.4, source: "Fraunhofer ISE field test, COP 3.4" },
  boiler: { value: 0.9, source: "our assumption: boiler 90%" },
  district: { value: 1, source: "our assumption: heat bought as heat" },
  electric: { value: 1, source: "our assumption: direct electric 100%" },
  solar: null,
  unknown: null,
};

export interface HeatEstimate {
  /** Space heating and hot water, kWh a year. */
  readonly heatKwh: number;
  /** Energy bought for that heat (gas, oil, electricity or heat), kWh a year; null if unknown. */
  readonly energyKwh: number | null;
  readonly efficiencySource: string | null;
  /** Heat per m² of heated floor area, kWh a year; null without an area. */
  readonly perSquareMetre: number | null;
}

/** Yearly heat and energy use from SFOE's heat demand and the GWR heating source and area. */
export function heatEstimate(
  heatingKwh: number,
  hotWaterKwh: number,
  kind: SourceKind,
  heatedAreaM2: number | null,
): HeatEstimate {
  const heatKwh = heatingKwh + hotWaterKwh;
  const eff = EFFICIENCY[kind];
  return {
    heatKwh,
    energyKwh: eff === null ? null : heatKwh / eff.value,
    efficiencySource: eff?.source ?? null,
    perSquareMetre: heatedAreaM2 !== null && heatedAreaM2 > 0 ? heatKwh / heatedAreaM2 : null,
  };
}

/** "12,300 kWh" or "1.2 GWh": rounded to three significant figures, since these are estimates. */
export function formatEnergy(kwh: number): string {
  const round = (v: number) => Number(v.toPrecision(3)).toLocaleString("en-GB");
  if (kwh >= 1_000_000) return `${round(kwh / 1_000_000)} GWh`;
  if (kwh >= 10_000) return `${round(kwh / 1000)} MWh`;
  return `${round(kwh)} kWh`;
}
