// Path globs: * matches within one path segment, ** across segments.
export function globToRegExp(glob: string): RegExp {
  const re = glob
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`);
}

export const matchesAny = (file: string, globs: string[]): boolean => globs.some((g) => globToRegExp(g).test(file));
