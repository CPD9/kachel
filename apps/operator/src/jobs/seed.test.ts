import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_BUYERS, SEED_JOB_ROWS, SEED_SITES, seedJobs } from "./seed";

// Tests run from apps/operator.
const sql = readFileSync(resolve(process.cwd(), "../../supabase/seed.sql"), "utf8");

describe("the synthetic jobs without a database", () => {
  it("are the seed's own buyers, houses and jobs", () => {
    for (const b of SEED_BUYERS) expect(sql).toContain(`'${b.name}'`);
    for (const s of SEED_SITES) expect(sql).toContain(`'${s.name}', '${s.city}'`);
    for (const [n, buyer, , , kind, label, , , state] of SEED_JOB_ROWS)
      expect(sql).toMatch(
        new RegExp(
          `\\('${n}', '${buyer}', .*'${kind}', '${label.replace(/[()]/g, "\\$&")}', .*'${state}'`,
        ),
      );
  });

  it("never names a real rail company", () => {
    expect(SEED_BUYERS.map((b) => b.name)).toContain("Rail operator");
    expect(JSON.stringify(SEED_BUYERS)).not.toMatch(/SBB/);
  });

  it("gives running and paused jobs a server, queued and done ones none", () => {
    const { jobs, servers } = seedJobs(Date.parse("2026-11-22T08:00:00Z"));
    expect(jobs).toHaveLength(SEED_JOB_ROWS.length);
    for (const j of jobs)
      expect(j.server_id === null).toBe(j.state === "QUEUED" || j.state === "GONE");
    expect(servers.length).toBe(jobs.filter((j) => j.server_id).length);
  });
});
