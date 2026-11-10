// Multi-agent orchestrator: a lead agent delegates to planner → implementer → reviewer
// subagents and loops implementer ↔ reviewer until approval or MAX_REVIEW_ROUNDS.
//
//   npm run orchestrate -- "Add a per-line discount to computeTotals"
//
// Run it inside a git worktree so it never touches your main checkout:
//   git worktree add ../lab-task-1 -b agent/task-1 && cd ../lab-task-1 && npm ci && npm run orchestrate -- "..."
import { z } from "zod";
import { extractJson, runAgent } from "./lib/run-agent.js";

const MAX_REVIEW_ROUNDS = 3;

const Outcome = z.object({
  status: z.enum(["approved", "gave_up", "needs_human"]),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  reviewRounds: z.number().int(),
  openQuestions: z.array(z.string()),
});

const LEAD = `You are the lead engineer coordinating subagents. You do not write code yourself.
1. Ask the "planner" agent for a plan. If it returns open questions that block the work, stop with status "needs_human".
2. Give the plan to the "implementer" agent.
3. Ask the "reviewer" agent to review. It returns JSON with a verdict.
4. If the verdict is "changes_requested", send the issues back to the implementer, then review again.
   Stop after ${MAX_REVIEW_ROUNDS} review rounds with status "gave_up".
5. Do not commit or push; a human does that.
Finish with ONLY this JSON: {"status": "approved"|"gave_up"|"needs_human", "summary": "...", "filesChanged": [...], "reviewRounds": n, "openQuestions": [...]}`;

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('usage: npm run orchestrate -- "<task description>"');
  process.exit(1);
}

// The subagents are defined in .claude/agents/*.md and loaded via settingSources: ["project"],
// which also applies .claude/settings.json (permission rules + protect-paths / typecheck hooks).
const run = await runAgent("orchestrator", `Task: ${task}`, {
  model: "sonnet",
  systemPrompt: { type: "preset", preset: "claude_code", append: LEAD },
  settingSources: ["project"],
  allowedTools: ["Agent", "Read", "Grep", "Glob"],
  permissionMode: "acceptEdits",
  maxTurns: 60,
  maxBudgetUsd: 3,
});

if (!run.ok) {
  console.error(`orchestrator stopped: ${run.subtype} after ${run.turns} turns, $${run.costUsd.toFixed(2)}`);
  process.exit(1);
}
const outcome = Outcome.parse(extractJson(run.text));
console.log(JSON.stringify({ ...outcome, costUsd: run.costUsd, turns: run.turns, durationMs: run.durationMs }, null, 2));
process.exit(outcome.status === "approved" ? 0 : 2);
