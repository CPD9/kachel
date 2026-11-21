/**
 * The local model behind the chat: Ollama on this computer (#26). Nothing here talks to a cloud;
 * a URL that is not on this machine is refused before any request leaves the page.
 */

export type ToolCall = { name: string; arguments: Record<string, unknown> };

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: { function: ToolCall }[] }
  | { role: "tool"; content: string; tool_name: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type ModelReply = { content: string; thinking: string; toolCalls: ToolCall[] };

/** ready: it answers. offline: nothing listens. no-model: Ollama runs without this model. */
export type ModelStatus = "ready" | "offline" | "no-model" | "not-local";

/** What the chat needs from a model: Ollama in the app, a scripted fake in tests. */
export interface ChatModel {
  readonly name: string;
  status(): Promise<ModelStatus>;
  reply(messages: ModelMessage[], tools: ToolSpec[], signal?: AbortSignal): Promise<ModelReply>;
}

/** Thrown when the model cannot answer; its message is safe to show. */
export class ModelError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True only for a URL on this machine, so the chat can never reach a cloud model. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** qwen3 may still wrap reasoning in <think> tags in its answer; that goes to the thinking. */
export function splitThinking(
  content: string,
  thinking = "",
): { content: string; thinking: string } {
  const tags = /<think>([\s\S]*?)(<\/think>|$)/g;
  const inline = [...content.matchAll(tags)].map((m) => (m[1] ?? "").trim());
  return {
    content: content.replace(tags, "").trim(),
    thinking: [thinking.trim(), ...inline].filter(Boolean).join("\n\n"),
  };
}

type OllamaReply = {
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: { function?: { name?: string; arguments?: unknown } }[];
  };
};

const asArgs = (a: unknown): Record<string, unknown> => {
  if (typeof a === "string") {
    try {
      return asArgs(JSON.parse(a));
    } catch {
      return {};
    }
  }
  return a !== null && typeof a === "object" ? (a as Record<string, unknown>) : {};
};

/**
 * Ollama's chat API with tools. Thinking stays on (qwen3 reasons better with it) and comes back
 * separately, so the panel can keep it folded away.
 */
export function ollama({
  url,
  model,
  fetcher = (input, init) => fetch(input, init),
}: {
  url: string;
  model: string;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
}): ChatModel {
  const base = url.replace(/\/+$/, "");
  const local = isLocalUrl(base);
  return {
    name: model,
    async status() {
      if (!local) return "not-local";
      try {
        const res = await fetcher(`${base}/api/tags`);
        if (!res.ok) return "offline";
        const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
        const names = (body.models ?? []).flatMap((m) => [m.name, m.model]);
        return names.includes(model) ? "ready" : "no-model";
      } catch {
        return "offline";
      }
    },
    async reply(messages, tools, signal) {
      if (!local) throw new ModelError("The chat only talks to a model on this computer.");
      let res: Response;
      try {
        res = await fetcher(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            tools: tools.map((t) => ({ type: "function", function: t })),
            stream: false,
            think: true,
            options: { temperature: 0 },
          }),
          ...(signal ? { signal } : {}),
        });
      } catch {
        throw new ModelError("The local model is not reachable. Is Ollama running?");
      }
      if (!res.ok) throw new ModelError("The local model could not answer.");
      const body = (await res.json()) as OllamaReply;
      const m = body.message ?? {};
      const { content, thinking } = splitThinking(m.content ?? "", m.thinking ?? "");
      const toolCalls = (m.tool_calls ?? []).flatMap((c) =>
        c.function?.name
          ? [{ name: c.function.name, arguments: asArgs(c.function.arguments) }]
          : [],
      );
      return { content, thinking, toolCalls };
    },
  };
}
