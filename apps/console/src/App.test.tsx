import { DEMO_BUYER, type JobFeed } from "@kachel/db";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { fakeAuth } from "./testing";

const quiet: JobFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};
const never = () => new Promise<never>(() => undefined);

afterEach(cleanup);

describe("console app", () => {
  it("shows the form and the jobs table to a signed-in buyer", async () => {
    render(<App feed={quiet} submit={never} auth={fakeAuth(DEMO_BUYER.email)} local={false} />);
    expect(screen.getByRole("heading", { name: "Kachel" })).toBeTruthy();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit job" })).toBeTruthy();
  });

  it("asks the buyer to sign in first, and names no demo account off the local stack", async () => {
    render(<App feed={quiet} submit={never} auth={fakeAuth()} local={false} />);
    expect(await screen.findByRole("heading", { name: "Sign in to see your jobs" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/kachel-demo/)).toBeNull();
  });

  it("names the demo buyer on the local stack, signs in and out", async () => {
    render(<App feed={quiet} submit={never} auth={fakeAuth()} local={true} />);
    expect(await screen.findByText(/Local demo: buyer@kachel.test/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: DEMO_BUYER.password },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByText(DEMO_BUYER.email)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });
    expect(await screen.findByRole("heading", { name: "Sign in to see your jobs" })).toBeTruthy();
  });
});
