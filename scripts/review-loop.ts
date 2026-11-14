// Review-loop limits for CI (logic in scripts/lib/review-loop.ts):
//   npx tsx scripts/review-loop.ts budget <pr>                    # outputs done, next, allowed; posts a note when used up
//   npx tsx scripts/review-loop.ts post <pr> <agent> <file> <n>   # creates or edits the agent's sticky comment
//   npx tsx scripts/review-loop.ts blockers <file>                # fails when the report has blockers or no count
//   npx tsx scripts/review-loop.ts size [base]                    # fails over the size budget unless LARGE_PR=true
// Env: REVIEW_AGAIN=true when a person added `review-again` for this run; GITHUB_REPOSITORY in Actions.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import {
  MAX_CHANGED_LINES, budget, budgetNote, countedLines, findSticky, parseBlockers, stickyBody, type Agent, type Comment,
} from "./lib/review-loop.js";

const [cmd, ...args] = process.argv.slice(2);
const out = (kv: Record<string, string | number | boolean>) => {
  const text = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
};
const gh = (...a: string[]) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const repo = () => process.env.GITHUB_REPOSITORY ?? JSON.parse(gh("repo", "view", "--json", "nameWithOwner")).nameWithOwner;

function comments(pr: string): Comment[] {
  // --slurp joins the pages into one array of pages.
  const pages = JSON.parse(gh("api", `repos/${repo()}/issues/${pr}/comments`, "--paginate", "--slurp")) as
    { id: number; user: { login: string } | null; body: string | null }[][];
  return pages.flat().map((c) => ({ id: c.id, author: c.user?.login ?? "", body: c.body ?? "" }));
}

function upsert(pr: string, agent: Agent, body: string): void {
  const existing = findSticky(comments(pr), agent);
  if (existing) gh("api", "-X", "PATCH", `repos/${repo()}/issues/comments/${existing.id}`, "-f", `body=${body}`);
  else gh("api", "-X", "POST", `repos/${repo()}/issues/${pr}/comments`, "-f", `body=${body}`);
}

function need(n: number, usage: string): void {
  if (args.length < n) { console.error(`usage: review-loop.ts ${usage}`); process.exit(2); }
}

switch (cmd) {
  case "budget": {
    need(1, "budget <pr>");
    const b = budget(comments(args[0]!), process.env.REVIEW_AGAIN === "true");
    out({ done: b.done, next: b.next, allowed: b.allowed });
    if (!b.allowed) upsert(args[0]!, "budget", budgetNote(b.done));
    break;
  }
  case "post": {
    need(4, "post <pr> <review|adversary> <file> <round>");
    const [pr, agent, file, round] = args as [string, Agent, string, string];
    if (agent !== "review" && agent !== "adversary") { console.error(`unknown agent: ${agent}`); process.exit(2); }
    upsert(pr, agent, stickyBody(agent, Number(round), readFileSync(file, "utf8")));
    break;
  }
  case "blockers": {
    need(1, "blockers <file>");
    const n = parseBlockers(readFileSync(args[0]!, "utf8"));
    out({ blockers: n ?? "missing" });
    if (n === null) { console.error("::error::The report has no single `Blockers: N` line."); process.exit(1); }
    if (n > 0) { console.error(`::error::${n} blocker(s) found. Fix them, or explain in the PR why they are not blockers.`); process.exit(1); }
    break;
  }
  case "size": {
    const base = args[0] ?? "origin/main";
    const { counted, files } = countedLines(execFileSync("git", ["diff", "--numstat", `${base}...HEAD`], { encoding: "utf8" }));
    for (const f of files) console.log(`  ${String(f.lines).padStart(5)} ${f.file}`);
    out({ counted, limit: MAX_CHANGED_LINES });
    if (counted > MAX_CHANGED_LINES && process.env.LARGE_PR !== "true") {
      console.error(`::error::${counted} changed lines outside tests and docs (limit ${MAX_CHANGED_LINES}). Split the PR, or a maintainer adds the \`large-pr\` label.`);
      process.exit(1);
    }
    break;
  }
  default:
    console.error("usage: review-loop.ts budget|post|blockers|size ...");
    process.exit(2);
}
