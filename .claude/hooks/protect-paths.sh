#!/usr/bin/env bash
# PreToolUse hook: blocks agent edits to protected paths.
# Exit code 2 blocks the tool call and sends stderr back to Claude.
set -euo pipefail
input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path ?? "")})')"
rel="${file#"$CLAUDE_PROJECT_DIR"/}"
case "$rel" in
  .github/workflows/*|.claude/settings.json|.claude/hooks/*|.claude/agents/*|.github/CODEOWNERS|context/rules.md|context/risk-tiers.json|scripts/lib/scan.ts|scripts/scan-untrusted.ts|scripts/lib/review-loop.ts|scripts/review-loop.ts|scripts/lib/data-loss.ts|scripts/data-loss-gate.ts|scripts/lib/review-routing.ts|scripts/review-routing.ts|context/review-routing.json|scripts/lib/deps.ts|scripts/deps-gate.ts|.npmrc|.env|.env.*)
    echo "Blocked: $rel is protected. Changes to it must come from a human PR (see CLAUDE.md)." >&2
    exit 2 ;;
esac
exit 0
