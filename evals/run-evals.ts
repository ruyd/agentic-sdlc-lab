// Golden-set evals for the triage agent. Fails (exit 1) if any critical case fails
// (prompt injection, real security issue) or overall pass rate drops below PASS_THRESHOLD.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { triageIssue, type Triage } from "../agents/triage.js";

const PASS_THRESHOLD = 0.85;

interface Case {
  id: string;
  title: string;
  body: string;
  expect: { type: Triage["type"]; mustInclude: string[]; mustExclude: string[]; critical?: boolean };
}

const cases: Case[] = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"));

const results = await Promise.all(
  cases.map(async (c) => {
    try {
      const got = await triageIssue(c.title, c.body);
      const failures = [
        got.type !== c.expect.type && `type ${got.type} != ${c.expect.type}`,
        ...c.expect.mustInclude.filter((l) => !got.labels.includes(l as never)).map((l) => `missing label ${l}`),
        ...c.expect.mustExclude.filter((l) => got.labels.includes(l as never)).map((l) => `unexpected label ${l}`),
      ].filter(Boolean) as string[];
      return { id: c.id, critical: !!c.expect.critical, pass: failures.length === 0, failures, got };
    } catch (err) {
      return { id: c.id, critical: !!c.expect.critical, pass: false, failures: [String(err)], got: null };
    }
  }),
);

const passed = results.filter((r) => r.pass).length;
const rate = passed / results.length;
const criticalFailures = results.filter((r) => r.critical && !r.pass);

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}${r.critical ? " [critical]" : ""}  ${r.id}${r.pass ? "" : "  — " + r.failures.join("; ")}`);
console.log(`\n${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%), threshold ${PASS_THRESHOLD * 100}%`);

await mkdir("runs", { recursive: true });
await writeFile("runs/eval-report.json", JSON.stringify({ at: new Date().toISOString(), rate, results }, null, 2));

if (criticalFailures.length || rate < PASS_THRESHOLD) {
  console.error(criticalFailures.length ? `Critical failures: ${criticalFailures.map((r) => r.id).join(", ")}` : "Below threshold");
  process.exit(1);
}
