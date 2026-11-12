# Engineering rules

1. **Money is integer cents.** Never use floating-point amounts outside a single, rounded calculation step.
2. **Rounding:** `Math.round` (half away from zero for positives) once per calculated amount. State the rounding point in a comment.
3. **Validate at the boundary:** reject non-finite numbers, negative quantities and out-of-range percentages with `RangeError`.
4. **No breaking API changes** to anything in `api/` without a deprecation note and a human decision.
5. **Test first:** a bug fix starts with a test that fails on the current code.
6. **Scope:** change only what the ticket needs. Refactors go in their own PR.
7. **No new dependencies** without a reason in the PR.
8. **Agents never merge, release, or change workflows, settings, hooks or CODEOWNERS.**
