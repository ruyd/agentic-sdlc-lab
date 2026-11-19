import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A step without `shell: bash` runs as `bash -e {0}`: no pipefail, so `gate | tee -a "$GITHUB_STEP_SUMMARY"` takes
// tee's exit code and a failing gate passes. The dependency gate on PR #35 logged an error and still passed this way.
// Every workflow with run steps must set the default once at the top, so no step (now or later) can hide a failure.
const dir = ".github/workflows";
const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

export function hasBashDefault(yaml: string): boolean {
  return /^defaults:\n {2}run:\n {4}shell: bash\s*$/m.test(yaml);
}

describe("workflow shell", () => {
  it("finds the workflows", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  for (const f of workflows) {
    const yaml = readFileSync(`${dir}/${f}`, "utf8");
    if (!/^\s*(-\s+)?run:/m.test(yaml)) continue;
    it(`${f} runs every step with pipefail (top-level defaults.run.shell: bash)`, () => {
      expect(hasBashDefault(yaml)).toBe(true);
      // A step-level shell other than bash would opt back out of pipefail.
      const shells = [...yaml.matchAll(/^[ \t]+shell:[ \t]*(\S+)/gm)].map((m) => m[1]);
      expect(shells.filter((s) => s !== "bash")).toEqual([]);
    });
  }

  it("recognises the default only in its exact form", () => {
    expect(hasBashDefault("on: push\ndefaults:\n  run:\n    shell: bash\njobs: {}")).toBe(true);
    expect(hasBashDefault("on: push\njobs: {}")).toBe(false);
    expect(hasBashDefault("defaults:\n  run:\n    shell: sh\n")).toBe(false);
    expect(hasBashDefault("jobs:\n  a:\n    defaults:\n      run:\n        shell: bash\n")).toBe(false);
  });
});
