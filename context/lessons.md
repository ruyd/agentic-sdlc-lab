# Lessons from escaped defects

Each entry comes from an issue labeled `escaped-defect`: what slipped through, why, and what now
catches it (eval case, test, reviewer rule or context change). Agents read this before planning.

| Date | Defect | Why it escaped | Now caught by |
|---|---|---|---|
| 2026-11-11 | `/release-notes` command missing from repo | unanchored `.gitignore` rule matched it | `scripts/drift-facts.ts` slash-command check (#7) |
