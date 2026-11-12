// Local pipeline orchestrator: intake → plan → fix → review + adversary → honest PR draft.
// Subagents come from .claude/agents/*.md (same definitions CI uses); settingSources: ["project"]
// also applies the permission rules and hooks (protected paths, typecheck, audit log).
//
//   npm run orchestrate -- "<ticket text>"
//
// Run it in a git worktree so it never touches your main checkout:
//   git worktree add ../lab-task-1 -b agent/task-1 && cd ../lab-task-1 && npm ci && npm run orchestrate -- "..."
import { z } from "zod";
import { extractJson, runAgent } from "./lib/run-agent.js";

const MAX_REVIEW_ROUNDS = 3;

const Outcome = z.object({
  status: z.enum(["pr_ready", "needs_info", "escalated", "gave_up"]),
  stoppedAt: z.enum(["intake", "plan", "fix", "review", "pr"]),
  summary: z.string(),
  riskTier: z.enum(["high", "medium", "low"]).optional(),
  filesChanged: z.array(z.string()),
  reviewRounds: z.number().int(),
  adversaryBrokeIt: z.boolean().optional(),
  questions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

const LEAD = `You are the lead engineer running the delivery pipeline. You do not write code yourself.
Stop at the first gate that fails, and escalate whenever any agent reports low confidence.

1. INTAKE: give the ticket to the "intake" agent. Not ready: status "needs_info" with its question; stop.
2. PLAN: ask the "planner" agent for a plan. Low confidence or open questions: status "escalated"; stop.
3. FIX: give the plan to the "implementer" agent. It must show a red test failing before the fix.
   No red test, or still failing after its iterations: status "gave_up"; stop.
4. REVIEW: run the "reviewer" and "adversary" agents (the adversary gets only the ticket and the diff, not the plan's reasoning).
   Send every blocker, failing adversarial case and plan mismatch back to the implementer, then review again.
   Reviewer "escalate": status "escalated". Still failing after ${MAX_REVIEW_ROUNDS} rounds: status "gave_up".
5. PR: write pr-body.md following .github/pull_request_template.md, filling every section honestly from the agents'
   outputs: plan, risk tier, what was tested, what was NOT tested, assumptions, evidence (red test output, results).
   Status "pr_ready". Do not commit, push, open the PR, merge or release: a human does that.

Finish with ONLY this JSON:
{"status": "pr_ready"|"needs_info"|"escalated"|"gave_up", "stoppedAt": "intake"|"plan"|"fix"|"review"|"pr", "summary": "...", "riskTier": "high"|"medium"|"low", "filesChanged": [...], "reviewRounds": n, "adversaryBrokeIt": boolean, "questions": [...], "confidence": "high"|"medium"|"low"}`;

const ticket = process.argv.slice(2).join(" ").trim();
if (!ticket) {
  console.error('usage: npm run orchestrate -- "<ticket text>"');
  process.exit(1);
}

const run = await runAgent("orchestrator", `Ticket:\n${ticket}`, {
  model: "sonnet",
  systemPrompt: { type: "preset", preset: "claude_code", append: LEAD },
  settingSources: ["project"],
  allowedTools: ["Agent", "Read", "Grep", "Glob", "Write(pr-body.md)"],
  permissionMode: "acceptEdits",
  maxTurns: 80,
  maxBudgetUsd: 5,
});

if (!run.ok) {
  console.error(`orchestrator stopped: ${run.subtype} after ${run.turns} turns, $${run.costUsd.toFixed(2)}`);
  process.exit(1);
}
const outcome = Outcome.parse(extractJson(run.text));
console.log(JSON.stringify({ ...outcome, costUsd: run.costUsd, turns: run.turns, durationMs: run.durationMs }, null, 2));
if (outcome.status === "pr_ready") {
  console.log("\nNext: review the diff and pr-body.md, then commit, push and run gh pr create --body-file pr-body.md --assignee @me");
}
process.exit(outcome.status === "pr_ready" ? 0 : 2);
