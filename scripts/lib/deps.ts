// Dependency security gate: every version pinned exactly, and every added or changed version old enough to have been
// vetted (a cooldown against freshly published, possibly compromised releases) and not deprecated.

export const MIN_AGE_DAYS = 7;
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
type Pkg = Partial<Record<(typeof SECTIONS)[number], Record<string, string>>>;

/** An exact version (1.2.3 or 1.2.3-rc.1). Ranges, tags, URLs, git and file specs are not pinned. */
export function isPinned(spec: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(spec);
}

export interface Dep { section: string; name: string; spec: string }

export function deps(pkg: Pkg): Dep[] {
  // peerDependencies are ranges by design (what a library supports), so they are not pinned.
  return SECTIONS.filter((s) => s !== "peerDependencies").flatMap((section) =>
    Object.entries(pkg[section] ?? {}).map(([name, spec]) => ({ section, name, spec })));
}

export function unpinned(pkg: Pkg): Dep[] {
  return deps(pkg).filter((d) => !isPinned(d.spec));
}

export interface Change { name: string; from: string | null; to: string }

/** The version a simple caret/tilde/equals spec starts from, so pinning ^1.2.3 to 1.2.3 is not an update. */
const baseVersion = (spec: string) => spec.replace(/^[\^~=v]+/, "");

/** Added or changed dependencies between two package.json files (removals need no check). */
export function changed(before: Pkg, after: Pkg): Change[] {
  const old = new Map(deps(before).map((d) => [d.name, d.spec]));
  return deps(after)
    .filter((d) => { const o = old.get(d.name); return o === undefined || baseVersion(o) !== baseVersion(d.spec); })
    .map((d) => ({ name: d.name, from: old.get(d.name) ?? null, to: d.spec }));
}

/** Whole days between a publish time and now; null when the time is unknown (fails the check). */
export function ageDays(published: string | undefined, now: Date): number | null {
  const t = published ? Date.parse(published) : NaN;
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / 86_400_000);
}

/**
 * `npm view <pkg>@<v> time deprecated --json` prints `{ time: {...}, deprecated }` when the version is deprecated,
 * but only the bare time map when it is not. Accept both.
 */
export function parseNpmView(json: string, version: string): { published?: string; deprecated?: string } {
  let v: unknown;
  try { v = JSON.parse(json || "{}"); } catch { return {}; }
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const time = (o.time && typeof o.time === "object" ? o.time : o) as Record<string, unknown>;
  const published = typeof time[version] === "string" ? (time[version] as string) : undefined;
  const deprecated = typeof o.deprecated === "string" ? o.deprecated : undefined;
  return { published, deprecated };
}
