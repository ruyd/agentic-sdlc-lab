// Dependency security gate (logic in scripts/lib/deps.ts):
//   npx tsx scripts/deps-gate.ts [base]
// 1. Every package.json in the repo pins exact versions (no ^, ~, ranges, tags or URLs).
// 2. Every added or changed version is at least MIN_AGE_DAYS old and not deprecated (npm view), unless a maintainer
//    adds `deps-cooldown-waived` (DEPS_COOLDOWN_WAIVED=true), e.g. for an urgent security fix.
// Writes runs/deps.md for the security review.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MIN_AGE_DAYS, ageDays, changed, parseNpmView, unpinned } from "./lib/deps.js";

const base = process.argv[2] ?? "origin/main";
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" });
const manifests = git("ls-files", "package.json", "**/package.json").split("\n").filter((f) => f && !f.includes("node_modules/"));

const problems: string[] = [];
const rows: string[] = [];
const now = new Date();
for (const file of manifests) {
  const after = JSON.parse(readFileSync(file, "utf8"));
  for (const d of unpinned(after)) problems.push(`\`${file}\`: ${d.section} \`${d.name}\` is \`${d.spec}\`, not an exact version`);
  let before = {};
  try { before = JSON.parse(git("show", `${base}:${file}`)); } catch { /* new manifest */ }
  for (const c of changed(before, after)) {
    let json = "";
    try {
      json = execFileSync("npm", ["view", `${c.name}@${c.to}`, "time", "deprecated", "--json"], { encoding: "utf8" });
    } catch { /* unknown version: age stays null and fails below */ }
    const info = parseNpmView(json, c.to);
    const age = ageDays(info.published, now);
    const notes = [age === null ? "publish date unknown" : age < MIN_AGE_DAYS ? `only ${age} days old` : "", info.deprecated ? `deprecated: ${info.deprecated}` : ""].filter(Boolean);
    rows.push(`| \`${file}\` | \`${c.name}\` | ${c.from ?? "(new)"} | ${c.to} | ${age ?? "?"} | ${notes.join("; ") || "ok"} |`);
    if (notes.length) problems.push(`\`${c.name}@${c.to}\`: ${notes.join("; ")}`);
  }
}

const cooldownOnly = problems.length > 0 && problems.every((p) => !p.includes("not an exact version"));
const waived = cooldownOnly && process.env.DEPS_COOLDOWN_WAIVED === "true";
mkdirSync("runs", { recursive: true });
writeFileSync("runs/deps.md", [
  "## Dependency gate", "",
  rows.length ? ["| Manifest | Package | From | To | Age (days) | Notes |", "|---|---|---|---|---|---|", ...rows].join("\n") : "No dependency changes.",
  "", problems.length ? `### Problems${waived ? " (cooldown waived by a maintainer)" : ""}\n${problems.map((p) => `- ${p}`).join("\n")}` : "All versions pinned.",
].join("\n") + "\n");
console.log(readFileSync("runs/deps.md", "utf8"));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${rows.length}\nproblems=${problems.length}\n`);
if (problems.length && !waived) {
  console.error(`::error::${problems.length} dependency problem(s). Pin exact versions (npm install --save-exact). A version younger than ${MIN_AGE_DAYS} days waits, unless a maintainer adds \`deps-cooldown-waived\` for an urgent fix.`);
  process.exit(1);
}
