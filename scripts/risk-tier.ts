// Prints the risk tier of a diff using context/risk-tiers.json (first matching tier wins).
//   npx tsx scripts/risk-tier.ts [base-ref]     # default base: origin/main
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { globToRegExp } from "./lib/glob.js";

interface Tier { name: string; reason: string; paths: string[]; requires: string[] }
const { tiers }: { tiers: Tier[] } = JSON.parse(readFileSync("context/risk-tiers.json", "utf8"));


export function tierFor(file: string): Tier {
  return tiers.find((t) => t.paths.some((p) => globToRegExp(p).test(file))) ?? tiers[tiers.length - 1]!;
}

const base = process.argv[2] ?? "origin/main";
const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
const order = tiers.map((t) => t.name);
const perFile = files.map((f) => ({ file: f, tier: tierFor(f) }));
const top = perFile.reduce<Tier | undefined>((acc, x) => (!acc || order.indexOf(x.tier.name) < order.indexOf(acc.name) ? x.tier : acc), undefined) ?? tiers[tiers.length - 1]!;

console.log(`Risk tier: ${top.name} (${top.reason})`);
console.log(`Requires: ${top.requires.join("; ")}`);
for (const { file, tier } of perFile) console.log(`  ${tier.name.padEnd(6)} ${file}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tier=${top.name}\n`);
