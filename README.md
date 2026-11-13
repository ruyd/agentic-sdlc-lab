# AI Agent's Home Base

`agentic-sdlc-lab`: the shared base for agent-driven repositories.

Claude agents taking part in the whole delivery pipeline (intake, plan, fix, review, PR) with
guardrails, a self-improvement layer and metrics. Built only with free GitHub features, Claude Code
and the Claude Agent SDK.

**The product** is deliberately tiny (`src/invoice.ts`, invoice totals in integer cents) so the
interesting part is the process around it. It is money code, so it sits in the **high** risk tier.

## The pipeline

| Stage | What happens | Where | Human |
|---|---|---|---|
| 1. Intake gate | Input scan of title, body and every comment for prompt injection, hidden text and secrets (findings pause all agents). Bugs need repro steps, expected vs actual, version; features need a user story and acceptance criteria. Missing → the agent asks the reporter, never guesses. Ready → `ready` label | `intake.yml`, `.claude/agents/intake.md` | Answers questions |
| 2. Plan | Reads `context/` (rules, service map, API spec, lessons, risk tiers), locates the code, writes a plan with a red test | A line starting with `@claude` on an open `ready` issue, `planner` agent | Can stop it |
| 3. Fix | Failing test first, then the fix; iterates until unit, property and type checks are green on a throwaway runner | `claude.yml`, `implementer` agent | – |
| 4. Review | Deterministic gates (risk tier, red-green, honest PR body, `npm audit`), reviewer agent (diff vs plan, rules, security), adversarial agent (tries to break it), mutation testing for high risk | `claude-review.yml`, `reviewer` + `adversary` agents, CodeQL | – |
| 5. PR | Opened with plan, evidence, what was and wasn't tested, assumptions; assigned to a human | `gh pr create --assignee` | Approves, merges |
| Release | Draft release notes behind an environment approval | `release-notes.yml` | Publishes, monitors, reverts |
| Learn | `escaped-defect` label → regression test + eval case + lesson, as a PR | `learning-loop.yml` | Merges, applies proposed agent changes |
| Measure | Merge rate, rework, escaped defects, reverts, risk mix | `metrics.yml`, `npm run metrics` | Decides what to improve |

Using this repo as the base for a group of repositories: [docs/repository-group.md](docs/repository-group.md).

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/release.md](docs/release.md),
[docs/adr/0001-agent-guardrails.md](docs/adr/0001-agent-guardrails.md).

## Self-improvement layer

1. **Tests that pin down the change:** `scripts/red-green.sh` fails the PR if its new tests also pass on the base commit.
2. **Adversarial reviewer:** a separate agent with fresh context writes edge-case tests (nulls, boundaries, NaN, rounding, locales), compares the fix to the ticket's intent and flags out-of-scope changes.
3. **Stronger checks:** property tests with fast-check (`test/invoice.property.test.ts`) and mutation testing with Stryker (break threshold 80%; currently 100%).
4. **Risk tiers:** `context/risk-tiers.json` marks money, auth, data deletion and guardrail paths as high risk: senior Code Owner approval, adversarial review and mutation testing are required.
5. **Honest PR:** `scripts/check-pr-body.ts` fails the PR unless it states what was tested, what wasn't, assumptions, risk tier and evidence.
6. **After merge:** release stays human, behind feature flags or a canary, with a one-command revert ([docs/release.md](docs/release.md)).
7. **Learning loop:** every escaped defect becomes a regression test, an eval case if an agent missed it, and a row in `context/lessons.md` that every planner reads.

## Run it locally

```bash
npm install
npm test                    # unit + property tests
npm run mutation            # Stryker mutation score
npm run risk-tier           # risk tier of your diff
npm run red-green           # do your new tests fail on main?
npm run scan -- issue 12    # input scan of an issue or PR (injection, hidden text, secrets)
npm run evals               # agent evals incl. prompt-injection cases (calls Claude)
npm run metrics             # merge rate, rework, escaped defects
npm run orchestrate -- "Bug: computeTotals ... Steps: ... Expected: ... Actual: ..."   # full pipeline; use a worktree
./scripts/batch-triage.sh   # headless `claude -p` intake over open issues
```

In Claude Code: `/intake <issue>` checks a ticket, `/fix <issue>` runs the whole pipeline locally,
`/release-notes` drafts notes. Copy `.claude/settings.local.example.json` to `.claude/settings.local.json`
to sandbox Bash locally.

Auth: your local Claude Code login works; CI uses the `CLAUDE_CODE_OAUTH_TOKEN` secret.

## Guardrails

- **Least privilege:** every workflow lists its exact `--allowedTools` and GitHub `permissions:`; the intake agent can only read, label and comment.
- **Sandboxed:** CI agents run on throwaway GitHub runners; locally, run in a git worktree with the Claude Code sandbox on.
- **Agents never merge or release:** denied in `.claude/settings.json`, not in any allow list, and blocked by the `main` ruleset.
- **Agents cannot change their guardrails:** a hook blocks edits to workflows, settings, hooks, agent prompts, CODEOWNERS, `context/rules.md` and `context/risk-tiers.json`.
- **Audit log:** a hook appends every tool call to `runs/audit.jsonl`; CI uploads it as an artifact.
- **Untrusted input scan:** before any agent reads an issue or PR, `scripts/scan-untrusted.ts` checks titles, bodies, comments and reviews for prompt injection (including hidden HTML comments, base64, Unicode tag and zero-width tricks), exfiltration attempts and pasted secrets. Findings pause the agents and fail the PR `gates` check. Fixing the text, or a maintainer's `scan-cleared` label (never for secrets), resumes them, and intake then checks readiness again, so nobody adds `ready` by hand.
- **Escalation:** every agent reports a confidence; low confidence or a rules conflict stops the pipeline and asks a human.

## GitHub setup checklist

- [x] Public repo, `CLAUDE_CODE_OAUTH_TOKEN` secret, Claude GitHub App
- [x] Ruleset on `main`: PR, 1 approval, Code Owner review, required checks `test`, `analyze` and `gates`
- [x] `release` environment with a required reviewer
- [x] Labels: `ready`, `needs-info`, `risk:high`, `risk:medium`, `risk:low`, `escaped-defect`, `no-red-test`, `prompt-injection`, `scan-cleared`
- [ ] Turn on private vulnerability reporting (Settings → Security), which `SECURITY.md` and the scan report point to

## Metrics

Run `npm run metrics` or the **Measure · Pipeline metrics** workflow. Last 30 days at the time of writing:
3 agent PRs, merge rate 100% (2/2), rework 67% (2/3), 0 escaped defects, 0 reverts.
