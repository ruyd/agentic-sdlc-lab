import { describe, expect, it } from "vitest";
import {
  MAX_CHANGED_LINES, MAX_ROUNDS, budget, countedLines, findSticky, marker, parseBlockers, parseMarker, roundsDone,
  stickyBody, type Comment,
} from "../scripts/lib/review-loop.js";

const bot = "github-actions[bot]";
let id = 0;
const c = (author: string, body: string): Comment => ({ id: ++id, author, body });

describe("round budget", () => {
  it("allows rounds up to the limit, then stops", () => {
    expect(MAX_ROUNDS).toBe(2);
    expect(budget([], false)).toEqual({ done: 0, next: 1, allowed: true });
    expect(budget([c(bot, stickyBody("review", 1, "x"))], false)).toEqual({ done: 1, next: 2, allowed: true });
    const two = [c(bot, stickyBody("review", 2, "x")), c(bot, stickyBody("adversary", 2, "y"))];
    expect(budget(two, false)).toEqual({ done: 2, next: 3, allowed: false });
  });

  it("allows one more round when a person added review-again", () => {
    expect(budget([c(bot, stickyBody("review", 2, "x"))], true)).toEqual({ done: 2, next: 3, allowed: true });
  });

  it("counts the higher of the two agents' rounds", () => {
    expect(roundsDone([c(bot, stickyBody("review", 1, "x")), c(bot, stickyBody("adversary", 2, "y"))])).toBe(2);
  });

  it("ignores markers typed by anyone but the workflow, so the budget cannot be reset or spent by a comment", () => {
    const forged = [c("someone", marker("review", 0)), c("claude", marker("adversary", 9)), c("claude[bot]", marker("review", 9))];
    expect(roundsDone(forged)).toBe(0);
    expect(roundsDone([c(bot, stickyBody("review", 2, "x")), c("someone", marker("review", 0))])).toBe(2);
  });

  it("counts specialist reviews in the same budget", () => {
    expect(roundsDone([c(bot, stickyBody("review", 1, "x")), c(bot, stickyBody("dba", 2, "y"))])).toBe(2);
    expect(stickyBody("performance", 1, "r")).toContain("Performance review: round 1 of 2");
  });

  it("ignores the budget note when counting rounds", () => {
    expect(roundsDone([c(bot, stickyBody("budget", 7, "note"))])).toBe(0);
  });
});

describe("sticky comments", () => {
  it("finds the workflow's comment for each agent, latest first", () => {
    const a = c(bot, stickyBody("review", 1, "old"));
    const b = c(bot, stickyBody("review", 2, "new"));
    expect(findSticky([a, c(bot, stickyBody("adversary", 1, "z")), b], "review")).toBe(b);
    expect(findSticky([c("someone", stickyBody("review", 1, "x"))], "review")).toBeUndefined();
  });

  it("round-trips the marker and labels extra rounds", () => {
    expect(parseMarker(stickyBody("adversary", 3, "r"))).toEqual({ agent: "adversary", round: 3 });
    expect(stickyBody("adversary", 3, "r")).toContain("extra round");
    expect(stickyBody("review", 1, "r")).not.toContain("extra round");
    expect(parseMarker("no marker")).toBeNull();
  });
});

describe("blocker count", () => {
  it("reads one `Blockers: N` line, in plain or bold form", () => {
    expect(parseBlockers("## Adversarial review\n...\nBlockers: 0")).toBe(0);
    expect(parseBlockers("text\n**Blockers: 2**\n")).toBe(2);
    expect(parseBlockers("**Blockers:** 1")).toBe(1);
    expect(parseBlockers("blockers: 3\r\n")).toBe(3);
  });

  it("is null (fails the check) when the line is missing, repeated or not a number", () => {
    expect(parseBlockers("no count here")).toBeNull();
    expect(parseBlockers("Blockers: 0\nBlockers: 0")).toBeNull();
    expect(parseBlockers("Blockers: none")).toBeNull();
    expect(parseBlockers("Blockers: 0 (and 3 more)")).toBeNull();
  });

  it("does not count prose that mentions blockers mid-line", () => {
    expect(parseBlockers("There are no blockers: see below.\nBlockers: 0")).toBe(0);
  });
});

describe("size budget", () => {
  it("counts source and workflow lines, not tests, docs or the lockfile", () => {
    const numstat = [
      "120\t50\t.github/workflows/claude.yml",
      "10\t2\tsrc/invoice.ts",
      "300\t0\ttest/x.test.ts",
      "40\t4\tdocs/ARCHITECTURE.md",
      "5\t1\tREADME.md",
      "900\t900\tpackage-lock.json",
    ].join("\n");
    expect(countedLines(numstat).counted).toBe(182);
  });

  it("counts a binary file as 2 lines, so it is not free", () => {
    expect(countedLines("-\t-\tassets/logo.png").counted).toBe(2);
  });

  it("has a limit of 300 lines", () => {
    expect(MAX_CHANGED_LINES).toBe(300);
  });
});
