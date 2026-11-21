import type { JobFeed, LiveJob, LiveServer } from "@kachel/db";
import { SITE, fakeHouse, julHour } from "../house/fixtures";
import type { ChatModel, ModelMessage, ModelReply, ModelStatus, ToolCall, ToolSpec } from "./model";
import type { ChatData, JobRun } from "./tools";

const server = (slot: number, state: LiveServer["state"]): LiveServer => ({
  id: `server-${slot}`,
  site_id: SITE,
  slot,
  name: `Server ${slot}`,
  state,
  power_kw: 1,
  heat_recovery: 0.8,
  updated_at: "2026-11-21T12:00:00+00:00",
});

const job = (id: string, slot: number | null, state: LiveJob["state"], label: string): LiveJob => ({
  id,
  label,
  kind: "opportunistic",
  state,
  site_id: SITE,
  server_id: slot === null ? null : `server-${slot}`,
  server_hours: null,
  deadline_at: null,
  active_cpu_s: 3600,
  moved_offsite: false,
  created_at: "2026-11-21T10:00:00+00:00",
  updated_at: "2026-11-21T12:00:00+00:00",
});

/** The seed's house on 15 July 2025: server 4 holds a paused backlog job (supabase/seed.sql). */
export function fakeData(over: Partial<ChatData> = {}): ChatData {
  const jobs: JobFeed = {
    load: () =>
      Promise.resolve({
        sites: [{ id: SITE, name: "Reference house", city: "Basel" }],
        servers: [server(1, "RUNNING"), server(4, "PAUSED"), server(5, "OFF")],
        jobs: [
          job("job-1", 1, "RUNNING", "Embeddings backlog, part 1"),
          job("job-4", 4, "PAUSED", "Embeddings backlog, part 3"),
          job("job-q", null, "QUEUED", "Evening chat session"),
        ],
      }),
    subscribe: () => () => undefined,
  };
  const runs: JobRun[] = [
    {
      job_id: "job-1",
      tick: 0,
      at: "2026-11-21T12:00:00+00:00",
      state: "RUNNING",
      reason: "heat needed",
    },
    {
      job_id: "job-4",
      tick: 7200,
      at: "2026-11-21T12:00:00+00:00",
      state: "PAUSED",
      reason: "paused by its signal file (demo switch, not the tank)",
    },
  ];
  return {
    house: fakeHouse([julHour(13), julHour(14, { soc_kwh: 31.2 })]).feed,
    jobs,
    runs: (ids) => Promise.resolve(runs.filter((r) => ids.includes(r.job_id))),
    // 14:30 in Basel on a day the scheduler has not written: the July day is replayed.
    now: () => new Date("2026-07-20T12:30:00Z"),
    ...over,
  };
}

/**
 * A model that follows a script: each reply in turn, so a test knows exactly what it says.
 * It records what it was sent.
 */
export function scriptedModel(replies: Partial<ModelReply>[], status: ModelStatus = "ready") {
  const sent: { messages: ModelMessage[]; tools: ToolSpec[] }[] = [];
  let next = 0;
  const model: ChatModel = {
    name: "fake-model",
    status: () => Promise.resolve(status),
    reply(messages, tools) {
      sent.push({ messages: [...messages], tools });
      const r = replies[next++] ?? { content: "No more script." };
      return Promise.resolve({ content: "", thinking: "", toolCalls: [], ...r });
    },
  };
  return { model, sent };
}

export const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  name,
  arguments: args,
});
