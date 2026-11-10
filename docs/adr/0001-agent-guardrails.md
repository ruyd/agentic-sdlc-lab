# ADR 0001: Guardrails for agents in the lifecycle

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
Agents can open PRs, review code, label issues and draft releases. On a public repo, anyone can write issue
text the agents read, so every agent input from outside the team is a possible prompt injection.

## Decision
1. **Least privilege per job.** Each workflow lists exact `--allowedTools` and GitHub `permissions:`. The triage
   agent has no tools in the SDK version and only label/comment commands in CI.
2. **Humans own merges and releases.** Branch ruleset requires a PR, one approval and passing checks; agents
   never push to `main`. Releases are drafts behind an environment with required reviewers.
3. **Agents cannot change their own guardrails.** A `PreToolUse` hook blocks edits to workflows, Claude
   settings, hooks and CODEOWNERS; CODEOWNERS requires the owner on those paths.
4. **Evals gate agent changes.** Any change to agent prompts or code runs the eval suite, and a failed
   critical (injection or security) case fails CI.
5. **Model routing by job.** Haiku for triage, drift and release notes; Sonnet for implementation and review;
   Opus for the reviewer subagent where judgment matters most.

## Consequences
- Slower than letting agents merge, but every agent change is reviewable and reversible.
- Guardrail changes need a human PR, which is the point.
- Eval cases need upkeep: every new failure mode found in production becomes a case.
