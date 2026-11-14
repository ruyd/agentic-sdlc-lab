import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addedLinesByFile, findDataLoss } from "../scripts/lib/data-loss.js";
import { route, validateConfig } from "../scripts/lib/review-routing.js";

const cfg = validateConfig(JSON.parse(readFileSync("context/review-routing.json", "utf8")));

describe("specialist routing", () => {
  it("routes backend code to performance and security, not DBA", () => {
    expect(route(["src/invoice.ts"], cfg).reviews).toEqual(["performance", "security"]);
  });

  it("adds DBA when database files change, and counts them as backend", () => {
    expect(route(["migrations/0003_add_index.sql"], cfg).reviews).toEqual(["dba", "performance", "security"]);
    expect(route(["prisma/schema.prisma"], cfg).db).toEqual(["prisma/schema.prisma"]);
  });

  it("routes a dependency-only change to security only", () => {
    expect(route(["package.json", "package-lock.json"], cfg).reviews).toEqual(["security"]);
  });

  it("routes frontend files to the three frontend reviews", () => {
    expect(route(["web/src/Button.tsx", "web/src/button.css"], cfg).reviews).toEqual(["ux", "motion", "usertest"]);
  });

  it("gives tests and docs no specialist review", () => {
    expect(route(["test/invoice.test.ts", "docs/ARCHITECTURE.md", "README.md", "src/notes.md"], cfg).reviews).toEqual([]);
  });

  it("rejects a config with a typo instead of routing nothing", () => {
    expect(() => validateConfig({ backend: "src/**", frontend: [], db: { paths: [] }, dependencies: [] })).toThrow(/backend/);
    expect(() => validateConfig({ backend: [], frontend: [], dependencies: [] })).toThrow(/db/);
  });
});

describe("data-loss gate", () => {
  const f = (lines: string[]) => findDataLoss("migrations/x.sql", lines).map((x) => x.rule);

  it("flags destructive SQL", () => {
    expect(f(["DROP TABLE invoices;"])).toEqual(["drop-table"]);
    expect(f(["ALTER TABLE invoices DROP COLUMN discount;"])).toEqual(["drop-column"]);
    expect(f(["truncate table audit_log;"])).toEqual(["truncate"]);
    expect(f(["DELETE FROM sessions;"])).toEqual(["delete-without-where"]);
    expect(f(["UPDATE invoices SET total = 0;"])).toEqual(["update-without-where"]);
    expect(f(["ALTER TABLE t ALTER COLUMN amount TYPE integer;"])).toEqual(["type-change"]);
    expect(f(["ALTER TABLE t RENAME COLUMN a TO b;"])).toEqual(["rename"]);
  });

  it("flags ORM migration helpers", () => {
    expect(f(["  await knex.schema.dropTable('invoices')"])).toEqual(["orm-drop"]);
    expect(f(["    remove_column :invoices, :discount"])).toEqual(["orm-drop"]);
    expect(f(["migrationBuilder.DropColumn(name: \"Discount\");"])).toEqual(["orm-drop"]);
  });

  it("allows additive and scoped changes", () => {
    expect(f([
      "CREATE TABLE refunds (id bigint primary key);",
      "ALTER TABLE invoices ADD COLUMN currency text;",
      "CREATE INDEX CONCURRENTLY idx_inv_customer ON invoices (customer_id);",
      "DELETE FROM sessions WHERE expires_at < now();",
      "UPDATE invoices SET currency = 'USD' WHERE currency IS NULL;",
      "ALTER TABLE invoices DROP CONSTRAINT invoices_total_check;",
      "DROP INDEX idx_old;",
    ])).toEqual([]);
  });

  it("ignores commented-out statements", () => {
    expect(f(["-- DROP TABLE invoices;", "// dropTable('x')", "# remove_column :a, :b"])).toEqual([]);
  });

  it("reads only added lines, per file, from a unified diff", () => {
    const diff = [
      "diff --git a/migrations/1.sql b/migrations/1.sql",
      "--- a/migrations/1.sql",
      "+++ b/migrations/1.sql",
      "@@ -1 +1 @@",
      "-DROP TABLE old;",
      "+CREATE TABLE new (id int);",
      "diff --git a/gone.sql b/gone.sql",
      "--- a/gone.sql",
      "+++ /dev/null",
      "-DROP TABLE x;",
    ].join("\n");
    expect([...addedLinesByFile(diff)]).toEqual([["migrations/1.sql", ["CREATE TABLE new (id int);"]]]);
  });
});
