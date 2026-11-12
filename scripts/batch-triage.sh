#!/usr/bin/env bash
# Local headless workflow: run the intake gate on every open, unlabeled issue with `claude -p`, using the same
# rules as CI. Prints suggestions only; it never edits issues.
#   ./scripts/batch-triage.sh            # all open unlabeled issues
#   ./scripts/batch-triage.sh 12 15      # specific issues
set -euo pipefail
issues=("$@")
if [ ${#issues[@]} -eq 0 ]; then
  while read -r n; do issues+=("$n"); done < <(gh issue list --state open --search "no:label" --json number --jq '.[].number')
fi
for n in "${issues[@]+"${issues[@]}"}"; do
  echo "=== #$n ==="
  claude -p "/intake $n" --output-format text --max-turns 4 --allowedTools "Bash(gh issue view:*)" --model haiku
done
