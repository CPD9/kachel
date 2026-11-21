import type { JobFeed, LiveJob } from "@kachel/db";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { check, JobForm, MAX_SERVER_HOURS, type Fields } from "./JobForm";
import { SignedOut, type NewJob } from "./submit";
import { fakeAuth } from "../testing";

const NOW = new Date("2026-11-21T12:00:00Z");
const batch: Fields = { label: "Transcribe talks", kind: "batch", size: "8", deadline: "" };
const tomorrow = "2026-11-22T12:00";

afterEach(cleanup);

describe("check", () => {
  it("accepts a batch job with a deadline far enough ahead", () => {
    const result = check({ ...batch, deadline: tomorrow }, NOW);
    expect(result).toEqual({
      job: {
        label: "Transcribe talks",
        kind: "batch",
        size: 8,
        deadline: new Date(tomorrow).toISOString(),
      },
    });
  });

  it("asks for a name, a positive size and a deadline", () => {
    const result = check({ label: "  ", kind: "batch", size: "0", deadline: "" }, NOW);
    expect(result).toEqual({
      errors: {
        label: "Give the job a name.",
        size: "Give the size in server-hours, more than 0.",
        deadline: "A batch job needs a deadline.",
      },
    });
  });

  it("refuses a size it cannot read or one too large", () => {
    expect(check({ ...batch, size: "eight", deadline: tomorrow }, NOW)).toHaveProperty(
      "errors.size",
    );
    const big = String(MAX_SERVER_HOURS + 1);
    expect(check({ ...batch, size: big, deadline: tomorrow }, NOW)).toHaveProperty("errors.size");
  });

  it("refuses a deadline in the past, or one no house could meet", () => {
    const past = check({ ...batch, deadline: "2026-11-20T12:00" }, NOW);
    expect(past).toHaveProperty("errors.deadline", "The deadline has to be in the future.");
    // 60 server-hours on six servers is ten hours; one hour is not enough.
    const rushed = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(check({ ...batch, size: "60", deadline: rushed }, NOW)).toHaveProperty(
      "errors.deadline",
    );
  });

  it("gives backlog and interactive jobs no deadline", () => {
    const result = check({ ...batch, kind: "opportunistic", deadline: "garbage" }, NOW);
    expect(result).toHaveProperty("job.deadline", null);
  });
});

function fill(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}

describe("JobForm", () => {
  it("shows what is wrong next to each field and submits nothing", async () => {
    const submit = vi.fn();
    render(<JobForm submit={submit} now={() => NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit job" }));
    expect(await screen.findByText("Give the job a name.")).toBeTruthy();
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
  });

  it("says plainly when the job cannot be saved", async () => {
    const submit = () => Promise.reject(new Error("duplicate key value violates constraint"));
    render(<JobForm submit={submit} now={() => NOW} />);
    fill("Type", "opportunistic");
    fill("Name", "Embed the archive");
    fill("Size, server-hours", "12");
    fireEvent.click(screen.getByRole("button", { name: "Submit job" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/could not be submitted/);
    expect(status.textContent).not.toMatch(/duplicate key/);
  });

  it("asks the buyer to sign in again when the session has ended", async () => {
    const submit = () => Promise.reject(new SignedOut());
    render(<JobForm submit={submit} now={() => NOW} />);
    fill("Type", "opportunistic");
    fill("Name", "Embed the archive");
    fill("Size, server-hours", "12");
    fireEvent.click(screen.getByRole("button", { name: "Submit job" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/sign in again/);
  });
});

describe("console", () => {
  it("shows a submitted job in the table as queued", async () => {
    const feed: JobFeed = {
      load: () => Promise.resolve({ sites: [], servers: [], jobs: [] }),
      subscribe: () => () => undefined,
    };
    const submit = vi.fn(async (job: NewJob): Promise<LiveJob> => ({
      id: "new",
      label: job.label,
      kind: job.kind,
      state: "QUEUED",
      site_id: null,
      server_id: null,
      server_hours: job.size,
      deadline_at: job.deadline,
      active_cpu_s: 0,
      created_at: "2026-11-21T12:00:00+00:00",
      updated_at: "2026-11-21T12:00:00+00:00",
    }));
    render(<App feed={feed} submit={submit} auth={fakeAuth("buyer@kachel.test")} local={false} />);
    await screen.findByText("· live");
    expect(screen.getByText("No jobs yet. Submit one above.")).toBeTruthy();
    fill("Type", "opportunistic");
    fill("Name", "Embed the archive");
    fill("Size, server-hours", "12");
    fireEvent.click(screen.getByRole("button", { name: "Submit job" }));
    expect(await screen.findByText("Queued: Embed the archive.")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith({
      label: "Embed the archive",
      kind: "opportunistic",
      size: 12,
      deadline: null,
    });
    const row = within(screen.getByRole("table")).getByText("Embed the archive").closest("tr");
    expect(row?.textContent).toMatch(/Queued/);
    expect(screen.queryByText("No jobs yet. Submit one above.")).toBeNull();
  });
});
