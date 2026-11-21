import type { JobKind } from "@kachel/db";
import { useState, type FormEvent } from "react";
import { KINDS } from "./JobTable";
import type { NewJob, SubmitJob } from "./submit";

export type Fields = { label: string; kind: JobKind; size: string; deadline: string };
export type Errors = Partial<Record<keyof Fields, string>>;

/** Servers in the reference house (services/scheduler/out/kpis.json: servers_per_house). */
export const SERVERS_PER_HOUSE = 6;

/** The largest job the form takes: a week on every server of the reference house. */
export const MAX_SERVER_HOURS = SERVERS_PER_HOUSE * 24 * 7;

const HINTS: Record<JobKind, string> = {
  interactive: "Runs at once and cannot be paused; its heat is used or dumped.",
  batch: "Pauses when the house needs no heat and moves if the deadline is at risk.",
  opportunistic: "Runs only when the house needs heat, with no deadline.",
};

/** The job these fields describe, or what is wrong with them. `now` is for the deadline. */
export function check(fields: Fields, now: Date): { job: NewJob } | { errors: Errors } {
  const errors: Errors = {};
  const label = fields.label.trim();
  if (label === "") errors.label = "Give the job a name.";
  else if (label.length > 80) errors.label = "Keep the name under 80 characters.";

  const size = Number(fields.size);
  if (fields.size.trim() === "" || !Number.isFinite(size) || size <= 0) {
    errors.size = "Give the size in server-hours, more than 0.";
  } else if (size > MAX_SERVER_HOURS) {
    errors.size = `At most ${MAX_SERVER_HOURS} server-hours, a week on one house.`;
  }

  let deadline: string | null = null;
  if (fields.kind === "batch") {
    const at = new Date(fields.deadline);
    if (fields.deadline === "" || Number.isNaN(at.getTime())) {
      errors.deadline = "A batch job needs a deadline.";
    } else if (at <= now) {
      errors.deadline = "The deadline has to be in the future.";
    } else if (
      Number.isFinite(size) &&
      at.getTime() - now.getTime() < (size / SERVERS_PER_HOUSE) * 3_600_000
    ) {
      errors.deadline = "Too soon: even every server in the house could not finish it by then.";
    } else {
      deadline = at.toISOString();
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { job: { label, kind: fields.kind, size, deadline } };
}

const EMPTY_FIELDS: Fields = { label: "", kind: "batch", size: "", deadline: "" };

const input =
  "mt-1 block h-9 w-full rounded border border-idle/60 bg-paper px-2 py-1.5 text-sm focus:outline-2 focus:outline-heat aria-[invalid=true]:border-heat";

/** Submit a job: it is written as QUEUED and appears in the table below. */
export function JobForm({
  submit,
  now = () => new Date(),
}: {
  submit: SubmitJob;
  now?: () => Date;
}) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Fields) => (value: string) =>
    setFields((f) => ({ ...f, [key]: value }) as Fields);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = check(fields, now());
    if ("errors" in result) {
      setErrors(result.errors);
      setStatus(null);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const row = await submit(result.job);
      setStatus({ ok: true, text: `Queued: ${row.label}.` });
      setFields(EMPTY_FIELDS);
    } catch {
      setStatus({
        ok: false,
        text: "The job could not be submitted. Is the local database running?",
      });
    } finally {
      setBusy(false);
    }
  }

  const error = (key: keyof Fields) =>
    errors[key] && (
      <span id={`${key}-error`} className="mt-1 block text-xs text-heat">
        {errors[key]}
      </span>
    );
  const described = (key: keyof Fields) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};

  return (
    <section aria-labelledby="submit-job" className="border-b border-idle/40 px-6 py-4">
      <h2 id="submit-job" className="text-lg font-semibold">
        Submit a job
      </h2>
      <form
        noValidate
        onSubmit={onSubmit}
        className="mt-3 grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1.4fr_auto] sm:items-start"
      >
        <div className="text-sm">
          <label htmlFor="job-label">Name</label>
          <input
            id="job-label"
            className={input}
            value={fields.label}
            onChange={(e) => set("label")(e.target.value)}
            {...described("label")}
          />
          {error("label")}
        </div>
        <div className="text-sm">
          <label htmlFor="job-kind">Type</label>
          <select
            id="job-kind"
            className={input}
            value={fields.kind}
            onChange={(e) => set("kind")(e.target.value)}
          >
            {(Object.keys(KINDS) as JobKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KINDS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm">
          <label htmlFor="job-size">Size, server-hours</label>
          <input
            id="job-size"
            className={input}
            inputMode="decimal"
            value={fields.size}
            onChange={(e) => set("size")(e.target.value)}
            {...described("size")}
          />
          {error("size")}
        </div>
        <div className="text-sm">
          {fields.kind === "batch" ? (
            <>
              <label htmlFor="job-deadline">Deadline</label>
              <input
                id="job-deadline"
                type="datetime-local"
                className={input}
                value={fields.deadline}
                onChange={(e) => set("deadline")(e.target.value)}
                {...described("deadline")}
              />
              {error("deadline")}
            </>
          ) : (
            <>
              <span>Deadline</span>
              <span className="mt-1 block py-1.5 text-idle">None for this type</span>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-6 h-9 rounded bg-heat px-4 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit job"}
        </button>
      </form>
      <p className="mt-2 text-xs text-idle">{HINTS[fields.kind]}</p>
      {status && (
        <p role="status" className={`mt-2 text-sm ${status.ok ? "" : "text-heat"}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}
