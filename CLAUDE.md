# agentic-sdlc-lab — rules for Claude

A small TypeScript project used to practice agents across the software lifecycle.
These rules apply to Claude Code locally, to the Agent SDK orchestrator, and to Claude in GitHub Actions.

## Commands
- `npm test` — unit tests (vitest)
- `npm run typecheck` — TypeScript, no emit
- `npm run evals` — agent eval suite (calls Claude, costs tokens)
- `npm run orchestrate -- "<task>"` — multi-agent planner → implementer → reviewer run

## Working agreement
- Test first: add or change a failing test in `test/` before changing `src/`.
- Keep PRs small: one issue, one PR, under ~300 changed lines.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Agent-authored commits end with a `Co-Authored-By:` trailer naming the agent.
- Never edit `.github/workflows/`, `.claude/settings.json`, `.claude/hooks/` or `CODEOWNERS`; those change only through a human PR.
- Never read or print `.env` files or secrets.
- Prefer clarity over cleverness; no new dependencies without saying why in the PR.

## Definition of Done
- Tests added and passing, typecheck clean
- Evals pass when agent code changed
- PR template filled in, linked to an issue
- One human approval
