// Honest PR check: the PR body must say what was tested, what was not, the assumptions,
// the risk tier and the evidence, so the human reviewer knows where to look.
//   PR_BODY="..." npx tsx scripts/check-pr-body.ts
const REQUIRED = ["## What I tested", "## What I did not test", "## Assumptions", "## Risk tier", "## Evidence"];
const body = process.env.PR_BODY ?? "";

/** Text a reader actually sees: drops <!-- comments -->, and everything after an unclosed <!-- (Markdown hides it too). */
function visibleText(markdown: string): string {
  const [before = "", ...rest] = markdown.split("<!--");
  return before + rest.map((chunk) => (chunk.includes("-->") ? chunk.slice(chunk.indexOf("-->") + 3) : "")).join("");
}

const missing = REQUIRED.filter((h) => !body.includes(h));
const empty = REQUIRED.filter((h) => {
  const section = body.split(h)[1]?.split(/\n## /)[0] ?? "";
  return body.includes(h) && visibleText(section).trim().length === 0;
});
if (missing.length || empty.length) {
  if (missing.length) console.error(`Missing sections: ${missing.join(", ")}`);
  if (empty.length) console.error(`Empty sections: ${empty.join(", ")}`);
  console.error("Fill in the PR template (.github/pull_request_template.md).");
  process.exit(1);
}
console.log("PR body has all honest-PR sections.");
