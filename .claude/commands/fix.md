---
description: Run the full agent pipeline on an issue locally (intake → plan → fix → review → adversary → PR draft)
argument-hint: <issue number>
---
Run the pipeline for issue $ARGUMENTS, stopping at the first gate that fails:

1. **Intake:** `intake` agent. Not ready → show the question for the reporter and stop.
2. **Plan:** `planner` agent. Low confidence or conflicts → show questions and stop.
3. **Fix:** `implementer` agent with the plan.
4. **Review:** `reviewer` and `adversary` agents in parallel. Send findings back to the implementer; at most 3 rounds.
   `escalate` or low confidence anywhere → stop and summarize for a human.
5. **PR draft:** write `pr-body.md` following `.github/pull_request_template.md`, filling in the evidence
   (red test output, results, risk tier, adversarial findings, what was not tested, assumptions).

Never commit, push, merge or release. A human does that.
