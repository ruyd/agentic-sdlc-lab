# Service map

| Module | Path | Owner | Risk | Depends on | Used by |
|---|---|---|---|---|---|
| Invoice calculation | `src/invoice.ts` | @ruyd | **high** (money) | – | billing UI, exports |
| Agent tooling | `agents/`, `evals/` | @ruyd | medium | Claude Agent SDK | CI workflows |
| Repo automation | `.github/`, `.claude/` | @ruyd | **high** (guardrails) | GitHub Actions | everything |
| Docs and context | `docs/`, `context/` | @ruyd | low | – | agents, humans |
