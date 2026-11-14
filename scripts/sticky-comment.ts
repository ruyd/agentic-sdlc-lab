// Create or edit the thread's one comment for <name> (logic in scripts/lib/sticky.ts):
//   npx tsx scripts/sticky-comment.ts <issue-or-pr number> <name> <file>
// Prints created=true when the comment was new (so the caller knows a notification went out), false when edited.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { findStickyComment, stickyCommentBody, type ThreadComment } from "./lib/sticky.js";

const [num, name, file] = process.argv.slice(2);
if (!num || !name || !file) {
  console.error("usage: sticky-comment.ts <number> <name> <file>");
  process.exit(2);
}
const gh = (...a: string[]) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const repo = process.env.GITHUB_REPOSITORY ?? JSON.parse(gh("repo", "view", "--json", "nameWithOwner")).nameWithOwner;

const pages = JSON.parse(gh("api", `repos/${repo}/issues/${num}/comments`, "--paginate", "--slurp")) as
  { id: number; user: { login: string } | null; body: string | null }[][];
const comments: ThreadComment[] = pages.flat().map((c) => ({ id: c.id, author: c.user?.login ?? "", body: c.body ?? "" }));
const body = stickyCommentBody(name, readFileSync(file, "utf8"));
const existing = findStickyComment(comments, name);
if (existing) gh("api", "-X", "PATCH", `repos/${repo}/issues/comments/${existing.id}`, "-f", `body=${body}`);
else gh("api", "-X", "POST", `repos/${repo}/issues/${num}/comments`, "-f", `body=${body}`);
const out = `created=${!existing}\n`;
process.stdout.write(out);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
