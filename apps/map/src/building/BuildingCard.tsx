import { formatEnergy, heatEstimate } from "./estimate";
import type { BuildingFacts } from "./geoadmin";

const NETWORK_THRESHOLD_MWH = 700;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-paper/70">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Source({ children }: { children: string }) {
  return <p className="mt-1 text-xs text-paper/60">{children}</p>;
}

/** A clicked building: its estimated heat and energy use, and the published facts behind them. */
export function BuildingCard({
  facts,
  onClose,
}: {
  facts: BuildingFacts | "loading";
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Building"
      className="absolute top-24 left-4 max-h-[calc(100vh-8rem)] w-96 overflow-y-auto rounded-lg bg-ink/85 p-4 text-sm backdrop-blur"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="float-right rounded px-2 text-paper/70 hover:text-paper"
      >
        ×
      </button>
      {facts === "loading" ? <p>Looking the building up…</p> : <Facts facts={facts} />}
    </aside>
  );
}

function Facts({ facts }: { facts: BuildingFacts }) {
  const { register, roof, hectare } = facts;
  if (register === null && roof === null && hectare === null) {
    return <p>No published data found for this building.</p>;
  }
  const estimate =
    roof === null
      ? null
      : heatEstimate(
          roof.heatingKwh,
          roof.hotWaterKwh,
          register?.heatingKind ?? "unknown",
          register?.heatedAreaM2 ?? null,
        );
  return (
    <>
      <h2 className="text-lg font-semibold">{register?.address ?? "Building"}</h2>
      {register !== null && <p className="text-xs text-paper/60">EGID {register.egid}</p>}

      {estimate !== null && (
        <section className="mt-3">
          <h3 className="font-medium text-heat">Heat a year, estimated</h3>
          <p className="text-2xl font-semibold">{formatEnergy(estimate.heatKwh)}</p>
          <dl className="mt-1 space-y-0.5">
            {estimate.perSquareMetre !== null && (
              <Row
                label="Per m² heated floor"
                value={`${Math.round(estimate.perSquareMetre)} kWh`}
              />
            )}
            <Row
              label="Energy bought"
              value={
                estimate.energyKwh === null ? "heating not known" : formatEnergy(estimate.energyKwh)
              }
            />
          </dl>
          <Source>
            {`Estimate. Space heating and hot water: SFOE Sonnendach, computed from GWR data (data status 21.02.2023). Energy bought: ${estimate.efficiencySource ?? "no efficiency for this heating"}.`}
          </Source>
        </section>
      )}

      {register !== null && (
        <section className="mt-3">
          <h3 className="font-medium">The building</h3>
          <dl className="mt-1 space-y-0.5">
            {register.built !== null && <Row label="Built" value={register.built} />}
            {register.heatedAreaM2 !== null && (
              <Row label="Heated floor area" value={`${register.heatedAreaM2} m²`} />
            )}
            {register.floors !== null && <Row label="Storeys" value={String(register.floors)} />}
            {register.dwellings !== null && (
              <Row label="Dwellings" value={String(register.dwellings)} />
            )}
            <Row label="Heating" value={register.heating} />
            <Row label="Hot water" value={register.hotWater} />
          </dl>
          <Source>{`Source: BFS GWR, as of ${register.asOf ?? "the latest export"}.`}</Source>
        </section>
      )}

      {roof !== null && roof.solarKwh > 0 && (
        <section className="mt-3">
          <h3 className="font-medium">Roof</h3>
          <p>{`Solar power the roof could make: ${formatEnergy(roof.solarKwh)} a year.`}</p>
          <Source>Estimate. Source: SFOE Sonnendach.</Source>
        </section>
      )}

      {hectare !== null && (
        <section className="mt-3">
          <h3 className="font-medium">The hectare around it</h3>
          <p>
            {`Homes and businesses here need ${formatEnergy(hectare.totalMwh * 1000)} of heat a year`}
            {hectare.districtSharePct !== null &&
              `; ${Math.round(hectare.districtSharePct)}% of homes are on district heating`}
            .{" "}
            {hectare.totalMwh >= NETWORK_THRESHOLD_MWH
              ? "Dense enough for a heating network (SFOE: 700 MWh a hectare)."
              : "Below SFOE's 700 MWh a hectare for a heating network: room for heat made at home."}
          </p>
          <Source>
            Estimate. Source: SFOE heat demand, 2014 building and 2013 company statistics.
          </Source>
        </section>
      )}
    </>
  );
}
