// Input scan CLI: collects the untrusted text an agent would read on an issue or PR (title, body,
// comments, reviews, inline review comments, plus the triggering comment) and scans it.
//   npx tsx scripts/scan-untrusted.ts issue 12
//   npx tsx scripts/scan-untrusted.ts pr 5 [--fail]
//   npx tsx scripts/scan-untrusted.ts comment     # only the comment in $GITHUB_EVENT_PATH: outputs comment_findings
// Env: EXTRA_TEXT (e.g. the triggering comment body), SCAN_TRUSTED_AUTHORS (comma list; default: this
// repo's own automation). Writes runs/scan-report.md and, in Actions, blocked/secret/findings outputs.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isBlocked, report, scanAll, type Input } from "./lib/scan.js";

const [kind, num, flag] = process.argv.slice(2);
const trusted = (process.env.SCAN_TRUSTED_AUTHORS ?? "claude,github-actions,github-actions[bot]").split(",").map((s) => s.trim());

// Scan only the comment that triggered this run. A new comment with its own findings must not ride on a
// `scan-cleared` given for earlier text (intake.yml removes the clearance when this finds something).
if (kind === "comment") {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { comment?: { body?: string; user?: { login?: string } } };
  const found = scanAll([{ source: "this comment", author: event.comment?.user?.login, text: event.comment?.body ?? "" }], trusted);
  console.log(`comment_findings=${found.length}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `comment_findings=${found.length}\n`);
  process.exit(0);
}
if ((kind !== "issue" && kind !== "pr") || !num) {
  console.error("usage: scan-untrusted.ts issue|pr <number> [--fail]");
  process.exit(2);
}
const gh = (...args: string[]) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));

interface Comment { author?: { login: string }; body: string; url?: string; id?: string }
const fields = kind === "pr" ? "title,body,author,labels,comments,reviews" : "title,body,author,labels,comments";
const item = gh(kind, "view", num, "--json", fields) as {
  title: string; body: string; author: { login: string }; labels: { name: string }[]; comments: Comment[]; reviews?: Comment[];
};

const inputs: Input[] = [
  { source: "title", author: item.author.login, text: item.title },
  { source: "body", author: item.author.login, text: item.body ?? "" },
  ...item.comments.map((c, i) => ({ source: `comment ${i + 1}`, author: c.author?.login, text: c.body })),
  ...(item.reviews ?? []).map((r, i) => ({ source: `review ${i + 1}`, author: r.author?.login, text: r.body })),
];
if (kind === "pr") {
  const repo = process.env.GITHUB_REPOSITORY ?? gh("repo", "view", "--json", "nameWithOwner").nameWithOwner;
  const inline = gh("api", `repos/${repo}/pulls/${num}/comments`, "--paginate") as { user?: { login: string }; body: string }[];
  inputs.push(...inline.map((c, i) => ({ source: `inline review comment ${i + 1}`, author: c.user?.login, text: c.body })));
}
if (process.env.EXTRA_TEXT) inputs.push({ source: "triggering comment", text: process.env.EXTRA_TEXT });

const findings = scanAll(inputs, trusted);
// GitHub label names are case-insensitive, and so is every workflow check of this label.
const cleared = item.labels.some((l) => l.name.toLowerCase() === "scan-cleared");
const blocked = isBlocked(findings, cleared);
const md = report(findings, cleared);

mkdirSync("runs", { recursive: true });
writeFileSync("runs/scan-report.md", md + "\n");
console.log(md);
if (process.env.GITHUB_OUTPUT) {
  const secret = findings.some((f) => f.kind === "secret");
  appendFileSync(process.env.GITHUB_OUTPUT, `blocked=${blocked}\nsecret=${secret}\ncleared=${cleared}\nfindings=${findings.length}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
process.exit(flag === "--fail" && blocked ? 1 : 0);
