// Migration / change data-loss gate: finds added lines in database files that can destroy or orphan data.
// Deterministic and conservative: a match fails the gate until a maintainer adds `data-loss-approved`;
// the DBA review then judges whether the migration is safe (backup, backfill, expand/contract).

export interface DataLossFinding { file: string; line: string; rule: string }

const RULES: [string, RegExp][] = [
  ["drop-table", /\bdrop\s+(table|schema|database|view|materialized\s+view)\b/i],
  ["drop-column", /\bdrop\s+column\b|\balter\s+table\b[^;]*\bdrop\s+(?!constraint|index|default|not\s+null)\w+/i],
  ["truncate", /\btruncate\b(\s+table)?\s+\w+/i],
  ["delete-without-where", /\bdelete\s+from\s+[\w."`]+\s*(;|$)/i],
  ["update-without-where", /\bupdate\s+[\w."`]+\s+set\b(?![^;]*\bwhere\b)[^;]*(;|$)/i],
  ["type-change", /\balter\s+(table\b[^;]*\balter\s+)?column\b[^;]*\b(type|set\s+data\s+type)\b/i],
  ["rename", /\brename\s+(column|to)\b|\brename\s+table\b/i],
  // ORM migration helpers (Knex, Sequelize, TypeORM, Rails, EF Core, Prisma's generated SQL is covered above).
  ["orm-drop", /\b(dropTable|dropTableIfExists|dropColumn|dropColumns|removeColumn|drop_table|remove_column|DropTable|DropColumn|renameColumn|rename_column|RenameColumn)(\s*\(|\s+:)/],
];

/** Lines starting with SQL or language comment markers are ignored, so a commented-out DROP does not fail. */
const isComment = (line: string) => /^\s*(--|\/\/|#|\/\*|\*)/.test(line);

export function findDataLoss(file: string, addedLines: string[]): DataLossFinding[] {
  const out: DataLossFinding[] = [];
  for (const line of addedLines) {
    if (isComment(line)) continue;
    for (const [rule, re] of RULES) {
      if (re.test(line)) { out.push({ file, line: line.trim().slice(0, 200), rule }); break; }
    }
  }
  return out;
}

/** Added lines per file from `git diff --unified=0` output. */
export function addedLinesByFile(diff: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) { current = line.slice(4).replace(/^b\//, ""); if (current === "/dev/null") current = null; continue; }
    if (current && line.startsWith("+") && !line.startsWith("+++")) {
      if (!files.has(current)) files.set(current, []);
      files.get(current)!.push(line.slice(1));
    }
  }
  return files;
}
