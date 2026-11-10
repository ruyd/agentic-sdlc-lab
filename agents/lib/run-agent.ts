// Thin wrapper around the Agent SDK `query` loop: runs an agent, returns the final result,
// and appends one observability record per run to runs/runs.jsonl (cost, tokens, turns, latency).
import { appendFile, mkdir } from "node:fs/promises";
import { query, type Options, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

export interface AgentRun {
  ok: boolean;
  text: string;
  structured?: unknown;
  costUsd: number;
  turns: number;
  durationMs: number;
  subtype: SDKResultMessage["subtype"];
}

export async function runAgent(name: string, prompt: string, options: Options): Promise<AgentRun> {
  let result: SDKResultMessage | undefined;
  for await (const message of query({ prompt, options })) {
    if (message.type === "result") result = message;
  }
  if (!result) throw new Error(`${name}: agent ended without a result message`);

  const run: AgentRun = {
    ok: result.subtype === "success" && !result.is_error,
    text: result.subtype === "success" ? result.result : "",
    structured: (result as { structured_output?: unknown }).structured_output,
    costUsd: result.total_cost_usd,
    turns: result.num_turns,
    durationMs: result.duration_ms,
    subtype: result.subtype,
  };

  await mkdir("runs", { recursive: true });
  await appendFile(
    "runs/runs.jsonl",
    JSON.stringify({ at: new Date().toISOString(), agent: name, model: options.model ?? "default", ...run, text: run.text.slice(0, 500) }) + "\n",
  );
  return run;
}

/** Extracts the first JSON object from model text (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}
