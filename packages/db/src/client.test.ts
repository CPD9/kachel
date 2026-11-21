import { describe, expect, it } from "vitest";
import { Constants, createKachelClient } from "./index";

describe("createKachelClient", () => {
  it("builds a client for the local stack", () => {
    const db = createKachelClient("http://127.0.0.1:54321", "local-anon-key");
    expect(typeof db.from).toBe("function");
  });

  it("names the missing setting instead of failing later", () => {
    expect(() => createKachelClient(undefined, "key")).toThrow(/\.env\.example/);
    expect(() => createKachelClient("http://127.0.0.1:54321", "")).toThrow(/\.env\.example/);
  });
});

describe("generated enums", () => {
  it("keep the agent's job states", () => {
    // services/agent/src/kachel_agent/process.py: State, plus QUEUED before a server takes the job.
    expect(Constants.public.Enums.job_state).toEqual(["QUEUED", "RUNNING", "PAUSED", "GONE"]);
  });
});
