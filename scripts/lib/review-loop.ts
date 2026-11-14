// Limits on the agent review loop, so no session (local or CI, with or without context) can loop forever:
//   - a round budget: agents review a PR at most MAX_ROUNDS times unless a maintainer adds `review-again`;
//   - one sticky comment per agent, edited in place each round (edits send no notifications);
//   - severity: only blockers fail the adversary check;
//   - a size budget on non-test, non-doc changes.
// Pure functions only; scripts/review-loop.ts does the GitHub I/O.

export const MAX_ROUNDS = 2;
export const MAX_CHANGED_LINES = 300;
export type Agent = "review" | "adversary" | "budget";

const MARKER = /<!--\s*agent-review:([a-z]+)\s+round:(\d+)\s*-->/;

export function marker(agent: Agent, round: number): string {
  return `<!-- agent-review:${agent} round:${round} -->`;
}

/** The agent and round a sticky comment was written for, or null if it is not one. */
export function parseMarker(body: string): { agent: string; round: number } | null {
  const m = MARKER.exec(body);
  return m ? { agent: m[1]!, round: Number(m[2]) } : null;
}

export interface Comment { id: number; author: string; body: string }

/** Only comments this repo's automation posted count; anyone can type a marker into a comment. */
export const TRUSTED_POSTER = "github-actions[bot]";

/** The sticky comment for an agent, if the workflow already posted one. */
export function findSticky(comments: Comment[], agent: Agent): Comment | undefined {
  return comments.filter((c) => c.author === TRUSTED_POSTER && parseMarker(c.body)?.agent === agent).at(-1);
}

/** Rounds of agent review already run on the PR: the highest round in a trusted review or adversary comment. */
export function roundsDone(comments: Comment[]): number {
  return Math.max(0, ...(["review", "adversary"] as const).map((a) => {
    const c = findSticky(comments, a);
    return c ? parseMarker(c.body)!.round : 0;
  }));
}

/** Whether agents may run another round. `reviewAgain`: a person added the `review-again` label for this run. */
export function budget(comments: Comment[], reviewAgain: boolean): { done: number; next: number; allowed: boolean } {
  const done = roundsDone(comments);
  return { done, next: done + 1, allowed: done < MAX_ROUNDS || reviewAgain };
}

/** The comment body the workflow posts for an agent's round. */
export function stickyBody(agent: Agent, round: number, report: string): string {
  const title = agent === "review" ? "Review" : agent === "adversary" ? "Adversarial review" : "Agent review budget";
  const extra = round > MAX_ROUNDS ? ` (extra round, \`review-again\`)` : "";
  return `${marker(agent, round)}\n**${title}: round ${round} of ${MAX_ROUNDS}${extra}.** This comment is updated in place each round; its edit history keeps earlier rounds.\n\n${report.trim()}\n`;
}

export function budgetNote(done: number): string {
  return stickyBody("budget", done, [
    `The agents have reviewed this PR ${done} times, the limit. They will not run again on new pushes.`,
    "",
    "- Fix any **blocker** still open. Turn each follow-up or nit into an issue instead of another round.",
    "- If the PR keeps changing a lot between rounds, consider splitting it.",
    "- A maintainer can add the `review-again` label for one more round.",
  ].join("\n"));
}

/**
 * The blocker count an agent report ends with: a line `Blockers: N`. Returns null when the line is missing or
 * appears more than once, so a malformed report fails the check instead of passing silently.
 */
export function parseBlockers(report: string): number | null {
  const lines = report.split(/\r?\n/).filter((l) => /^\s*\**\s*blockers\s*\**\s*:/i.test(l));
  if (lines.length !== 1) return null;
  const m = /^\s*\**\s*blockers\s*\**\s*:\s*\**\s*(\d+)\s*\**\s*$/i.exec(lines[0]!);
  return m ? Number(m[1]) : null;
}

/** Files that do not count toward the size budget: tests, docs and the lockfile. */
export function exempt(file: string): boolean {
  return /^test\//.test(file) || /^docs\//.test(file) || /\.md$/i.test(file) || file === "package-lock.json";
}

/** Changed lines (added + deleted) that count toward the size budget, from `git diff --numstat` output. */
export function countedLines(numstat: string): { counted: number; files: { file: string; lines: number }[] } {
  const files = numstat.split("\n").filter(Boolean).map((l) => {
    const [a, d, ...rest] = l.split("\t");
    const file = rest.join("\t");
    // Binary files show "-" for both counts: each counts as 1, so a binary file costs 2 lines instead of 0.
    const n = (x: string | undefined) => (x === "-" || x === undefined ? 1 : Number(x) || 0);
    return { file, lines: n(a) + n(d) };
  }).filter((f) => !exempt(f.file));
  return { counted: files.reduce((s, f) => s + f.lines, 0), files };
}
