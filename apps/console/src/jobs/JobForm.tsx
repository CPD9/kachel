import type { JobKind } from "@kachel/db";
import { useState, type FormEvent } from "react";
import { KINDS } from "./JobTable";
import { SignedOut, type NewJob, type Privacy, type SubmitJob } from "./submit";

export type Fields = {
  label: string;
  kind: JobKind;
  size: string;
  deadline: string;
  privacy: Privacy;
};
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

export const PLACES: Record<Privacy, string> = {
  any: "Anywhere",
  swiss: "Switzerland only",
};

const PLACE_HINTS: Record<Privacy, string> = {
  any: "If no house has room in time, it finishes in a data centre.",
  swiss: "Never leaves our Swiss houses: if none has room in time, it runs and the heat is dumped.",
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
  return { job: { label, kind: fields.kind, size, deadline, privacy: fields.privacy } };
}

const EMPTY_FIELDS: Fields = { label: "", kind: "batch", size: "", deadline: "", privacy: "any" };

const input =
  "mt-1.5 block h-11 w-full rounded-lg border border-field bg-white px-3 text-[15px] text-label focus:border-action focus:outline-2 focus:outline-action/30 aria-[invalid=true]:border-[#ff3b30]";

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
    } catch (error) {
      setStatus({
        ok: false,
        text:
          error instanceof SignedOut
            ? "Your sign-in has ended. Sign out and sign in again to submit the job."
            : "The job could not be submitted. Is the local database running?",
      });
    } finally {
      setBusy(false);
    }
  }

  const error = (key: keyof Fields) =>
    errors[key] && (
      <span id={`${key}-error`} className="mt-1 block text-xs text-label">
        {errors[key]}
      </span>
    );
  const described = (key: keyof Fields) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};

  return (
    <section aria-labelledby="submit-job" className="rounded-2xl bg-white p-5 sm:p-6">
      <h2 id="submit-job" className="text-2xl font-semibold tracking-tight">
        Submit a job
      </h2>
      <form noValidate onSubmit={onSubmit} className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-start">
          <div className="text-sm text-secondary">
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
          <div className="text-sm text-secondary">
            <label htmlFor="job-kind">What is it?</label>
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
          <div className="text-sm text-secondary">
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
          <div className="text-sm text-secondary">
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
                <span className="mt-1.5 flex h-11 items-center text-[15px] text-label">
                  None for this kind
                </span>
              </>
            )}
          </div>
          <div className="text-sm text-secondary">
            <label htmlFor="job-privacy">Where may it run?</label>
            <select
              id="job-privacy"
              className={input}
              value={fields.privacy}
              onChange={(e) => set("privacy")(e.target.value)}
            >
              {(Object.keys(PLACES) as Privacy[]).map((place) => (
                <option key={place} value={place}>
                  {PLACES[place]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-lg bg-action px-5 text-[15px] font-semibold text-white hover:bg-action-hover disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit job"}
          </button>
          <p className="min-w-0 flex-1 basis-60 text-sm text-secondary">
            {HINTS[fields.kind]} {PLACE_HINTS[fields.privacy]}
          </p>
        </div>
      </form>
      {status && (
        <p role="status" className="mt-3 text-sm text-label">
          {status.text}
        </p>
      )}
    </section>
  );
}
