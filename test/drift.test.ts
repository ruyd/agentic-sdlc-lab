import { describe, expect, it } from "vitest";
import { mayMentionSlashCommands, resolveRef } from "../scripts/lib/drift.js";

describe("drift check reference rules", () => {
  it("reads .agent-base/ paths as this repo's own paths", () => {
    expect(resolveRef(".agent-base/context/review-routing.json")).toBe("context/review-routing.json");
    expect(resolveRef(".agent-base/CLAUDE.md")).toBe("CLAUDE.md");
    expect(resolveRef(".agent-base/context/")).toBe("context/");
    expect(resolveRef(".agent-base/")).toBe("");
    expect(resolveRef("context/rules.md")).toBe("context/rules.md");
    expect(resolveRef("docs/.agent-base/x")).toBe("docs/.agent-base/x");
  });

  it("does not treat URL paths in member templates as slash commands", () => {
    expect(mayMentionSlashCommands("docs/templates/frontend-user-testing-script.md")).toBe(false);
    expect(mayMentionSlashCommands("README.md")).toBe(true);
    expect(mayMentionSlashCommands("docs/repository-group.md")).toBe(true);
  });
});
