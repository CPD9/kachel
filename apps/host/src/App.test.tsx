import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { DEMO_HOST, isLocalStack, type HostAuth } from "./auth/session";
import type { JobFeed } from "./live/feed";

const quiet: JobFeed = {
  load: () => new Promise(() => undefined),
  subscribe: () => () => undefined,
};

/** Auth the test drives: the demo host's password works, anything else does not. */
function fakeAuth(signedIn: string | null = null) {
  const listeners: ((email: string | null) => void)[] = [];
  const tell = (email: string | null) => act(() => listeners.forEach((l) => l(email)));
  const auth: HostAuth = {
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
    render(<App feed={quiet} auth={fakeAuth()} local={false} />);
    expect(screen.getByRole("heading", { name: "Kachel" })).toBeTruthy();
  });

  it("asks the host to sign in before showing servers", async () => {
    render(<App feed={quiet} auth={fakeAuth()} local={false} />);
    expect(await screen.findByRole("heading", { name: /Sign in/ })).toBeTruthy();
    expect(screen.queryByText(/Your servers/)).toBeNull();
    expect(screen.queryByText(/kachel-demo/)).toBeNull();
  });

  it("names the demo host on the local stack and signs in with it", async () => {
    render(<App feed={quiet} auth={fakeAuth()} local={true} />);
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
    render(<App feed={quiet} auth={fakeAuth()} local={true} />);
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/do not match/);
  });

  it("goes straight to the servers when a session is kept", async () => {
    render(<App feed={quiet} auth={fakeAuth(DEMO_HOST.email)} local={false} />);
    expect(await screen.findByText(/Your servers/)).toBeTruthy();
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
