import type { JobFeed } from "@kachel/db";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

const quiet: JobFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};

describe("console app", () => {
  it("shows the console heading, the form and the jobs table", () => {
    render(<App feed={quiet} submit={() => new Promise(() => undefined)} />);
    expect(screen.getByRole("heading", { name: "Kachel console" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit job" })).toBeTruthy();
  });
});
