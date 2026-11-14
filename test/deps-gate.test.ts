import { describe, expect, it } from "vitest";
import { ageDays, changed, isPinned, parseNpmView, unpinned } from "../scripts/lib/deps.js";

describe("pinned versions", () => {
  it("accepts exact versions only", () => {
    for (const ok of ["1.2.3", "0.3.322", "1.0.0-rc.1", "2.0.0+build.5"]) expect(isPinned(ok), ok).toBe(true);
    for (const bad of ["^1.2.3", "~1.2.3", ">=1.0.0", "1.x", "*", "latest", "", "1.2", "github:o/r", "file:../x", "https://x/y.tgz", "1.2.3 || 2.0.0"]) {
      expect(isPinned(bad), bad).toBe(false);
    }
  });

  it("checks dependencies, devDependencies and optionalDependencies, not peerDependencies", () => {
    const pkg = { dependencies: { a: "1.0.0", b: "^2.0.0" }, devDependencies: { c: "~3.0.0" }, optionalDependencies: { d: "latest" }, peerDependencies: { e: "^5" } };
    expect(unpinned(pkg).map((d) => d.name)).toEqual(["b", "c", "d"]);
  });

  it("this repo's own package.json is pinned", async () => {
    const pkg = (await import("../package.json", { with: { type: "json" } })).default;
    expect(unpinned(pkg)).toEqual([]);
  });
});

describe("changed versions", () => {
  it("reports added and changed versions, not removals or re-pinning the same version", () => {
    const before = { dependencies: { a: "^1.2.3", b: "2.0.0", gone: "1.0.0" } };
    const after = { dependencies: { a: "1.2.3", b: "2.1.0", fresh: "0.1.0" } };
    expect(changed(before, after)).toEqual([{ name: "b", from: "2.0.0", to: "2.1.0" }, { name: "fresh", from: null, to: "0.1.0" }]);
  });
});

describe("version age and deprecation", () => {
  const now = new Date("2026-11-14T00:00:00Z");

  it("computes whole days since publishing, and null when unknown", () => {
    expect(ageDays("2026-11-07T00:00:00Z", now)).toBe(7);
    expect(ageDays("2026-11-13T12:00:00Z", now)).toBe(0);
    expect(ageDays(undefined, now)).toBeNull();
    expect(ageDays("not a date", now)).toBeNull();
  });

  it("reads both shapes of npm view output", () => {
    const bare = JSON.stringify({ created: "2020-01-01T00:00:00Z", "1.2.3": "2026-01-01T00:00:00Z" });
    expect(parseNpmView(bare, "1.2.3")).toEqual({ published: "2026-01-01T00:00:00Z", deprecated: undefined });
    const wrapped = JSON.stringify({ time: { "2.88.2": "2020-02-11T16:35:36.122Z" }, deprecated: "use something else" });
    expect(parseNpmView(wrapped, "2.88.2")).toEqual({ published: "2020-02-11T16:35:36.122Z", deprecated: "use something else" });
  });

  it("treats empty or broken output as unknown, so the gate fails", () => {
    expect(parseNpmView("", "1.0.0")).toEqual({});
    expect(parseNpmView("not json", "1.0.0")).toEqual({});
    expect(parseNpmView(JSON.stringify({ "9.9.9": "2026-01-01" }), "1.0.0").published).toBeUndefined();
  });
});
