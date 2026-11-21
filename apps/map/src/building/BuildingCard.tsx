import { useEffect, useState } from "react";
import { REFERENCE_SIZE, SERVER_SIZES } from "@kachel/economics/model";
import { electricityPrice, savedPrice, type Post, type Price } from "@kachel/economics/prices";
import {
  HOUSE_SOURCE,
  heatDemand,
  periodFactor,
  periodLabel,
  RENOVATED_FACTOR,
  USE_LABEL,
  type PeriodId,
} from "@kachel/economics/house";
import { formatEnergy, heatEstimate } from "./estimate";
import { FLEET, type FleetHouse } from "../fleet/fleet";
import type { BuildingFacts } from "./geoadmin";
import { shareOf } from "./group";
import { ASSUMPTIONS_URL, formatChf, formatYears, kachelEstimate } from "./kachel";
import { MonthSlider } from "./MonthSlider";
import { describeSolar, SOLAR_RADIUS_M } from "./solar";

const NETWORK_THRESHOLD_MWH = 700;
/**
 * ElCom's API does not allow calls from other sites, so the map asks it through its own server
 * (vite.config.ts: /elcom). Without that server the card keeps the saved tariff or the median.
 */
export const ELCOM_PROXY = "/elcom/api/graphql";
const post: Post = (url, init) => fetch(url, init);
/**
 * Above this, heat per m² of heated floor is unusual even for an old, unrenovated building
 * (our rule of thumb), so the card flags the SFOE estimate for a second look.
 */
export const HIGH_KWH_PER_M2 = 300;

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
  month,
  fleet = null,
  onClose,
}: {
  facts: BuildingFacts | "loading";
  /** The month on the map's clock, 0 for January: where the month slider starts. */
  month: number;
  /** The synthetic fleet house placed on this building, if any. */
  fleet?: FleetHouse | null;
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
      {fleet !== null && (
        <p className="mr-8 mb-2 rounded border border-heat/50 px-2 py-1 text-xs text-paper/80">
          {`Fleet simulation: here this building gets ${fleet.servers} servers, as synthetic house ${fleet.id}, one of ${FLEET.length} in Basel and Bern. An illustration: the building and the published figures below are real, the fleet is not.`}
        </p>
      )}
      {facts === "loading" ? (
        <p>Looking the building up…</p>
      ) : (
        <Facts key={facts.register?.egid ?? "building"} facts={facts} month={month} />
      )}
    </aside>
  );
}

/**
 * What a renovation does to SFOE's space heating: Sonnendach's figure is the average for the
 * building's period, unrenovated, so the box applies our period's renovated factor to it. With
 * no period in the register, the plain factor.
 */
function renovationScale(period: PeriodId | null, renovated: boolean): number {
  if (!renovated) return 1;
  return period === null ? RENOVATED_FACTOR : periodFactor(period, true) / periodFactor(period);
}

function Facts({ facts, month }: { facts: BuildingFacts; month: number }) {
  const { register, roof, hectare, osmSolar, group } = facts;
  const [renovated, setRenovated] = useState(false);
  if (register === null && roof === null && hectare === null && osmSolar === null) {
    return <p>No published data found for this building.</p>;
  }
  // Sonnendach's figure is for its whole building, which can be a block of several GWR
  // buildings. With the group known, this building gets its share by floor area.
  const area = register?.heatedAreaM2 ?? null;
  const share = group !== null && group.egids.length > 1 ? shareOf(group, area) : null;
  const scale = share ?? 1;
  const groupHeatKwh = roof === null ? 0 : roof.heatingKwh + roof.hotWaterKwh;
  const period = register?.period ?? null;
  const kind = register?.kind ?? null;
  // Our own estimate from the register, for homes: floor area and construction period (#159).
  const ours =
    area !== null && area > 0 && period !== null && kind !== null
      ? heatDemand(area, period, renovated, kind)
      : null;
  const renovation = renovationScale(period, renovated);
  const estimate =
    roof === null
      ? null
      : heatEstimate(
          roof.heatingKwh * scale,
          roof.hotWaterKwh * scale,
          register?.heatingKind ?? "unknown",
          area,
        );
  // Then the per-m² figure may divide a whole block by one address: show it only when it is
  // plausible, and call the total what it is. The figure is a group figure when the group is unknown, or when it has several buildings but
  // this one has no floor area to take a share by.
  const groupFigure = group === null || (group.egids.length > 1 && share === null);
  const perM2 =
    estimate?.perSquareMetre === null || estimate === null
      ? null
      : groupFigure && estimate.perSquareMetre > HIGH_KWH_PER_M2
        ? null
        : estimate.perSquareMetre;
  return (
    <>
      <h2 className="text-lg font-semibold">{register?.address ?? "Building"}</h2>
      {register !== null && <p className="text-xs text-paper/60">EGID {register.egid}</p>}

      {estimate !== null && (
        <section className="mt-3">
          <h3 className="font-medium text-heat">
            {share !== null
              ? "Heat a year, estimated, this building's share"
              : groupFigure
                ? "Heat a year, SFOE estimate for the building group"
                : "Heat a year, estimated"}
          </h3>
          <p className="text-2xl font-semibold">{formatEnergy(estimate.heatKwh)}</p>
          <dl className="mt-1 space-y-0.5">
            {perM2 !== null && (
              <Row
                label="Per m² heated floor"
                value={
                  perM2 > HIGH_KWH_PER_M2
                    ? `${Math.round(perM2)} kWh, high, check`
                    : `${Math.round(perM2)} kWh`
                }
              />
            )}
            {share !== null && group !== null && (
              <Row
                label={`SFOE figure for ${group.egids.length} buildings under one roof`}
                value={formatEnergy(groupHeatKwh)}
              />
            )}
            <Row
              label="Energy bought"
              value={
                estimate.energyKwh === null ? "heating not known" : formatEnergy(estimate.energyKwh)
              }
            />
            {period !== null && (
              <Row
                label={`Our estimate, built ${periodLabel(period)}${renovated ? ", renovated" : ""}`}
                value={
                  ours !== null
                    ? formatEnergy(ours.totalKwh)
                    : kind === null
                      ? "no heat for this use"
                      : "no floor area"
                }
              />
            )}
          </dl>
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={renovated}
              onChange={(e) => setRenovated(e.target.checked)}
            />
            <span>Renovated (walls, roof, windows)?</span>
          </label>
          {roof !== null && (
            <MonthSlider
              key={register?.egid ?? "building"}
              heatingKwh={roof.heatingKwh * scale}
              hotWaterKwh={roof.hotWaterKwh * scale}
              degreeDays={roof.degreeDays}
              initialMonth={month}
            />
          )}
          <Source>
            {`Estimate. Space heating and hot water: SFOE Sonnendach, computed from GWR data (data status 21.02.2023), for a whole swissBUILDINGS3D building${share !== null ? `, here split among its ${group?.egids.length ?? 0} GWR buildings by floor area (our split)` : groupFigure ? `; it may cover neighbouring buildings too, so the per-m² figure shows only when plausible` : ""}. Months by the roof's heating degree days, hot water evenly. Energy bought: ${estimate.efficiencySource ?? "no efficiency for this heating"}.`}
          </Source>
          <Source>
            {`Our estimate: heated floor area × space heating for its construction period and use${kind === null ? "" : ` (${USE_LABEL[kind]})`} + hot water. ${HOUSE_SOURCE}. Renovated also halves SFOE's space heating in the Kachel figures below, never under a new building's; SFOE's figure above stays as published.`}
          </Source>
        </section>
      )}

      {estimate !== null && roof !== null && (
        <WithKachel
          heatKwh={roof.heatingKwh * scale * renovation + roof.hotWaterKwh * scale}
          renovated={renovated}
          municipality={register?.municipality ?? null}
        />
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

      <section className="mt-3">
        <h3 className="font-medium">Solar already there</h3>
        <p>
          {osmSolar === null
            ? "OpenStreetMap's Overpass service did not answer just now; click the building again later."
            : describeSolar(osmSolar) === "none"
              ? `None mapped within ${SOLAR_RADIUS_M} m. OpenStreetMap is incomplete, so there may still be some.`
              : `Mapped within ${SOLAR_RADIUS_M} m: ${describeSolar(osmSolar)}.`}
        </p>
        <Source>Source: © OpenStreetMap contributors (ODbL), via Overpass.</Source>
      </section>

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

/** What Kachel home servers could do here, scaled from the scheduler's reference house. */
function WithKachel({
  heatKwh,
  renovated,
  municipality,
}: {
  heatKwh: number;
  renovated: boolean;
  municipality: { bfs: number; name: string } | null;
}) {
  const bfs = municipality?.bfs ?? null;
  // The saved tariff (or the Swiss median) at once, then ElCom's live answer.
  const [price, setPrice] = useState<Price>(() => savedPrice(bfs));
  useEffect(() => {
    let current = true;
    void electricityPrice(bfs, post, ELCOM_PROXY).then((p) => {
      if (current) setPrice(p);
    });
    return () => {
      current = false;
    };
  }, [bfs]);
  const [sizeId, setSizeId] = useState(REFERENCE_SIZE.id);
  const size = SERVER_SIZES.find((s) => s.id === sizeId) ?? REFERENCE_SIZE;
  const k = kachelEstimate(heatKwh, price.chfPerKwh, size);
  return (
    <section className="mt-3 rounded-md border border-heat/50 p-3">
      <h3 className="font-medium text-heat">
        {renovated
          ? "If Kachel heated the whole building, renovated, estimated"
          : "If Kachel heated the whole building, estimated"}
      </h3>
      <label className="mt-1 flex items-center justify-between gap-2">
        <span className="text-paper/70">Server size</span>
        <select
          value={size.id}
          onChange={(e) => setSizeId(e.target.value)}
          className="rounded bg-ink px-1 text-paper"
        >
          {SERVER_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {k === null ? (
        <p>{`Too little heat for one ${size.label} server.`}</p>
      ) : (
        <dl className="mt-1 space-y-0.5">
          <Row label={`Servers needed, ${size.label} each`} value={`about ${k.servers}`} />
          <Row
            label="Server heat used"
            value={`${formatEnergy(k.heatFromServersKwh)} (${Math.round(k.sharePct)}%)`}
          />
          <Row label="Electricity the servers draw" value={formatEnergy(k.electricityKwh)} />
          <Row
            label={`Electricity price, ${price.municipality ?? "Swiss median"}`}
            value={`${(price.chfPerKwh * 100).toFixed(2)} Rp/kWh`}
          />
          <Row label="A year, before hardware" value={formatChf(k.beforeHardwareChf)} />
          <Row label="A year, after hardware (mid)" value={formatChf(k.afterHardwareChf.mid)} />
          <Row label="… cheap hardware (low)" value={formatChf(k.afterHardwareChf.low)} />
          <Row label="… dear hardware (high)" value={formatChf(k.afterHardwareChf.high)} />
          <Row label="Payback (mid)" value={formatYears(k.paybackYears.mid)} />
        </dl>
      )}
      <p className="mt-1 text-xs text-paper/60">
        {
          "Estimate, scaled from Kachel's Basel reference house (6 servers, 31,231 kWh, Basel 2025 weather) in proportion to this building's heat. It assumes interruptible AI work is always waiting and 0.50 CHF per kW of server an hour; any size draws, earns and heats per kW, a server costs its case's price per kW (the GPU workstation its full price) and each needs its own water loop. "
        }
        {`Electricity: ${price.source}. `}
        <a href={ASSUMPTIONS_URL} target="_blank" rel="noreferrer" className="underline">
          Assumptions and sources
        </a>
      </p>
    </section>
  );
}
