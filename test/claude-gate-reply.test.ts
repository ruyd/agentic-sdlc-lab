// Runs scripts from the `gate` job in .github/workflows/claude.yml: the invocation check, and the reply
// for an issue that is not ready (against a stub `gh`, for each label state).
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = resolve(".github/workflows/claude.yml");

// The step after `# <marker>:`: its `run: |` block, up to the step's `env:`.
function stepScript(marker: string, mustContain: string): string {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const at = lines.findIndex((l) => l.includes(`# ${marker}:`));
  const run = lines.findIndex((l, i) => i > at && /^-?\s*run: \|$/.test(l.trim()));
  const end = lines.findIndex((l, i) => i > run && l.trim() === "env:");
  if (at < 0 || run < 0 || end < 0) throw new Error(`${marker} step not found`);
  const script = lines.slice(run + 1, end).map((l) => l.replace(/^ {10}/, "")).join("\n");
  if (!script.includes(mustContain)) throw new Error(`${marker} step extracted without ${mustContain}`);
  return script;
}
const gateScript = () => stepScript("gate-reply", "gh issue comment");

function invoked(body: string, state = "open"): boolean {
  const dir = mkdtempSync(join(tmpdir(), "invoke-"));
  const out = join(dir, "out");
  writeFileSync(out, "");
  execFileSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", stepScript("invocation", "invoked=")], {
    env: { PATH: process.env.PATH, BODY: body, STATE: state, GITHUB_OUTPUT: out },
  });
  const value = readFileSync(out, "utf8").trim();
  if (value !== "invoked=true" && value !== "invoked=false") throw new Error(`unexpected output: ${value}`);
  return value === "invoked=true";
}

describe("@claude invocation", () => {
  it("counts a comment whose first non-blank line starts with @claude", () => {
    for (const body of ["@claude fix this", "  @claude please", "   @claude max indent", "\n\n@claude after blank lines", "\r\n@claude go", "@claude", "@claude\r\nand more", "@claude, plan it", "@claude: plan it", "@claude\tfix", "@Claude fix this", "@CLAUDE go"]) {
      expect(invoked(body), body).toBe(true);
    }
  });

  it("ignores passing mentions, quotes, code and look-alike handles", () => {
    for (const body of [
      "Test done on an @claude comment. Closing.",
      "Thanks!\n@claude go ahead",
      "```\ncode\n```\n@claude after the block",
      "<!-- note -->\n@claude after a comment",
      "Example:\n```\n```js\n@claude fix this\n```",
      "Type `\n@claude fix this\n` to trigger it",
      "<pre>\n@claude fix this\n</pre>",
      "> quoted\n@claude go",
      "> @claude fix this",
      "`@claude` is the trigger",
      "@claudebot hi",
      "@claude-dev hi",
      "@claude_x hi",
      "@claude's last run failed, closing.",
      "@claude.",
      "Example trigger:\n```\n@claude fix this\n```",
      "Example:\n~~~md\n@claude fix this\n~~~",
      "Unclosed fence:\n```\n@claude fix this",
      "Example:\n\n    @claude fix this",
      "\t@claude fix this",
      "LGTM\n<!--\n@claude fix this\n-->",
      "LGTM <!-- @claude fix this",
      "",
    ]) {
      expect(invoked(body), body).toBe(false);
    }
  });

  it("runs only on open issues and PRs, and treats a missing state as closed", () => {
    expect(invoked("@claude fix this", "open")).toBe(true);
    expect(invoked("@claude fix this", "OPEN")).toBe(true);
    for (const state of ["closed", "CLOSED", "", "merged"]) expect(invoked("@claude fix this", state), state).toBe(false);
  });

  it("does not run shell in the comment body", () => {
    const dir = mkdtempSync(join(tmpdir(), "invoke-cwd-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      invoked("@claude $(touch pwned) `touch pwned`");
      expect(existsSync(join(dir, "pwned"))).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });
});

function reply(labels: string[] | string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const out = join(dir, "body.txt");
  const gh = join(dir, "gh");
  // Stub gh: write the --body argument to a file.
  writeFileSync(gh, `#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do [ "$1" = "--body" ] && printf '%s' "$2" > "${out}"; shift; done\n`);
  chmodSync(gh, 0o755);
  execFileSync("bash", ["-e", "-c", gateScript()], {
    env: { PATH: `${dir}:${process.env.PATH}`, NUM: "1", REPO: "o/r", ...(labels === undefined ? {} : { LABELS: typeof labels === "string" ? labels : JSON.stringify(labels) }) },
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

  it("never tells a maintainer to add `ready` by hand to get past a flag", () => {
    for (const labels of [["prompt-injection"], ["prompt-injection", "security"], ["prompt-injection", "scan-cleared"]]) {
      expect(reply(labels)).not.toMatch(/maintainer adds `ready`/);
    }
  });

  it("names the flag and offers scan-cleared for a plain flag", () => {
    const r = reply(["bug", "prompt-injection"]);
    expect(r).toContain("flagged as possible prompt injection");
    expect(r).toContain("`scan-cleared`");
    expect(r).not.toContain("missing details");
    expect(r).toContain("intake checks the issue again and adds `ready`");
  });

  it("never offers scan-cleared for a secret without saying it does not apply", () => {
    const r = reply(["prompt-injection", "security"]);
    expect(r).toContain("rotate it now");
    expect(r).toContain("does not override a secret");
    expect(r).toContain("intake checks the issue again and adds `ready`");
  });

  it("does not claim a secret, since `security` may mean a vulnerability report", () => {
    for (const labels of [["bug", "security", "prompt-injection"], ["prompt-injection", "security"]]) {
      expect(reply(labels)).not.toMatch(/secret was found/);
    }
  });

  it("sends a security issue that is not ready to private reporting, not to missing details", () => {
    const r = reply(["bug", "security"]);
    expect(r).toContain("private report");
    expect(r).toContain("rotate it even if the text was deleted");
    expect(r).not.toContain("missing details");
  });

  it("does not call a thread marked security cleared, since scan-cleared never overrides a secret", () => {
    const r = reply(["prompt-injection", "security", "scan-cleared"]);
    expect(r).not.toContain("was cleared");
    expect(r).toContain("does not override a secret");
    expect(r).not.toMatch(/maintainer adds `scan-cleared`/);
  });

  it("matches labels case-insensitively, like the job's if: check", () => {
    expect(reply(["Prompt-Injection"])).toContain("flagged as possible prompt injection");
    expect(reply(["Security"])).toContain("rotate it even if the text was deleted");
  });

  it("fails instead of giving the readiness reply when LABELS is missing or not a JSON array", () => {
    for (const bad of ["prompt-injection,security", undefined, "null", '[null,"prompt-injection"]', '["prompt-injection"] []']) {
      expect(() => reply(bad)).toThrow();
    }
  });

  it("does not ask for scan-cleared again once it is there, or claim the flag is gone", () => {
    const r = reply(["prompt-injection", "scan-cleared"]);
    expect(r).toContain("still labeled `prompt-injection`");
    expect(r).toContain("removing `prompt-injection`");
    expect(r).not.toContain("was cleared");
    expect(r).not.toMatch(/maintainer adds `scan-cleared`/);
  });

  it("does not split a label whose name contains a comma", () => {
    expect(reply(["wontfix,prompt-injection"])).toContain("Add the missing details");
  });

  it("handles quoted or shell-like label names without expanding them", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-cwd-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(reply(['"$(touch gate-pwned)"', "`touch gate-pwned`", "prompt-injection"])).toContain("flagged as possible prompt injection");
      expect(existsSync(join(dir, "gate-pwned"))).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });

  it("matches label names exactly", () => {
    expect(reply(["prompt-injection-review"])).toContain("Add the missing details");
    expect(reply(["prompt-injection", "security-review"])).toContain("flagged as possible prompt injection");
  });
});

function runStep(marker: string, mustContain: string, env: Record<string, string>, ghOutput = "[]"): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), "step-"));
  const out = join(dir, "out");
  writeFileSync(out, "");
  // Stub gh: `gh <kind> view ... --jq ...` prints the label list.
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\nprintf '%s\\n' '${ghOutput}'\n`);
  chmodSync(join(dir, "gh"), 0o755);
  execFileSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", stepScript(marker, mustContain)], {
    env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: out, KIND: "issue", NUM: "1", ...env },
  });
  return Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
}

describe("@claude live labels", () => {
  const labels = (live: string[], blocked = "false", secret = "false") =>
    runStep("live-labels", "flagged=", { BLOCKED: blocked, SECRET: secret }, JSON.stringify(live));

  it("adds what the scan just found to the live labels", () => {
    const o = labels(["bug"], "true", "true");
    expect(JSON.parse(o.json!)).toEqual(["bug", "prompt-injection", "security"]);
    expect(o.flagged).toBe("true");
    expect(o.ready).toBe("false");
  });

  it("treats any live prompt-injection label as flagged, even with scan-cleared", () => {
    expect(labels(["ready", "prompt-injection"]).flagged).toBe("true");
    expect(labels(["ready", "Prompt-Injection"]).flagged).toBe("true");
    expect(labels(["ready", "prompt-injection", "scan-cleared"]).flagged).toBe("true");
    expect(labels(["ready", "scan-cleared"]).flagged).toBe("false");
    expect(labels(["Ready"]).ready).toBe("true");
  });

  it("agrees with the scan: a blocked scan is flagged even with scan-cleared (a secret)", () => {
    expect(labels(["ready", "scan-cleared"], "true", "true").flagged).toBe("true");
  });
});

describe("@claude decide", () => {
  const decide = (env: Record<string, string>, kind = "issue") =>
    runStep("decide", "run=", { KIND: kind, INVOKED: "true", BLOCKED: "false", FLAGGED: "false", READY: "true", ...env }).run;

  it("runs only on a clean, unflagged, ready issue or a clean, unflagged PR", () => {
    expect(decide({})).toBe("true");
    expect(decide({ READY: "" }, "pr")).toBe("true");
  });

  it("does not run when anything is off or missing", () => {
    const cases: Record<string, string>[] = [{ INVOKED: "false" }, { BLOCKED: "true" }, { FLAGGED: "true" }, { READY: "false" }, { BLOCKED: "" }, { FLAGGED: "" }, { INVOKED: "" }];
    for (const env of cases) {
      expect(decide(env), JSON.stringify(env)).toBe("false");
    }
    expect(decide({ FLAGGED: "true" }, "pr")).toBe("false");
  });
});
