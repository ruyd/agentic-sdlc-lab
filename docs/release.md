# Release runbook (human only)

Agents prepare; humans release. Agents cannot run `gh release` (denied) and the `release`
environment needs a human approval.

## 1. Cut the release
1. Make sure `main` is green.
2. Tag it: `git tag v0.X.0 && git push origin v0.X.0`.
3. Approve the `release` environment in the Actions run.
4. Read the draft release notes Claude wrote and publish them.

## 2. Roll out gradually
- **Feature flags** for behaviour changes in money code: ship the new path off by default, turn it on for a
  small set of accounts, compare totals against the old path, then widen.
- **Canary**: deploy to a small share of traffic first; promote only if the monitors below stay clean.

## 3. Monitor
- Error rate and exceptions (`RangeError` spikes mean callers send values the new validation rejects).
- Business invariants: invoice `totalCents` distribution, sum of discounts, count of zero-total invoices.
- Support tickets mentioning totals, tax or discounts.

## 4. Revert quickly
- Flag off first (seconds), then revert the merge if needed: `git revert -m 1 <merge-sha>` and open a PR
  (the ruleset still requires review; use your bypass only in an incident).
- Then label the original issue or a new one `escaped-defect`: the learning loop turns it into a regression
  test, an eval case and a lesson in `context/lessons.md`.
