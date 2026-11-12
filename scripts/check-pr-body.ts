// Honest PR check: the PR body must say what was tested, what was not, the assumptions,
// the risk tier and the evidence, so the human reviewer knows where to look.
//   PR_BODY="..." npx tsx scripts/check-pr-body.ts
const REQUIRED = ["## What I tested", "## What I did not test", "## Assumptions", "## Risk tier", "## Evidence"];
const body = process.env.PR_BODY ?? "";
const missing = REQUIRED.filter((h) => !body.includes(h));
const empty = REQUIRED.filter((h) => {
  const after = body.split(h)[1]?.split(/\n## /)[0] ?? "";
  return body.includes(h) && after.replace(/<!--[\s\S]*?-->/g, "").trim().length === 0;
});
if (missing.length || empty.length) {
  if (missing.length) console.error(`Missing sections: ${missing.join(", ")}`);
  if (empty.length) console.error(`Empty sections: ${empty.join(", ")}`);
  console.error("Fill in the PR template (.github/pull_request_template.md).");
  process.exit(1);
}
console.log("PR body has all honest-PR sections.");
