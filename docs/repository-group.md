# Using this repo as the base for a repository group

One base repo (this one) holds what every agent-driven repo in a group shares: engineering rules, agent definitions,
risk-tier defaults, the input scan and other gates, and workflow patterns. Member repos consume it read-only, pinned to
a tag, so a change to the base reaches each member only when that member chooses to upgrade.

## What lives where

| In the base (`.agent-base/` in members) | In each member repo |
|---|---|
| `CLAUDE.md` (group rules for Claude), `context/rules.md` | Its own `CLAUDE.md` (stack, commands, repo-specific rules) |
| `.claude/agents/*` (intake, planner, implementer, reviewer, adversary) | Extra agents it needs, never edited copies of base ones |
| `context/risk-tiers.json` defaults, `scripts/` gates incl. `scan-untrusted.ts` | `context/risk-tiers.json` that adds paths (never lowers) |
| Group `context/service-map.md` (one row per repo) and cross-repo `context/lessons.md` | `context/api/*.md`, its own `context/lessons.md` |

## Member repo setup

1. Pin the base locally (same path CI uses):
   ```bash
   git submodule add -b main https://github.com/<owner>/agentic-sdlc-lab .agent-base
   git -C .agent-base checkout v1.0.0
   ```
2. In every workflow that runs an agent or a gate, check the base out next to the code:
   ```yaml
   - uses: actions/checkout@v7
   - uses: actions/checkout@v7
     with:
       repository: ${{ github.repository_owner }}/agentic-sdlc-lab
       ref: v1.0.0          # bump through a PR, never float on main
       path: .agent-base
   - run: npx tsx .agent-base/scripts/scan-untrusted.ts pr ${{ github.event.pull_request.number }} --fail
     env: { GH_TOKEN: "${{ github.token }}" }
   ```
3. Start the member's `CLAUDE.md` with:
   ```markdown
   # <repo>: rules for Claude
   Base rules apply first: read `.agent-base/CLAUDE.md` and `.agent-base/context/`. They are the floor; this file only
   adds detail for this repo and may make rules stricter, never looser. Never edit `.agent-base/`.
   ```
4. Add `.agent-base/**` to the member's protected paths (its `protect-paths.sh` hook) and to its `high` risk tier, so
   bumping the pin gets senior review.
5. Add the repo to the base's `context/service-map.md` with a PR here.
6. Code Group Improvement Layer: copy `.agent-base/context/review-routing.json` to the member's `context/` and set its
   backend, frontend, database and dependency paths (without a copy, the base defaults apply). With a database, set
   `db.explainCommand` to a command that prints query plans for changed queries. Run the base gates against the
   member's code: `npx tsx .agent-base/scripts/review-routing.ts` and `npx tsx .agent-base/scripts/data-loss-gate.ts`.

## Upgrading members
- Patch and minor tags of the base are backwards compatible: bump the pin, run the member's tests and gates, merge.
- Major tags carry an upgrade note below. Read it before bumping.

## Upgrade notes
- v1: initial layout (`context/`, `.claude/agents/`, `scripts/` gates, input scan).
- v1.x (minor, backwards compatible): Code Group Improvement Layer specialist reviews and `context/review-routing.json`.
  New label used by the data-loss gate: `data-loss-approved` (create it in the member repo).
