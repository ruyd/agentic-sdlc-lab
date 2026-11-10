// Summarizes runs/runs.jsonl: runs, success rate, cost and latency per agent.
import { readFile } from "node:fs/promises";

const rows = (await readFile("runs/runs.jsonl", "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byAgent = new Map<string, typeof rows>();
for (const r of rows) byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r]);

console.table(
  [...byAgent].map(([agent, rs]) => ({
    agent,
    runs: rs.length,
    successPct: Math.round((100 * rs.filter((r) => r.ok).length) / rs.length),
    totalUsd: +rs.reduce((s, r) => s + r.costUsd, 0).toFixed(3),
    avgTurns: +(rs.reduce((s, r) => s + r.turns, 0) / rs.length).toFixed(1),
    p50Ms: rs.map((r) => r.durationMs).sort((a, b) => a - b)[Math.floor(rs.length / 2)],
  })),
);
