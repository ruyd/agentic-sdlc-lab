# Security policy

**Do not open a public issue for a vulnerability.** Use **Security → Report a vulnerability** on this repository
(GitHub private vulnerability reporting). Include the affected file or workflow, steps to reproduce and the impact.

If you pasted a token, key or password anywhere public (issue, PR, comment), treat it as leaked: revoke and rotate it
first, then delete the text. Editing does not remove it from history or notification emails.

## How untrusted input is handled
Issues, PRs and comments are read by AI agents. Before any agent sees them, a deterministic scan
(`scripts/scan-untrusted.ts`) checks for prompt injection, hidden instructions and secrets, and pauses the agents if it
finds any (see `docs/ARCHITECTURE.md`, Trust boundaries). Reports of ways around the scan or the agent guardrails are
in scope and welcome through the private channel above.
