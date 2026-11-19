import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// On PRs from authors without write access (Dependabot), claude-code-action denies commands that run code from the
// checkout, so a review agent told to run them only collects denials (PR #35: npm audit, npm view, npm test,
// npx tsx scripts/risk-tier.ts). The workflow runs what is needed before the agent and hands over the results in runs/.
const wf = readFileSync(".github/workflows/claude-review.yml", "utf8");
const job = (name: string) => wf.split(new RegExp(`^  ${name}:\\n`, "m"))[1]?.split(/^  [a-z-]+:\n/m)[0] ?? "";
const tools = (block: string) => block.match(/--allowedTools "([^"]+)"/)?.[1] ?? "";
const CHECKOUT_CODE = /Bash\((npm (test|audit|view|run|exec|ci|install)|npx|node|tsx)\b/;

describe.each(["review", "specialists"])("%s agent", (name) => {
  const block = job(name);

  it("exists and has an allowed-tools list", () => {
    expect(tools(block)).toContain("Read");
  });

  it("is not allowed commands that are denied on untrusted PRs", () => {
    expect(tools(block).split(",").filter((t) => CHECKOUT_CODE.test(t))).toEqual([]);
  });

  it("gets npm audit and the dependency report from a step that runs before the agent", () => {
    const before = block.split("anthropics/claude-code-action")[0]!;
    expect(before).toMatch(/npm audit --audit-level=low > runs\/audit\.txt/);
    expect(before).toMatch(/scripts\/deps-gate\.ts/);
    expect(block).toContain("runs/audit.txt");
  });
});
