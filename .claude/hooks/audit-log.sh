#!/usr/bin/env bash
# PostToolUse hook: append every tool call to runs/audit.jsonl (who, when, which tool, what input).
# CI uploads runs/ as an artifact, so every agent action is reviewable after the fact.
set -uo pipefail
mkdir -p "$CLAUDE_PROJECT_DIR/runs"
node -e '
let s=""; process.stdin.on("data", d => s += d).on("end", () => {
  const j = JSON.parse(s);
  const input = JSON.stringify(j.tool_input ?? {});
  const rec = {
    at: new Date().toISOString(),
    session: j.session_id,
    agent: process.env.GITHUB_WORKFLOW ? `ci:${process.env.GITHUB_WORKFLOW}` : "local",
    run: process.env.GITHUB_RUN_ID ?? null,
    tool: j.tool_name,
    input: input.length > 500 ? input.slice(0, 500) + "…" : input,
  };
  require("fs").appendFileSync(process.argv[1], JSON.stringify(rec) + "\n");
});' "$CLAUDE_PROJECT_DIR/runs/audit.jsonl" 2>/dev/null
exit 0
