# Shared context

What every agent reads before planning. In a real organization this folder is its own
**central context repo** shared by many services; workflows would fetch it with a second
`actions/checkout` step (`repository: org/agent-context`, `path: context`). It lives here so the
lab is self-contained.

| File | What it holds | Who updates it |
|---|---|---|
| `rules.md` | Engineering rules every change must follow | Humans, via PR |
| `service-map.md` | Modules, owners, what depends on what | Humans, via PR |
| `api/invoice.md` | Public API contract of the invoice module | Humans, via PR |
| `risk-tiers.json` | Which paths are high risk and what that triggers | Humans, via PR |
| `lessons.md` | Lessons from escaped defects (learning loop) | Learning-loop agent proposes, humans merge |
