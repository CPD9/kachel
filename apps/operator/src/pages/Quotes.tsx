import { useMemo, useState } from "react";
import { chf2, count, fixed1, pct } from "../format";
import { quote, WORKLOADS, ZONES, type Workload, type Zone } from "../fleet/quote";
import { PageHead, Sources } from "../shell/Shell";
import { card, field, fieldLabel } from "../ui";

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Our example volumes for the form; the buyer's own figures go in their place. */
const EXAMPLE: Record<Workload, number> = { image: 1_000_000, video: 1_000 };

/**
 * A quote for a buyer's tagging job: what it is, how much a day, where the data may go. The answer
 * is the price from the model's compute price and the job's measured size, and what the homes in
 * that zone can take in the chosen month.
 */
export function Quotes({
  month,
  monthName,
  offset,
}: {
  month: number;
  monthName: string;
  offset: number;
}) {
  const [buyer, setBuyer] = useState("Rail operator");
  const [workload, setWorkload] = useState<Workload>("image");
  const [perDay, setPerDay] = useState(EXAMPLE.image);
  const [zone, setZone] = useState<Zone>("Basel");
  const w = WORKLOADS[workload];
  const q = useMemo(
    () => quote({ workload, perDay, zone, month, offset }),
    [workload, perDay, zone, month, offset],
  );
  const where = zone === "Switzerland" ? "Switzerland" : zone;
  const items = workload === "image" ? "images" : "recordings";

  return (
    <>
      <PageHead title="New quote" />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,560px)_1fr]">
        <form
          aria-label="Quote"
          className={`${card} space-y-5 p-5 sm:p-6`}
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="block">
            <span className={fieldLabel}>Buyer</span>
            <input
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Workload</span>
            <select
              value={workload}
              onChange={(e) => {
                const next = e.target.value as Workload;
                setWorkload(next);
                setPerDay(EXAMPLE[next]);
              }}
              className={`${field} mt-1`}
            >
              {(Object.keys(WORKLOADS) as Workload[]).map((k) => (
                <option key={k} value={k}>
                  {WORKLOADS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Volume, {w.unit}</span>
            <input
              inputMode="numeric"
              aria-label="Volume"
              value={count(perDay)}
              onChange={(e) => setPerDay(Number(e.target.value.replace(/\D/g, "")) || 0)}
              className={`${field} mt-1 tabular-nums`}
            />
          </label>
          <fieldset>
            <legend className={fieldLabel}>Where the data may go</legend>
            <div className="mt-1.5 space-y-1.5">
              {(Object.keys(ZONES) as Zone[]).map((z) => (
                <label key={z} className="flex items-center gap-2.5 text-[15px]">
                  <input
                    type="radio"
                    name="zone"
                    value={z}
                    checked={zone === z}
                    onChange={() => setZone(z)}
                    className="size-4 accent-blue"
                  />
                  {z === "Switzerland" ? "Switzerland (Basel and Bern)" : `${z} only`}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-[14px] text-label-2">
            Deadline {w.deadlineH} hours: it starts at {hour(w.startsAt)} and is done by{" "}
            {hour(q.doneBy)}.
          </p>
        </form>

        <section aria-labelledby="offer">
          <h2 id="offer" className="text-[15px] text-label-2">
            What we can offer {buyer.trim() ? `${buyer.trim()} ` : ""}in {monthName}
          </h2>
          <p
            data-reading="Unit price"
            className="mt-1 text-[48px] leading-none font-semibold tracking-tight tabular-nums sm:text-[64px]"
          >
            <span data-value>{chf2(q.unitPrice)}</span>
          </p>
          <p className="mt-3 text-[19px] leading-snug font-semibold">
            {w.priceUnitLabel}, done by {hour(q.doneBy)}. The {items} never leave {where}.
          </p>
          <dl className="mt-5 divide-y divide-sep border-y border-sep text-[15px]">
            {[
              [`For ${count(perDay)} ${w.unit}`, `${chf2(q.chfPerDay)} a day`],
              ["Server-hours it needs a day", fixed1(q.serverHoursPerDay)],
              [
                `Server-hours a day the ${count(q.houses)} homes in ${ZONES[zone]} run on their heat in ${monthName}`,
                count(q.capacityPerDay),
              ],
              ["Electricity it draws a day", `${fixed1(q.kwhPerDay)} kWh`],
              [`Share of the servers' heat the homes used in ${monthName}`, pct(q.usefulShare)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 py-3">
                <dt>{k}</dt>
                <dd className="font-semibold whitespace-nowrap tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <Sources>
            <p>{w.source}</p>
            <p>
              Price: the model&apos;s compute price (config.json: prices) for the server-hours the
              job needs. Server-hours the homes run and the heat they used: the scheduler&apos;s run
              of every synthetic house (make months) on the 2025 weather. Tagging runs as a batch
              job, ahead of the deadline-free backlog that fills those hours now.
            </p>
          </Sources>
        </section>
      </div>
    </>
  );
}
