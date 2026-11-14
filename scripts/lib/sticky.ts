// One comment per thread and purpose, created once and then edited in place (edits send no notifications).
// Only comments posted by this repo's automation count: anyone can type a marker into a comment.

export const STICKY_POSTER = "github-actions[bot]";

export interface ThreadComment { id: number; author: string; body: string }

export function stickyMarker(name: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid sticky name: ${name}`);
  return `<!-- sticky:${name} -->`;
}

/** The workflow's comment for `name`, if it already posted one (the latest, if somehow there are several). */
export function findStickyComment(comments: ThreadComment[], name: string): ThreadComment | undefined {
  const marker = stickyMarker(name);
  return comments.filter((c) => c.author === STICKY_POSTER && c.body.startsWith(marker)).at(-1);
}

export function stickyCommentBody(name: string, content: string): string {
  return `${stickyMarker(name)}\n${content.trim()}\n`;
}
