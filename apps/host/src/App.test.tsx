import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import {
  DEMO_HOST,
  isLocalStack,
  type AppAuth,
  type DecisionFeed,
  type HouseFeed,
  type JobFeed,
  type LiveDecision,
} from "@kachel/db";

const quiet: JobFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};
const quietHouse: HouseFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};

const decision: LiveDecision = {
  hash: "91156f8a4342" + "3".repeat(52),
  prev_hash: "5ec7b4868fd0" + "1".repeat(52),
  seq: 25,
  site_id: "00000000-0000-4000-8000-000000000100",
  time: "2025-07-15T01:00:00+02:00",
  temp_c: 19.8,
  demand_kwh: 0.5,
  soc_kwh: 34.3,
  tank_kwh: 35,
  interactive: 0,
  batch: 0,
  opportunistic: 1,
  reason: "heat needed",
  run: ["00000000-0000-4000-8000-000000000304"],
  placed: 0,
  written_at: "2026-11-22T01:00:00Z",
};
const decisions: DecisionFeed = {
  load: () => Promise.resolve([decision]),
  subscribe: () => () => undefined,
};

/** Auth the test drives: the demo host's password works, anything else does not. */
function fakeAuth(signedIn: string | null = null) {
  const listeners: ((email: string | null) => void)[] = [];
  const tell = (email: string | null) => act(() => listeners.forEach((l) => l(email)));
  const auth: AppAuth = {
    current: () => Promise.resolve(signedIn),
    onChange(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    async signIn(email, password) {
      const ok = email === DEMO_HOST.email && password === DEMO_HOST.password;
      if (ok) await tell(email);
      return ok;
    },
    async signOut() {
      await tell(null);
    },
  };
  return auth;
}

afterEach(cleanup);

describe("host app", () => {
  it("shows the house heading", () => {
    render(<App feed={quiet} house={quietHouse} auth={fakeAuth()} local={false} />);
    expect(screen.getByRole("heading", { name: "Kachel" })).toBeTruthy();
  });

  it("asks the host to sign in before showing servers", async () => {
    render(<App feed={quiet} house={quietHouse} auth={fakeAuth()} local={false} />);
    expect(await screen.findByRole("heading", { name: /Sign in/ })).toBeTruthy();
    expect(screen.queryByText(/Your servers/)).toBeNull();
    expect(screen.queryByText(/Reading the house/)).toBeNull();
    expect(screen.queryByText(/kachel-demo/)).toBeNull();
  });

  it("names the demo host on the local stack and signs in with it", async () => {
    render(<App feed={quiet} house={quietHouse} auth={fakeAuth()} local={true} />);
    expect(await screen.findByText(/Local demo: host@kachel.test/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: DEMO_HOST.password },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Your servers/)).toBeTruthy();
    expect(screen.getByText(DEMO_HOST.email)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: /Sign in/ })).toBeTruthy();
  });

  it("says plainly when the password is wrong", async () => {
    render(<App feed={quiet} house={quietHouse} auth={fakeAuth()} local={true} />);
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/do not match/);
  });

  it("goes straight to the house and the servers when a session is kept", async () => {
    render(<App feed={quiet} house={quietHouse} auth={fakeAuth(DEMO_HOST.email)} local={false} />);
    expect(await screen.findByText(/Your servers/)).toBeTruthy();
    expect(screen.getByText(/Reading the house/)).toBeTruthy();
  });

  it("shows why the scheduler decided what it did, with the decision's hash", async () => {
    render(
      <App
        feed={quiet}
        house={quietHouse}
        auth={fakeAuth(DEMO_HOST.email)}
        local={false}
        decisions={decisions}
      />,
    );
    expect(await screen.findByText("Backlog runs on 1 server")).toBeTruthy();
    expect(screen.getByText("heat needed")).toBeTruthy();
    expect(screen.getByText(decision.hash)).toBeTruthy();
  });
});

describe("isLocalStack", () => {
  it("is true only for the local Supabase stack", () => {
    expect(isLocalStack("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalStack("http://localhost:54321")).toBe(true);
    expect(isLocalStack("https://abc.supabase.co")).toBe(false);
    expect(isLocalStack(undefined)).toBe(false);
  });
});
