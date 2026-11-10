# agentic-sdlc-lab

Claude agents taking part in every stage of the software lifecycle (plan, build, review, release,
operate) with guardrails, evals and a multi-agent orchestrator. Built only with free GitHub features,
Claude Code and the Claude Agent SDK.

**The product** is deliberately tiny (`src/invoice.ts`, invoice totals) so the interesting part is the
process around it.

## What the agents do and what humans still decide

| Stage | Agent | Human |
|---|---|---|
| Plan | Labels new issues, asks for missing info (`triage.yml`) | Prioritizes on the Projects board |
| Build | `@claude` on an issue opens a PR; local orchestrator plans → implements → reviews | Decides what is OK for an agent |
| Review | First-pass review against `CLAUDE.md` (`claude-review.yml`); evals gate agent changes | Approves and merges |
| Release | Drafts release notes on tag (`release-notes.yml`) | Approves the environment, publishes |
| Operate | Nightly drift check opens at most one issue | Triages it |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams and trust boundaries and
[docs/adr/0001-agent-guardrails.md](docs/adr/0001-agent-guardrails.md) for why.

## Run it locally

```bash
npm install
npm test
npm run typecheck
npm run triage -- "totals broken" "it doesnt work"      # one agent call (haiku)
npm run evals                                             # golden set incl. prompt-injection cases
npm run orchestrate -- "Add a per-line discount field to InvoiceLine"   # multi-agent; use a worktree
npm run report                                            # cost / turns / latency per agent
./scripts/batch-triage.sh                                 # headless `claude -p` over open issues
```

Auth: your local Claude Code login works; CI uses the `CLAUDE_CODE_OAUTH_TOKEN` secret
(from `claude setup-token`) — or swap in `anthropic_api_key` / `ANTHROPIC_API_KEY`.

## Claude Code setup in this repo

- `CLAUDE.md` — project rules and Definition of Done, read by every agent
- `.claude/settings.json` — permission allow/deny rules and hooks
- `.claude/hooks/protect-paths.sh` — blocks agent edits to workflows, settings, hooks, CODEOWNERS
- `.claude/hooks/post-edit-check.sh` — typechecks after each edit so errors go straight back to Claude
- `.claude/agents/` — `planner`, `implementer`, `reviewer` subagents (shared by Claude Code and the SDK)
- `.claude/commands/` — `/triage <n>`, `/release-notes`

## Working loop (how I pair with Claude)

1. Issue with a user story and acceptance criteria (issue form)
2. Plan mode in Claude Code, or the `planner` subagent
3. Failing test first, then implementation
4. `reviewer` subagent locally, then `claude-review.yml` on the PR
5. Human review and squash merge with a Conventional Commit title

## GitHub setup checklist

- [ ] Push as a **public** repo (unlimited Actions minutes, CodeQL, environment reviewers)
- [ ] Add secret `CLAUDE_CODE_OAUTH_TOKEN`; install the Claude GitHub app (`/install-github-app` in Claude Code)
- [ ] Ruleset on `main`: require PR, 1 approval, Code Owner review, status checks `test` and `analyze`; block force pushes
- [ ] Environment `release` with yourself as required reviewer
- [ ] Labels: `bug, enhancement, documentation, question, good first issue, needs-info, security, drift`
- [ ] Projects board with Status, Iteration (1 week) and Size fields
- [ ] Turn on Dependabot alerts, secret scanning and push protection

## Metrics

| Metric | Value |
|---|---|
| Agent PRs merged | – |
| Approved on first human review | – |
| Avg review rounds (orchestrator) | – |
| Eval pass rate | – |
| Single vs multi-agent, same task (time / $) | – |
