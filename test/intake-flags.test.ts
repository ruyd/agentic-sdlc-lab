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
  // The block ends at the first non-blank line indented less than its content (the next key or step).
  const end = lines.findIndex((l, i) => i > run && l.trim() !== "" && !l.startsWith(" ".repeat(10)));
  if (at < 0 || run < 0 || end < 0) throw new Error(`${marker} step not found`);
  return lines.slice(run + 1, end).map((l) => l.replace(/^ {10}/, "")).join("\n");
}

const STUB = `#!/usr/bin/env bash
# view -> $VIEW_JSON, api -> $EVENTS_JSON, edit -> appended to $EDIT_LOG
jqexpr=""; args=("$@")
for ((i=0; i<\${#args[@]}; i++)); do [ "\${args[$i]}" = "--jq" ] && jqexpr="\${args[$((i+1))]}"; done
case "$1 $2" in
  "issue view"|"pr view") [ -n "$VIEW_FAIL" ] && exit 1; data="$VIEW_JSON" ;;
  "issue edit"|"pr edit") echo "$*" >> "$EDIT_LOG"; [ -n "$EDIT_FAIL" ] && [[ "$*" == *"$EDIT_FAIL"* ]] && exit 1; exit 0 ;;
  api*) printf '%s\n' "$EVENTS_JSON"; [ -n "$EVENTS_FAIL" ] && exit 1; exit 0 ;;
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

const actor = (login: string) => ({ login, type: login.endsWith("[bot]") ? "Bot" : "User" });
// Label events default to "during the agent run" (after STARTED below); pass BEFORE for history.
const STARTED = "2026-11-13T12:00:00Z";
const DURING = "2026-11-13T12:00:30Z";
const BEFORE = "2026-11-13T11:00:00Z";
const labeled = (name: string, login: string, created_at = DURING) => ({ event: "labeled", label: { name }, actor: actor(login), created_at });
const unlabeled = (name: string, login: string, created_at = DURING) => ({ event: "unlabeled", label: { name }, actor: actor(login), created_at });
const SCAN = "github-actions[bot]";
const AGENT = "claude[bot]";

describe("workflow shell", () => {
  it("runs every step with -eo pipefail, like these tests", () => {
    for (const wf of ["intake"]) {
      expect(readFileSync(resolve(`.github/workflows/${wf}.yml`), "utf8"), wf).toMatch(/^defaults:\n {2}run:\n {4}shell: bash$/m);
    }
  });
});

describe("intake: who set the flag", () => {
  // `pages` splits the events the way `gh api --paginate` prints them: one JSON array per page.
  const source = (labels: string[], events: unknown[], pages = 1) => {
    const size = Math.ceil(events.length / pages) || 1;
    const chunks = Array.from({ length: pages }, (_, i) => JSON.stringify(events.slice(i * size, (i + 1) * size)));
    return run("flag-source", labels, { EVENTS_JSON: chunks.join("\n") }).out;
  };

  it("a flag the scan set is a scan flag", () => {
    expect(source(["prompt-injection"], [labeled("prompt-injection", SCAN)])).toEqual({ was_flagged: "true", scan_flag: "true" });
  });

  it("a flag the intake agent or a person set is not, so new comments cannot clear it", () => {
    expect(source(["prompt-injection"], [labeled("prompt-injection", AGENT)]).scan_flag).toBe("false");
    expect(source(["prompt-injection"], [labeled("prompt-injection", "someone")]).scan_flag).toBe("false");
  });

  it("the guard restoring an agent's flag does not make it the scan's", () => {
    const events = [labeled("prompt-injection", AGENT), unlabeled("prompt-injection", AGENT), labeled("prompt-injection", SCAN)];
    expect(source(["prompt-injection"], events).scan_flag).toBe("false");
  });

  it("the scan re-flagging an agent's flag does not make it the scan's", () => {
    expect(source(["prompt-injection"], [labeled("prompt-injection", AGENT), labeled("prompt-injection", SCAN)]).scan_flag).toBe("false");
  });

  it("a person removing the flag starts a new history", () => {
    const events = [labeled("prompt-injection", AGENT), unlabeled("prompt-injection", "maintainer"), labeled("Prompt-Injection", SCAN)];
    expect(source(["prompt-injection"], events).scan_flag).toBe("true");
  });

  it("the scan clearing its own flag does not start a new history", () => {
    const events = [labeled("prompt-injection", AGENT), unlabeled("prompt-injection", SCAN), labeled("prompt-injection", SCAN)];
    expect(source(["prompt-injection"], events).scan_flag).toBe("false");
  });

  it("reads every page of events", () => {
    const filler = Array.from({ length: 70 }, () => labeled("bug", AGENT));
    const events = [labeled("prompt-injection", AGENT), ...filler, labeled("prompt-injection", SCAN)];
    expect(source(["prompt-injection"], events, 3).scan_flag).toBe("false");
    const clean = [...filler, labeled("prompt-injection", SCAN)];
    expect(source(["prompt-injection"], clean, 3).scan_flag).toBe("true");
  });

  it("no label means no flag, whatever the history says", () => {
    expect(source(["bug"], [labeled("prompt-injection", SCAN)])).toEqual({ was_flagged: "false", scan_flag: "false" });
  });

  it("fails the step when a page of events cannot be read, instead of deciding from part of the history", () => {
    const r = run("flag-source", ["prompt-injection"], { EVENTS_JSON: JSON.stringify([labeled("prompt-injection", SCAN)]), EVENTS_FAIL: "1" });
    expect(r.status).not.toBe(0);
    expect(r.out.scan_flag).toBeUndefined();
  });

  it("empty events output is not a scan flag and does not fail the step", () => {
    const r = run("flag-source", ["prompt-injection"], { EVENTS_JSON: "" });
    expect(r.status).toBe(0);
    expect(r.out.scan_flag).toBe("false");
  });

  it("a flag with no labeling event on record is not treated as a scan flag", () => {
    expect(source(["prompt-injection"], []).scan_flag).toBe("false");
  });
});

describe("intake: the agent cannot clear a flag", () => {
  const guard = (labels: string[], env: Record<string, string>) => run("agent-guard", labels, { STARTED, ...env });

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

  it("removes ready the agent added to a security issue, and fails", () => {
    const r = guard(["security", "ready"], { PRE_FLAGGED: "false", PRE_READY: "false", CLEARED: "false" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--remove-label ready");
  });

  it("leaves ready on a security issue that a maintainer had already marked ready", () => {
    expect(guard(["security", "ready"], { PRE_FLAGGED: "false", PRE_READY: "true", CLEARED: "false" })).toMatchObject({ status: 0, edits: "" });
  });

  it("restores security if the agent removed it, and removes ready", () => {
    const r = guard(["bug", "ready"], { PRE_FLAGGED: "false", PRE_READY: "false", PRE_SECURITY: "true", CLEARED: "false" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label security");
    expect(r.edits).toContain("--remove-label ready");
  });

  it("removes ready the agent added while the issue is flagged", () => {
    const r = guard(["prompt-injection", "ready", "bug"], { PRE_FLAGGED: "true", PRE_READY: "false", CLEARED: "false" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--remove-label ready");
  });

  it("keeps repairing when one edit fails, restoring the flag first", () => {
    const r = guard(["scan-cleared", "ready"], { PRE_FLAGGED: "true", PRE_READY: "false", CLEARED: "false", EDIT_FAIL: "--remove-label scan-cleared" });
    expect(r.status).toBe(1);
    const edits = r.edits.trim().split("\n");
    expect(edits[0]).toContain("--add-label prompt-injection");
    expect(r.edits).toContain("--remove-label scan-cleared");
  });

  it("keeps going when the first repair fails", () => {
    const r = guard(["security", "ready", "scan-cleared"], { PRE_FLAGGED: "true", PRE_READY: "false", PRE_SECURITY: "true", CLEARED: "false", EDIT_FAIL: "--add-label prompt-injection" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label prompt-injection");
    expect(r.edits).toContain("--remove-label ready");
    expect(r.edits).toContain("--remove-label scan-cleared");
  });

  it("leaves a scan-cleared that a person added while the agent ran", () => {
    const events = JSON.stringify([labeled("scan-cleared", "maintainer")]);
    expect(guard(["scan-cleared"], { PRE_FLAGGED: "false", CLEARED: "false", EVENTS_JSON: events })).toMatchObject({ status: 0, edits: "" });
    const byBot = JSON.stringify([labeled("scan-cleared", "maintainer"), labeled("scan-cleared", AGENT)]);
    expect(guard(["scan-cleared"], { PRE_FLAGGED: "false", CLEARED: "false", EVENTS_JSON: byBot }).status).toBe(1);
  });

  it("removes scan-cleared when its author cannot be read", () => {
    expect(guard(["scan-cleared"], { PRE_FLAGGED: "false", CLEARED: "false", EVENTS_FAIL: "1" }).edits).toContain("--remove-label scan-cleared");
  });

  it("keeps changes a maintainer made while the agent ran", () => {
    const ev = (...e: unknown[]) => ({ EVENTS_JSON: JSON.stringify(e) });
    // Removed security and added ready.
    expect(guard(["bug", "ready"], { PRE_SECURITY: "true", PRE_READY: "false", CLEARED: "false",
      ...ev(labeled("security", AGENT), unlabeled("security", "maintainer"), labeled("ready", "maintainer")) })).toMatchObject({ status: 0, edits: "" });
    // Removed the agent's flag.
    expect(guard(["bug"], { PRE_FLAGGED: "true", CLEARED: "false",
      ...ev(labeled("prompt-injection", AGENT), unlabeled("prompt-injection", "maintainer")) })).toMatchObject({ status: 0, edits: "" });
    // Added ready to a reviewed security issue.
    expect(guard(["security", "ready"], { PRE_SECURITY: "true", PRE_READY: "false", CLEARED: "false",
      ...ev(labeled("security", AGENT), labeled("ready", "maintainer")) })).toMatchObject({ status: 0, edits: "" });
  });

  it("still repairs when the last change was the agent's, or the events lag behind", () => {
    const agentRemoved = JSON.stringify([labeled("prompt-injection", "maintainer"), unlabeled("prompt-injection", AGENT)]);
    expect(guard(["bug"], { PRE_FLAGGED: "true", CLEARED: "false", EVENTS_JSON: agentRemoved }).edits).toContain("--add-label prompt-injection");
    // The events show the maintainer's earlier labeling, not the removal yet: repair.
    const lagging = JSON.stringify([labeled("prompt-injection", "maintainer")]);
    expect(guard(["bug"], { PRE_FLAGGED: "true", CLEARED: "false", EVENTS_JSON: lagging }).edits).toContain("--add-label prompt-injection");
  });

  it("restores a maintainer's scan-cleared if the agent removed it", () => {
    const r = guard(["prompt-injection"], { PRE_FLAGGED: "true", CLEARED: "true", EVENTS_JSON: JSON.stringify([labeled("scan-cleared", "maintainer"), unlabeled("scan-cleared", AGENT)]) });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label scan-cleared");
    expect(guard(["prompt-injection"], { PRE_FLAGGED: "true", CLEARED: "true", EVENTS_JSON: JSON.stringify([unlabeled("scan-cleared", "maintainer")]) })).toMatchObject({ status: 0, edits: "" });
  });

  it("keeps a ready that was there before the run when it restores a label", () => {
    const r = guard(["bug", "ready"], { PRE_SECURITY: "true", PRE_READY: "true", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("security", "maintainer"), labeled("ready", "maintainer"), unlabeled("security", AGENT)]) });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label security");
    expect(r.edits).not.toContain("--remove-label ready");
  });

  it("removes ready when the agent flagged the issue but left ready on it", () => {
    const r = guard(["prompt-injection", "ready"], { PRE_FLAGGED: "false", PRE_READY: "true", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("ready", AGENT), labeled("prompt-injection", AGENT)]) });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--remove-label ready");
  });

  it("credits only changes made during the run to people", () => {
    // The agent flagged an issue a maintainer had marked ready earlier: ready goes.
    const r1 = guard(["prompt-injection", "ready"], { PRE_FLAGGED: "false", PRE_READY: "true", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("ready", "maintainer", BEFORE), labeled("prompt-injection", AGENT)]) });
    expect(r1.edits).toContain("--remove-label ready");
    // The agent removed the flag; the only person event is an older removal: restore.
    const r2 = guard(["bug"], { PRE_FLAGGED: "true", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("prompt-injection", AGENT, BEFORE), unlabeled("prompt-injection", "maintainer", BEFORE)]) });
    expect(r2.edits).toContain("--add-label prompt-injection");
    const r3 = guard(["bug"], { PRE_SECURITY: "true", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("security", SCAN, BEFORE), unlabeled("security", "maintainer", BEFORE)]) });
    expect(r3.edits).toContain("--add-label security");
  });

  it("repairs from the pre-run snapshot when the live labels cannot be read", () => {
    const r = guard(["bug"], { PRE_FLAGGED: "true", PRE_SECURITY: "true", CLEARED: "false", VIEW_FAIL: "1" });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label prompt-injection");
    expect(r.edits).toContain("--add-label security");
  });

  it("repairs when the run start time is missing", () => {
    const r = guard(["bug"], { STARTED: "", PRE_FLAGGED: "true", CLEARED: "false", EVENTS_JSON: JSON.stringify([unlabeled("prompt-injection", "maintainer")]) });
    expect(r.edits).toContain("--add-label prompt-injection");
  });

  it("restores security the agent added and removed again within the run, and removes its ready", () => {
    const r = guard(["bug", "ready"], { PRE_SECURITY: "false", PRE_READY: "false", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("security", AGENT), unlabeled("security", AGENT), labeled("ready", AGENT)]) });
    expect(r.status).toBe(1);
    expect(r.edits).toContain("--add-label security");
    expect(r.edits).toContain("--remove-label ready");
  });

  it("does not restore a label the agent removed before the run started", () => {
    expect(guard(["bug"], { PRE_SECURITY: "false", CLEARED: "false",
      EVENTS_JSON: JSON.stringify([labeled("security", AGENT, BEFORE), unlabeled("security", AGENT, BEFORE)]) })).toMatchObject({ status: 0, edits: "" });
  });

  it("is case-insensitive, like GitHub labels", () => {
    expect(guard(["Prompt-Injection"], { PRE_FLAGGED: "true", CLEARED: "false" }).status).toBe(0);
    expect(guard(["Scan-Cleared"], { PRE_FLAGGED: "false", CLEARED: "false" }).status).toBe(1);
  });
});
