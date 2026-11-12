#!/usr/bin/env bash
# "Tests that pin down the change": when src/ changes, the PR's new or changed tests must FAIL
# on the base commit and PASS on the PR. Otherwise they don't prove anything about the change.
#   scripts/red-green.sh [base-ref]      # default origin/main
set -euo pipefail
base="${1:-origin/main}"
merge_base="$(git merge-base "$base" HEAD)"
changed_src="$(git diff --name-only "$merge_base" HEAD -- src/)"
changed_tests="$(git diff --name-only --diff-filter=AM "$merge_base" HEAD -- 'test/*.test.ts' | grep -v '^test/adversarial/' || true)"

if [ -z "$changed_src" ]; then echo "No src/ changes: red-green check not needed."; exit 0; fi
if [ -z "$changed_tests" ]; then echo "::error::src/ changed but no tests were added or changed."; exit 1; fi

tmp="$(mktemp -d)"
trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' EXIT
git worktree add --quiet --detach "$tmp" "$merge_base"
ln -s "$PWD/node_modules" "$tmp/node_modules"
for t in $changed_tests; do mkdir -p "$tmp/$(dirname "$t")"; cp "$t" "$tmp/$t"; done

echo "RED: running the PR's tests against base ${merge_base:0:7} (expect failures)"
if (cd "$tmp" && npx vitest run $changed_tests >/dev/null 2>&1); then
  echo "::error::The new tests pass on the base code, so they do not pin down this change."
  exit 1
fi
echo "  failed on base, as expected"

echo "GREEN: running them on the PR"
npx vitest run $changed_tests
echo "Red-green check passed."
