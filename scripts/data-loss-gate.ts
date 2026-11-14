// Migration / change data-loss gate (logic in scripts/lib/data-loss.ts):
//   npx tsx scripts/data-loss-gate.ts [base]
// Scans lines added to database files (review-routing.json db.paths). Any destructive statement fails the gate
// unless DATA_LOSS_APPROVED=true (a maintainer's `data-loss-approved` label). Writes runs/data-loss.md for the DBA.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { addedLinesByFile, findDataLoss } from "./lib/data-loss.js";
import { matchesAny } from "./lib/glob.js";
import { validateConfig } from "./lib/review-routing.js";

const base = process.argv[2] ?? "origin/main";
const configPath = [process.env.REVIEW_ROUTING, "context/review-routing.json", ".agent-base/context/review-routing.json"]
  .find((p): p is string => !!p && existsSync(p));
if (!configPath) { console.error("::error::No review-routing.json found."); process.exit(1); }
const cfg = validateConfig(JSON.parse(readFileSync(configPath, "utf8")));

const diff = execFileSync("git", ["diff", "--unified=0", "--no-color", `${base}...HEAD`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const findings = [...addedLinesByFile(diff)]
  .filter(([file]) => matchesAny(file, cfg.db.paths))
  .flatMap(([file, lines]) => findDataLoss(file, lines));

mkdirSync("runs", { recursive: true });
writeFileSync("runs/data-loss.md", findings.length
  ? ["## Data-loss gate", "", "| File | Rule | Added line |", "|---|---|---|",
     ...findings.map((f) => `| \`${f.file}\` | \`${f.rule}\` | \`${f.line.replace(/[|`]/g, " ")}\` |`)].join("\n") + "\n"
  : "## Data-loss gate\n\nNo destructive statements in added database lines.\n");
console.log(readFileSync("runs/data-loss.md", "utf8"));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `findings=${findings.length}\n`);
if (findings.length && process.env.DATA_LOSS_APPROVED !== "true") {
  console.error(`::error::${findings.length} destructive database change(s). Make the migration non-destructive (expand/contract, backfill, keep the old column), or a maintainer reviews it and adds \`data-loss-approved\`.`);
  process.exit(1);
}
