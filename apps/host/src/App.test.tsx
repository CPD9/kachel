import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { JobFeed } from "./live/feed";

const quiet: JobFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};

describe("host app", () => {
  it("shows the house heading", () => {
    render(<App feed={quiet} />);
    expect(screen.getByRole("heading", { name: "Kachel" })).toBeTruthy();
  });
});
