import { describe, expect, it } from "vitest";
import { STICKY_POSTER, findStickyComment, stickyCommentBody, stickyMarker } from "../scripts/lib/sticky.js";

let id = 0;
const c = (author: string, body: string) => ({ id: ++id, author, body });

describe("sticky comments", () => {
  it("finds the workflow's comment for a name, ignoring other names and other authors", () => {
    const report = c(STICKY_POSTER, stickyCommentBody("input-scan", "report"));
    const comments = [
      c("someone", stickyCommentBody("input-scan", "forged")),
      c("claude[bot]", stickyCommentBody("input-scan", "agent")),
      c(STICKY_POSTER, stickyCommentBody("other", "x")),
      report,
    ];
    expect(findStickyComment(comments, "input-scan")).toBe(report);
    expect(findStickyComment(comments.slice(0, 3), "input-scan")).toBeUndefined();
  });

  it("only matches the marker at the start, not quoted inside a comment", () => {
    expect(findStickyComment([c(STICKY_POSTER, `> ${stickyMarker("input-scan")}\nquoted`)], "input-scan")).toBeUndefined();
  });

  it("rejects names that could break the marker", () => {
    expect(() => stickyMarker("input scan")).toThrow();
    expect(() => stickyMarker("x-->")).toThrow();
    expect(stickyMarker("input-scan")).toBe("<!-- sticky:input-scan -->");
  });
});
