// Pipeline metrics from GitHub: agent PR merge rate, rework, escaped defects, risk mix.
//   GH_REPO=owner/repo npx tsx scripts/metrics.ts [days=30]
import { execFileSync } from "node:child_process";

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86_400_000);
const gh = <T>(args: string[]): T => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 50_000_000 }));

interface Pr {
  number: number; title: string; state: "OPEN" | "CLOSED" | "MERGED"; createdAt: string; headRefName: string;
  author: { login: string }; labels: { name: string }[]; commits: { messageHeadline: string; authors: { login: string }[] }[];
}
// gh fetches up to 100 commits x 100 authors per PR; 40 PRs keeps the GraphQL query under its node limit.
const prs = gh<Pr[]>(["pr", "list", "--state", "all", "--limit", "40", "--json", "number,title,state,createdAt,headRefName,author,labels,commits"])
  .filter((p) => new Date(p.createdAt) >= since && p.author.login !== "app/dependabot");

const agentCommit = (c: Pr["commits"][number]) => c.authors.some((a) => /\[bot\]$|^claude$|github-actions/.test(a.login));
const isAgentPr = (p: Pr) => p.headRefName.startsWith("claude/") || p.headRefName.startsWith("learn/") || p.commits.some(agentCommit);
const agentPrs = prs.filter(isAgentPr);
const closed = agentPrs.filter((p) => p.state !== "OPEN");
const merged = agentPrs.filter((p) => p.state === "MERGED");
// Rework: an agent PR that needed more than one agent commit (follow-ups after review) or a human fix on top.
const reworked = agentPrs.filter((p) => p.commits.filter(agentCommit).length > 1 || p.commits.some((c) => !agentCommit(c) && !/^Merge /.test(c.messageHeadline)));

const escaped = gh<{ number: number; title: string; createdAt: string }[]>(["issue", "list", "--state", "all", "--label", "escaped-defect", "--limit", "200", "--json", "number,title,createdAt"])
  .filter((i) => new Date(i.createdAt) >= since);
const reverts = execFileSync("git", ["log", `--since=${since.toISOString()}`, "--oneline", "--grep=^Revert"], { encoding: "utf8" }).split("\n").filter(Boolean);

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const riskOf = (p: Pr) => p.labels.find((l) => l.name.startsWith("risk:"))?.name.slice(5) ?? "untiered";
const riskMix = Object.entries(agentPrs.reduce<Record<string, number>>((m, p) => ((m[riskOf(p)] = (m[riskOf(p)] ?? 0) + 1), m), {}));

console.log(`## Pipeline metrics, last ${days} days\n`);
console.log("| Metric | Value |\n|---|---|");
console.log(`| Agent PRs opened | ${agentPrs.length} |`);
console.log(`| Merge rate (merged / closed) | ${pct(merged.length, closed.length)} (${merged.length}/${closed.length}) |`);
console.log(`| Rework rate (PRs needing follow-up commits) | ${pct(reworked.length, agentPrs.length)} (${reworked.length}/${agentPrs.length}) |`);
console.log(`| Escaped defects | ${escaped.length} |`);
console.log(`| Reverts on main | ${reverts.length} |`);
console.log(`| Risk mix | ${riskMix.map(([k, v]) => `${k}: ${v}`).join(", ") || "–"} |`);
if (escaped.length) console.log(`\n**Escaped defects:** ${escaped.map((i) => `#${i.number} ${i.title}`).join("; ")}`);
console.log("\nUse these to improve the shared context: every escaped defect → `escaped-defect` label → learning-loop PR.");
