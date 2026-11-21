import { ModelError, type ChatModel, type ModelMessage } from "./model";
import { TOOL_SPECS, runTool, type ChatData, type ToolResult } from "./tools";

export const SYSTEM = [
  "You are Kachel, the assistant of one home that is heated by its own servers.",
  "Answer the homeowner in one to three short sentences of British English, speaking to them as you.",
  "Name what each number is, as the tool labels it (for example with or without the battery).",
  "Before answering anything about the house, its tank, heat, money, servers, jobs, solar or electricity prices, call a tool.",
  "Every number you give must appear in a tool result in this conversation, with its unit. Never estimate, add up or invent a number.",
  "If a tool returns no facts, or its note says something is missing, say so plainly instead of answering.",
  "If the data is a replay of a stored day, say so and name that day by its date.",
  "The tank has no temperature reading: give the heat it stores and how full it is.",
].join(" ");

/** How many times the model may ask for tools before it must answer. */
const ROUNDS = 4;

export type Turn = {
  question: string;
  answer: string;
  thinking: string;
  cards: ToolResult[];
  /** Numbers in the answer that no tool returned: shown as a warning, never hidden. */
  unchecked: string[];
};

const NUMBER = /-?\d[\d,']*(?:\.\d+)?/g;
const parse = (s: string) => Number(s.replace(/[,']/g, ""));
const decimals = (s: string) => s.split(".")[1]?.length ?? 0;

/** Every number a tool gave, as numbers and as numbers inside its text. */
function knownNumbers(cards: ToolResult[], question: string): number[] {
  const text = [
    question,
    ...cards.flatMap((c) => [
      c.note ?? "",
      ...c.facts.map((f) => `${f.label} ${f.value} ${f.source}`),
    ]),
  ];
  return [
    ...cards.flatMap((c) => c.facts.flatMap((f) => (typeof f.value === "number" ? [f.value] : []))),
    ...text.flatMap((t) => [...t.matchAll(NUMBER)].map((m) => parse(m[0]))),
  ];
}

/**
 * The numbers in an answer that do not match any tool value, allowing the model to round a value
 * to fewer decimals (9.83 may be said as 9.8 or 10) and to drop a minus sign.
 */
export function uncheckedNumbers(answer: string, cards: ToolResult[], question = ""): string[] {
  const known = knownNumbers(cards, question);
  const found = [...answer.matchAll(NUMBER)].map((m) => m[0].replace(/[,.]$/, ""));
  return [...new Set(found)].filter((raw) => {
    const n = Math.abs(parse(raw));
    const d = decimals(raw);
    return !known.some((k) => {
      const v = Math.abs(k);
      return v === n || Math.abs(Number(v.toFixed(d)) - n) < 1e-9;
    });
  });
}

/**
 * Ask the model one question. It may call the closed tools a few times; each result becomes a
 * card. Earlier questions and answers go along so a follow-up reads naturally.
 */
export async function ask(
  model: ChatModel,
  data: ChatData,
  earlier: Turn[],
  question: string,
  signal?: AbortSignal,
): Promise<Turn> {
  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM },
    ...earlier.flatMap((t): ModelMessage[] => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.answer },
    ]),
    { role: "user", content: question },
  ];
  const cards: ToolResult[] = [];
  const thinking: string[] = [];
  for (let round = 0; round <= ROUNDS; round++) {
    const tools = round < ROUNDS ? [...TOOL_SPECS] : [];
    const reply = await model.reply(messages, tools, signal);
    if (reply.thinking) thinking.push(reply.thinking);
    if (reply.toolCalls.length === 0 || round === ROUNDS) {
      const answer = reply.content || "The model gave no answer. Please ask again.";
      return {
        question,
        answer,
        thinking: thinking.join("\n\n"),
        cards,
        unchecked: uncheckedNumbers(answer, cards, question),
      };
    }
    messages.push({
      role: "assistant",
      content: reply.content,
      tool_calls: reply.toolCalls.map((c) => ({ function: c })),
    });
    for (const call of reply.toolCalls) {
      const result = await runTool(call.name, call.arguments, data);
      if (result) cards.push(result);
      messages.push({
        role: "tool",
        tool_name: call.name,
        content: JSON.stringify(
          result
            ? {
                facts: result.facts.map(({ label, value, unit }) => ({ label, value, unit })),
                note: result.note,
              }
            : { error: `There is no tool called ${call.name}.` },
        ),
      });
    }
  }
  throw new ModelError("The model did not finish its answer.");
}
