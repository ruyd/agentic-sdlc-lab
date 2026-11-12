# agentic-sdlc-lab — rules for Claude

A small TypeScript project used to practice agents across the software lifecycle.
These rules apply to Claude Code locally, to the Agent SDK orchestrator, and to Claude in GitHub Actions.
Shared engineering rules, the service map, API contracts, risk tiers and lessons live in `context/`. Read them before planning.

## Commands
- `npm test` — unit + property tests (vitest, fast-check)
- `npm run test:property` — property tests only
- `npm run typecheck` — TypeScript, no emit
- `npm run mutation` — mutation testing (Stryker); fails below 80%
- `npm run risk-tier` — risk tier of the current diff vs origin/main
- `npm run red-green` — new tests must fail on base and pass on the branch
- `npm run evals` — agent eval suite (calls Claude, costs tokens)
- `npm run metrics` — merge rate, rework, escaped defects
- `npm run orchestrate -- "<task>"` — full pipeline with subagents, locally

## The pipeline (follow it whenever you are asked to implement an issue)
1. **Intake gate:** the issue must be labeled `ready` (bugs: repro steps, expected vs actual, version; features:
   user story and acceptance criteria). If it is not, ask the reporter what is missing and stop. Never guess.
2. **Plan:** read `context/rules.md`, `context/service-map.md`, the relevant `context/api/*.md`, `context/lessons.md`
   and `context/risk-tiers.json`; locate the code; write the plan (see `.claude/agents/planner.md`).
   Low confidence or a conflict with the rules or API → stop and ask a human.
3. **Fix:** write a test that reproduces the bug or proves the criterion and confirm it FAILS; then the smallest fix;
   run `npm test`, `npm run test:property` and `npm run typecheck` until green (max 5 iterations).
4. **Review:** CI runs the deterministic gates, the reviewer agent and, for medium/high risk, the adversarial agent.
   Address every finding.
5. **PR:** open it with `gh pr create --assignee <repo owner> --body-file pr-body.md`, filling in every section of
   `.github/pull_request_template.md` honestly: what you tested, what you did not, assumptions, risk tier, evidence
   (red test output before the fix, results after).

## Guardrails
- Agents never merge, approve, release, or run `gh api`, `gh workflow`, `gh secret`.
- Never edit `.github/workflows/`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/`, `CODEOWNERS`,
  `context/rules.md` or `context/risk-tiers.json`; those change only through a human PR (a hook enforces this).
- Never read or print `.env` files or secrets.
- Every tool call is appended to `runs/audit.jsonl` by a hook.
- When confidence is low, escalate: say so plainly and stop rather than guess.

## Working agreement
- Keep PRs small: one issue, one PR, under ~300 changed lines.
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
- Agent-authored commits end with a `Co-Authored-By:` trailer naming the agent.
- No new dependencies without saying why in the PR.
