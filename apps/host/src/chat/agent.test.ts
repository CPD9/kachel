import { describe, expect, it } from "vitest";
import { ask, uncheckedNumbers } from "./agent";
import { call, fakeData, scriptedModel } from "./fixtures";
import { isLocalUrl, ollama, splitThinking } from "./model";

describe("ask", () => {
  it("runs the tool the model asks for and answers from its values", async () => {
    const { model, sent } = scriptedModel([
      { toolCalls: [call("jobs", { server: 4 })], thinking: "Check server 4." },
      { content: "Server 4 is paused by its signal file (the demo switch), not the tank." },
    ]);
    const turn = await ask(model, fakeData(), [], "Why is server 4 paused?");
    expect(turn.cards.map((c) => c.tool)).toEqual(["jobs"]);
    expect(turn.answer).toMatch(/^Server 4 is paused/);
    expect(turn.unchecked).toEqual([]);
    expect(turn.thinking).toBe("Check server 4.");
    const toolMessage = sent[1]?.messages.at(-1);
    expect(toolMessage).toMatchObject({ role: "tool", tool_name: "jobs" });
    expect(toolMessage?.content).toContain("paused by its signal file (demo switch, not the tank)");
    expect(sent[0]?.tools.map((t) => t.name)).toEqual([
      "heat_now",
      "heat_today",
      "money",
      "jobs",
      "solar",
    ]);
  });

  it("flags a number no tool gave", async () => {
    const { model } = scriptedModel([
      { toolCalls: [call("heat_now")] },
      { content: "The tank holds 31.2 kWh, about 60 °C." },
    ]);
    const turn = await ask(model, fakeData(), [], "How warm is the tank?");
    expect(turn.unchecked).toEqual(["60"]);
  });

  it("tells the model when a tool does not exist", async () => {
    const { model, sent } = scriptedModel([
      { toolCalls: [call("rerun_year")] },
      { content: "I cannot do that." },
    ]);
    const turn = await ask(model, fakeData(), [], "Rerun the year");
    expect(turn.cards).toEqual([]);
    expect(sent[1]?.messages.at(-1)?.content).toContain("There is no tool called rerun_year.");
  });

  it("stops offering tools after four rounds", async () => {
    const loop = Array.from({ length: 5 }, () => ({ toolCalls: [call("heat_now")] }));
    const { model, sent } = scriptedModel([...loop.slice(0, 4), { content: "Done." }]);
    const turn = await ask(model, fakeData(), [], "Loop");
    expect(sent).toHaveLength(5);
    expect(sent[4]?.tools).toEqual([]);
    expect(turn.answer).toBe("Done.");
  });

  it("sends earlier questions and answers along", async () => {
    const { model, sent } = scriptedModel([{ content: "Hello." }]);
    const earlier = [{ question: "Hi?", answer: "Hi.", thinking: "", cards: [], unchecked: [] }];
    await ask(model, fakeData(), earlier, "And now?");
    expect(sent[0]?.messages.slice(1).map((m) => m.content)).toEqual(["Hi?", "Hi.", "And now?"]);
  });
});

describe("uncheckedNumbers", () => {
  const card = {
    tool: "money" as const,
    title: "Money",
    facts: [{ label: "Year: earned", value: 15538, unit: "CHF", source: "kpis" }],
  };
  it("accepts rounding and thousands separators", () => {
    expect(uncheckedNumbers("It earned CHF 15,538 this year.", [card])).toEqual([]);
    expect(
      uncheckedNumbers("31 kWh", [{ ...card, facts: [{ label: "x", value: 31.2, source: "" }] }]),
    ).toEqual([]);
  });
  it("names the rest", () => {
    expect(uncheckedNumbers("It earned CHF 16,000.", [card])).toEqual(["16,000"]);
  });
});

describe("the local model", () => {
  it("only allows this computer", () => {
    expect(isLocalUrl("http://localhost:11434")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLocalUrl("https://api.example.com")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });

  it("never calls a model that is not local", async () => {
    let calls = 0;
    const m = ollama({
      url: "https://ollama.example.com",
      model: "qwen3:4b",
      fetcher: () => {
        calls++;
        return Promise.resolve(new Response("{}"));
      },
    });
    expect(await m.status()).toBe("not-local");
    await expect(m.reply([], [])).rejects.toThrow(/this computer/);
    expect(calls).toBe(0);
  });

  it("says offline when Ollama does not answer, and no-model without qwen3:4b", async () => {
    const down = ollama({
      url: "http://localhost:11434",
      model: "qwen3:4b",
      fetcher: () => Promise.reject(new Error("refused")),
    });
    expect(await down.status()).toBe("offline");
    const other = ollama({
      url: "http://localhost:11434",
      model: "qwen3:4b",
      fetcher: () => Promise.resolve(Response.json({ models: [{ name: "qwen3:8b" }] })),
    });
    expect(await other.status()).toBe("no-model");
  });

  it("asks Ollama with tools and keeps the thinking apart", async () => {
    let body: unknown;
    const m = ollama({
      url: "http://localhost:11434/",
      model: "qwen3:4b",
      fetcher: (url, init) => {
        expect(url).toBe("http://localhost:11434/api/chat");
        body = JSON.parse(String(init?.body));
        return Promise.resolve(
          Response.json({
            message: {
              content: "",
              thinking: "Need the tank.",
              tool_calls: [{ function: { name: "heat_now", arguments: {} } }],
            },
          }),
        );
      },
    });
    const r = await m.reply(
      [{ role: "user", content: "Tank?" }],
      [{ name: "heat_now", description: "d", parameters: { type: "object", properties: {} } }],
    );
    expect(r).toEqual({
      content: "",
      thinking: "Need the tank.",
      toolCalls: [{ name: "heat_now", arguments: {} }],
    });
    expect(body).toMatchObject({ model: "qwen3:4b", stream: false, think: true });
  });

  it("moves <think> blocks out of the answer", () => {
    expect(splitThinking("<think>hmm</think>\nThe tank is full.")).toEqual({
      content: "The tank is full.",
      thinking: "hmm",
    });
  });
});
