// Rules the drift check uses to decide what a doc reference means (scripts/drift-facts.ts).

/** Member repos check this repo out at `.agent-base/`, so `.agent-base/x` in the docs means `x` here. */
export const BASE_CHECKOUT = ".agent-base/";

/** The path in this repo that a doc reference points to: `.agent-base/x` becomes `x`, and `.agent-base/` the root. */
export function resolveRef(ref: string): string {
  return ref.startsWith(BASE_CHECKOUT) ? ref.slice(BASE_CHECKOUT.length) : ref;
}

/**
 * Whether `/name` in this doc can be a Claude Code slash command. Templates under docs/templates/ are filled in by
 * member repos and describe their apps, so `/login` there is a URL path, not a command.
 */
export function mayMentionSlashCommands(doc: string): boolean {
  return !doc.startsWith("docs/templates/");
}
