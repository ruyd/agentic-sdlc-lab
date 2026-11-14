// Runs the flag steps from .github/workflows/intake.yml against a stub `gh` that applies the real `--jq` filters:
// who set the current `prompt-injection` flag, and the guard that stops the intake agent from clearing a flag.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = resolve(".github/workflows/intake.yml");

function stepScript(marker: string): string {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const at = lines.findIndex((l) => l.includes(`# ${marker}:`));
  const run = lines.findIndex((l, i) => i > at && /^-?\s*run: \|$/.test(l.trim()));
  const end = lines.findIndex((l, i) => i > run && l.trim() === "env:");
  if (at < 0 || run < 0 || end < 0) throw new Error(`${marker} step not found`);
  return lines.slice(run + 1, end).map((l) => l.replace(/^ {10}/, "")).join("\n");
}

const STUB = `#!/usr/bin/env bash
# view -> $VIEW_JSON, api -> $EVENTS_JSON, edit -> appended to $EDIT_LOG
jqexpr=""; args=("$@")
for ((i=0; i<\${#args[@]}; i++)); do [ "\${args[$i]}" = "--jq" ] && jqexpr="\${args[$((i+1))]}"; done
case "$1 $2" in
  "issue view"|"pr view") data="$VIEW_JSON" ;;
  "issue edit"|"pr edit") echo "$*" >> "$EDIT_LOG"; exit 0 ;;
  api*) data="$EVENTS_JSON" ;;
  *) echo "unexpected gh call: $*" >&2; exit 3 ;;
esac
if [ -n "$jqexpr" ]; then jq -r "$jqexpr" <<<"$data"; else echo "$data"; fi
`;

interface Run { out: Record<string, string>; edits: string; status: number }
function run(marker: string, labels: string[], env: Record<string, string> = {}, events: unknown[] = []): Run {
  const dir = mkdtempSync(join(tmpdir(), "intake-"));
  writeFileSync(join(dir, "gh"), STUB);
  chmodSync(join(dir, "gh"), 0o755);
  const out = join(dir, "out");
  const log = join(dir, "edits");
  writeFileSync(out, "");
  writeFileSync(log, "");
  let status = 0;
  try {
    execFileSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", stepScript(marker)], {
      env: {
        PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: out, EDIT_LOG: log, KIND: "issue", NUM: "7", REPO: "o/r",
        VIEW_JSON: JSON.stringify({ labels: labels.map((name) => ({ name })) }), EVENTS_JSON: JSON.stringify(events), ...env,
      },
      stdio: "pipe",
    });
  } catch (e) {
    status = (e as { status: number }).status;
  }
  const kv = readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]);
  return { out: Object.fromEntries(kv), edits: readFileSync(log, "utf8"), status };
}

const labeled = (name: string, login: string) => ({ event: "labeled", label: { name }, actor: { login } });
const unlabeled = (name: string, login: string) => ({ event: "unlabeled", label: { name }, actor: { login } });

describe("intake: who set the flag", () => {
  const source = (labels: string[], events: unknown[]) => run("flag-source", labels, {}, events).out;

  it("a flag the scan set is a scan flag", () => {
    expect(source(["prompt-injection"], [labeled("prompt-injection", "github-actions[bot]")])).toEqual({ was_flagged: "true", scan_flag: "true" });
  });

  it("a flag the intake agent or a person set is not, so new comments cannot clear it", () => {
    expect(source(["prompt-injection"], [labeled("prompt-injection", "claude[bot]")]).scan_flag).toBe("false");
    expect(source(["prompt-injection"], [labeled("prompt-injection", "someone")]).scan_flag).toBe("false");
  });

  it("only the most recent labeling counts", () => {
    const events = [labeled("prompt-injection", "github-actions[bot]"), unlabeled("prompt-injection", "github-actions[bot]"), labeled("bug", "claude[bot]"), labeled("prompt-injection", "claude[bot]")];
    expect(source(["prompt-injection"], events).scan_flag).toBe("false");
    expect(source(["prompt-injection"], events.slice(0, 3).concat([labeled("Prompt-Injection", "github-actions[bot]")])).scan_flag).toBe("true");
  });

  it("no label means no flag, whatever the history says", () => {
    expect(source(["bug"], [labeled("prompt-injection", "github-actions[bot]")])).toEqual({ was_flagged: "false", scan_flag: "false" });
  });

  it("a flag with no labeling event on record is not treated as a scan flag", () => {
    expect(source(["prompt-injection"], []).scan_flag).toBe("false");
  });
});

describe("intake: the agent cannot clear a flag", () => {
  const guard = (labels: string[], env: Record<string, string>) => run("agent-guard", labels, env);

  it("restores prompt-injection if the agent removed it, and fails", () => {
    const r = guard(["bug", "ready"], { PRE_FLAGGED: "true", CLEARED: "false" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label prompt-injection");
    expect(r.edits).toContain("--remove-label ready");
  });

  it("removes scan-cleared if the agent added it, and fails", () => {
    const r = guard(["scan-cleared"], { PRE_FLAGGED: "false", CLEARED: "false" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--remove-label scan-cleared");
  });

  it("leaves a maintainer's scan-cleared and an unchanged flag alone", () => {
    expect(guard(["scan-cleared", "ready"], { PRE_FLAGGED: "false", CLEARED: "true" })).toMatchObject({ status: 0, edits: "" });
    expect(guard(["prompt-injection"], { PRE_FLAGGED: "true", CLEARED: "false" })).toMatchObject({ status: 0, edits: "" });
    expect(guard(["prompt-injection"], { PRE_FLAGGED: "false", CLEARED: "false" })).toMatchObject({ status: 0, edits: "" });
  });

  it("is case-insensitive, like GitHub labels", () => {
    expect(guard(["Prompt-Injection"], { PRE_FLAGGED: "true", CLEARED: "false" }).status).toBe(0);
    expect(guard(["Scan-Cleared"], { PRE_FLAGGED: "false", CLEARED: "false" }).status).toBe(1);
  });
});
