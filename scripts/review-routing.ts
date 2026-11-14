// Which specialist reviews this diff gets (logic in scripts/lib/review-routing.ts):
//   npx tsx scripts/review-routing.ts [base]     # default base: origin/main
// Outputs reviews=<JSON list>, db=true|false; writes runs/routing.md for the agents. Config: $REVIEW_ROUTING, else
// context/review-routing.json, else the base's (.agent-base/). Only reviews with an agent file are listed.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { route, usertestBlocker, validateConfig } from "./lib/review-routing.js";

const base = process.argv[2] ?? "origin/main";
const configPath = [process.env.REVIEW_ROUTING, "context/review-routing.json", ".agent-base/context/review-routing.json"]
  .find((p): p is string => !!p && existsSync(p));
if (!configPath) { console.error("::error::No review-routing.json found."); process.exit(1); }
const cfg = validateConfig(JSON.parse(readFileSync(configPath, "utf8")));

const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
const r = route(files, cfg);
const hasAgent = (name: string) => [".claude/agents", ".agent-base/.claude/agents"].some((d) => existsSync(`${d}/${name}.md`));
const skipUsertest = r.reviews.includes("usertest") ? usertestBlocker(cfg, existsSync(cfg.frontendApp.testingScript)) : null;
const reviews = r.reviews.filter(hasAgent).filter((x) => !(x === "usertest" && skipUsertest));

const section = (title: string, list: string[]) => `### ${title}\n${list.length ? list.map((f) => `- \`${f}\``).join("\n") : "- none"}\n`;
mkdirSync("runs", { recursive: true });
writeFileSync("runs/routing.md", [
  `## Specialist routing (config: \`${configPath}\`)`, "",
  `Reviews: ${reviews.length ? reviews.join(", ") : "none"}`, "",
  ...(skipUsertest ? [`Synthetic user test skipped: ${skipUsertest}.`, ""] : []),
  section("Backend", r.backend), section("Database", r.db), section("Dependencies", r.dependencies), section("Frontend", r.frontend),
].join("\n"));
const out = `reviews=${JSON.stringify(reviews)}\ndb=${r.db.length > 0}\nconfig=${configPath}\n` +
  `app_start=${cfg.frontendApp.start ? "yes" : "no"}\napp_url=${cfg.frontendApp.url}\ntesting_script=${cfg.frontendApp.testingScript}\n`;
process.stdout.write(out);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
