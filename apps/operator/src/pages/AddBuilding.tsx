import {
  estimate,
  heatDemand,
  HOUSE_SOURCE,
  PERIODS,
  REFERENCE_SIZE,
  SERVER_SIZES,
  USE_LABEL,
  type HouseKind,
  type PeriodId,
} from "@kachel/economics";
import { useState } from "react";
import { chf, count, mwh } from "../format";
import { PageHead, Sources } from "../shell/Shell";
import { card, field, fieldLabel, primary, secondary } from "../ui";
import type { NewBuilding } from "./Buildings";

const STEPS = ["Address", "Building", "Rack", "Contract"] as const;

/**
 * Onboarding a building in four steps: where it is, what it is (for its heat a year), the rack
 * that heat carries, and the host contract. It then shows in Buildings as Onboarding until its
 * rack goes live. Kept in this browser tab only.
 */
export function AddBuilding({ onAdd }: { onAdd: (b: NewBuilding) => void }) {
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState("Basel");
  const [kind, setKind] = useState<HouseKind>("single");
  const [area, setArea] = useState(180);
  const [period, setPeriod] = useState<PeriodId>("1971_1980");
  const [renovated, setRenovated] = useState(false);
  const [sizeId, setSizeId] = useState(REFERENCE_SIZE.id);
  const [host, setHost] = useState("");

  const size = SERVER_SIZES.find((s) => s.id === sizeId) ?? REFERENCE_SIZE;
  const heat = heatDemand(area, period, renovated, kind);
  const est = estimate(heat.totalKwh, undefined, size);
  const ready = [address.trim().length > 2, area > 0, true, host.trim().length > 1];

  return (
    <>
      <PageHead title="Add building" />
      <ol aria-label="Steps" className="mt-6 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`border-t-[3px] pt-2 text-[13px] sm:text-[14px] ${i <= step ? "border-blue font-semibold" : "border-sep text-label-2"}`}
          >
            <span className="hidden sm:inline">Step {i + 1} · </span>
            {s}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,560px)_1fr]">
        <form
          aria-label={STEPS[step]}
          className={`${card} space-y-5 p-5 sm:p-6`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready[step]) return;
            if (step < STEPS.length - 1) return setStep(step + 1);
            onAdd({
              id: `new-${Date.now().toString(36)}`,
              address: address.trim(),
              zone,
              servers: est.servers,
              heatKwhYear: heat.totalKwh,
            });
            window.location.hash = "#/buildings";
          }}
        >
          {step === 0 && (
            <>
              <label className="block">
                <span className={fieldLabel}>Address</span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street and number"
                  className={`${field} mt-1`}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Zone</span>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className={`${field} mt-1`}
                >
                  <option>Basel</option>
                  <option>Bern</option>
                </select>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <label className="block">
                <span className={fieldLabel}>Use</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as HouseKind)}
                  className={`${field} mt-1`}
                >
                  {(Object.keys(USE_LABEL) as HouseKind[]).map((k) => (
                    <option key={k} value={k}>
                      {USE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Heated floor area, m²</span>
                <input
                  inputMode="numeric"
                  value={count(area)}
                  onChange={(e) => setArea(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  className={`${field} mt-1 tabular-nums`}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Built</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodId)}
                  className={`${field} mt-1`}
                >
                  {PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  checked={renovated}
                  onChange={(e) => setRenovated(e.target.checked)}
                  className="size-4 accent-blue"
                />
                Renovated
              </label>
            </>
          )}
          {step === 2 && (
            <label className="block">
              <span className={fieldLabel}>Server size</span>
              <select
                value={sizeId}
                onChange={(e) => setSizeId(e.target.value)}
                className={`${field} mt-1`}
              >
                {SERVER_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {step === 3 && (
            <label className="block">
              <span className={fieldLabel}>Host, as on the contract</span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Name of the owner"
                className={`${field} mt-1`}
              />
            </label>
          )}
          <div className="flex justify-between gap-3 pt-1">
            {step > 0 ? (
              <button type="button" className={secondary} onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={!ready[step]}
              className={`${primary} disabled:opacity-50`}
            >
              {step < STEPS.length - 1 ? "Next" : "Add to Buildings"}
            </button>
          </div>
        </form>

        <section aria-labelledby="estimate">
          <h2 id="estimate" className="text-[15px] text-label-2">
            {address.trim() || "The building"}
            {step > 0 && `, ${zone}`}
          </h2>
          {step === 0 ? (
            <p className="mt-2 max-w-[480px] text-[17px] text-label-2">
              Start with the address. The next step asks what the building is, for its heat a year.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[48px] leading-none font-semibold tracking-tight tabular-nums">
                <span className="mr-2 inline-block size-3 rounded-full bg-ember align-middle" />
                {mwh(heat.totalKwh)} MWh
              </p>
              <p className="mt-2 text-[17px]">heat a year, our estimate</p>
              <dl className="mt-5 divide-y divide-sep border-y border-sep text-[15px]">
                {[
                  ["Servers to carry it", `${est.servers} × ${size.label}`],
                  ["Share of its heat the servers cover", `${est.shareOfHeatCoveredPct} %`],
                  ["Left a year before hardware", chf(est.netBeforeHardwareChf)],
                  ["Left a year after hardware", chf(est.netAfterHardwareChf)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-6 py-3">
                    <dt>{k}</dt>
                    <dd className="font-semibold whitespace-nowrap tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <Sources>
                <p>Heat a year: {HOUSE_SOURCE} (config.json: house_quality).</p>
                <p>
                  Servers and money: scaled from {est.scaledFrom}, the reference house, at its
                  tariff and the mid hardware case (packages/economics: estimate).
                </p>
              </Sources>
            </>
          )}
        </section>
      </div>
    </>
  );
}
