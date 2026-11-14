// Code Group Improvement Layer: which specialist reviews a diff gets, from context/review-routing.json.
// Backend changes: performance + security (and DBA when database files change). Dependency changes: security.
// Frontend changes: ux + motion + usertest (part 2). A member repo overrides the config with its own file.
import { matchesAny } from "./glob.js";

export interface RoutingConfig {
  backend: string[];
  frontend: string[];
  db: { paths: string[]; explainCommand?: string };
  dependencies: string[];
  ignore: string[];
  frontendApp: { start: string; url: string; testingScript: string };
}

export const BACKEND_REVIEWS = ["dba", "performance", "security"] as const;
export const FRONTEND_REVIEWS = ["ux", "motion", "usertest"] as const;
export type Specialist = (typeof BACKEND_REVIEWS)[number] | (typeof FRONTEND_REVIEWS)[number];

export interface Route { backend: string[]; frontend: string[]; db: string[]; dependencies: string[]; reviews: Specialist[] }

export function route(files: string[], cfg: RoutingConfig): Route {
  const relevant = files.filter((f) => !matchesAny(f, cfg.ignore));
  const pick = (globs: string[]) => relevant.filter((f) => matchesAny(f, globs));
  const r = {
    backend: pick(cfg.backend),
    frontend: pick(cfg.frontend),
    db: pick(cfg.db.paths),
    dependencies: pick(cfg.dependencies),
  };
  const reviews: Specialist[] = [];
  // Database files are backend changes too, even when the backend globs miss them.
  if (r.db.length) reviews.push("dba");
  if (r.backend.length || r.db.length) reviews.push("performance");
  if (r.backend.length || r.db.length || r.dependencies.length) reviews.push("security");
  if (r.frontend.length) reviews.push(...FRONTEND_REVIEWS);
  return { ...r, reviews };
}

/** Throws on a config that would silently route nothing, so a typo fails loudly. */
/** Why the synthetic user test cannot run, or null when it can (it needs a way to start the app and a script). */
export function usertestBlocker(cfg: RoutingConfig, scriptExists: boolean): string | null {
  if (!cfg.frontendApp.start) return "no frontendApp.start command in review-routing.json";
  if (!scriptExists) return `no ${cfg.frontendApp.testingScript} in the repo`;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(cfg.frontendApp.url)) return "frontendApp.url must be a local address (the test never browses external sites)";
  return null;
}

export function validateConfig(cfg: unknown): RoutingConfig {
  const c = cfg as Partial<RoutingConfig>;
  const list = (v: unknown, name: string) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`review-routing: "${name}" must be a list of globs`);
    return v as string[];
  };
  if (!c || typeof c !== "object" || !c.db || typeof c.db !== "object") throw new Error('review-routing: "db" must be an object with "paths"');
  return {
    backend: list(c.backend, "backend"),
    frontend: list(c.frontend, "frontend"),
    db: { paths: list(c.db.paths, "db.paths"), explainCommand: typeof c.db.explainCommand === "string" ? c.db.explainCommand : undefined },
    dependencies: list(c.dependencies, "dependencies"),
    ignore: list(c.ignore ?? [], "ignore"),
    frontendApp: {
      start: typeof c.frontendApp?.start === "string" ? c.frontendApp.start : "",
      url: typeof c.frontendApp?.url === "string" && c.frontendApp.url ? c.frontendApp.url : "http://localhost:3000",
      testingScript: typeof c.frontendApp?.testingScript === "string" && c.frontendApp.testingScript ? c.frontendApp.testingScript : "frontend-user-testing-script.md",
    },
  };
}
