// Runs the `gate` reply script from .github/workflows/claude.yml against a stub `gh` for each label state.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function gateScript(): string {
  const lines = readFileSync(".github/workflows/claude.yml", "utf8").split("\n");
  const marker = lines.findIndex((l) => l.includes("# gate-reply:"));
  const run = lines.findIndex((l, i) => i > marker && l.trim() === "- run: |");
  const end = lines.findIndex((l, i) => i > run && l.trim() === "env:");
  if (marker < 0 || run < 0 || end < 0) throw new Error("gate reply step not found");
  return lines.slice(run + 1, end).map((l) => l.replace(/^ {10}/, "")).join("\n");
}

function reply(labels: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const out = join(dir, "body.txt");
  const gh = join(dir, "gh");
  // Stub gh: write the --body argument to a file.
  writeFileSync(gh, `#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do [ "$1" = "--body" ] && printf '%s' "$2" > "${out}"; shift; done\n`);
  chmodSync(gh, 0o755);
  execFileSync("bash", ["-e", "-c", gateScript()], {
    env: { PATH: `${dir}:${process.env.PATH}`, NUM: "1", REPO: "o/r", LABELS: labels.join(",") },
  });
  return readFileSync(out, "utf8");
}

describe("@claude gate reply", () => {
  it("asks for missing details on an issue that is only not ready", () => {
    for (const labels of [[], ["bug", "needs-info"]]) {
      const r = reply(labels);
      expect(r).toContain("Add the missing details");
      expect(r).not.toContain("flagged");
    }
  });

  it("names the flag and offers scan-cleared for a plain flag", () => {
    const r = reply(["bug", "prompt-injection"]);
    expect(r).toContain("flagged as possible prompt injection");
    expect(r).toContain("`scan-cleared`");
    expect(r).not.toContain("missing details");
    expect(r).toContain("adds `ready` and mentions @claude again");
  });

  it("never offers scan-cleared as the fix for a secret", () => {
    const r = reply(["prompt-injection", "security"]);
    expect(r).toContain("Rotate it");
    expect(r).toContain("does not override a secret");
    expect(r).not.toMatch(/maintainer adds `scan-cleared`/);
    expect(r).toContain("adds `ready` and mentions @claude again");
  });

  it("does not ask for scan-cleared again once it is there", () => {
    const r = reply(["prompt-injection", "scan-cleared"]);
    expect(r).toContain("was cleared");
    expect(r).not.toMatch(/maintainer adds `scan-cleared`/);
    expect(r).toContain("adds `ready` and mentions @claude again");
  });

  it("matches label names exactly", () => {
    expect(reply(["prompt-injection-review"])).toContain("Add the missing details");
    expect(reply(["prompt-injection", "security-review"])).toContain("flagged as possible prompt injection");
  });
});
