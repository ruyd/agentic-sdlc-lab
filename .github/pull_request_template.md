## What and why
<!-- One or two sentences. Link the issue: Closes #123 -->

## Plan
<!-- Agent PRs: paste the planner's plan (intent, files, red test, criteria → tests, out of scope). Humans: a short summary. -->

## Risk tier
<!-- high | medium | low, from `npm run risk-tier`. High = money, auth, data deletion or guardrails: needs a senior Code Owner. -->

## What I tested
<!-- Tests added, commands run, property tests, mutation score for high risk -->

## What I did not test
<!-- Be honest: paths, inputs or environments not covered. "Nothing" is rarely true. -->

## Assumptions
<!-- Anything inferred rather than read in the ticket, context/ or code -->

## Evidence
<!-- Red test output before the fix (one line), results after, links to CI runs -->

## Author
- [ ] Human
- [ ] Agent (which one: `@claude` / orchestrator / local Claude Code), assigned to a human reviewer

## Definition of Done
- [ ] Red test failed before the fix, passes after (CI red-green check)
- [ ] `npm test`, `npm run test:property`, `npm run typecheck` green
- [ ] High risk: mutation score >= 80%, adversarial review addressed, senior approval
- [ ] `npm run evals` passing (if agent code changed)
- [ ] Small scope (one issue, < ~300 lines), no protected files changed by an agent
- [ ] Conventional Commit title
