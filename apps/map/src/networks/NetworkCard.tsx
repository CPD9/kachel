import { formatEnergy } from "../building/estimate";
import type { Network } from "./thermal";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-paper/70">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** A clicked district heating network, as SFOE lists it. */
export function NetworkCard({ network: n, onClose }: { network: Network; onClose: () => void }) {
  return (
    <aside
      aria-label="Thermal network"
      className="absolute top-24 left-4 w-96 rounded-lg bg-ink/85 p-4 text-sm backdrop-blur max-md:top-auto max-md:right-0 max-md:bottom-[3.75rem] max-md:left-0 max-md:w-auto max-md:max-h-[55dvh] max-md:overflow-y-auto max-md:rounded-b-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="float-right rounded px-2 text-paper/70 hover:text-paper max-md:min-h-11 max-md:min-w-11 max-md:text-xl"
      >
        ×
      </button>
      <h2 className="text-lg font-semibold">{n.name}</h2>
      <p className="text-xs text-paper/60">District heating network</p>
      <dl className="mt-2 space-y-0.5">
        {n.place !== null && <Row label="Place" value={n.place} />}
        {n.operator !== null && <Row label="Operator" value={n.operator} />}
        {n.source !== null && <Row label="Heat from" value={n.source} />}
        {n.powerMw !== null && <Row label="Power" value={`${n.powerMw} MW`} />}
        {n.energyMwh !== null && (
          <Row label="Heat a year" value={formatEnergy(n.energyMwh * 1000)} />
        )}
        {n.connections !== null && (
          <Row label="Buildings connected" value={String(n.connections)} />
        )}
        {n.since !== null && <Row label="Running since" value={String(n.since)} />}
      </dl>
      <p className="mt-2 text-xs text-paper/60">
        Source: SFOE, thermal networks (data status 18.11.2026). Positions may be approximate.
      </p>
    </aside>
  );
}
