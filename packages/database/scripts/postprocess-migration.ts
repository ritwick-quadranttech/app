/**
 * Fixes two drizzle-kit (0.31) bugs in the NEWEST generated migration. Idempotent; older
 * migrations are never touched (they may be applied, and migrate() verifies their hashes).
 *
 * 1. When a table is rebuilt (to change CHECKs) and also gains columns, drizzle-kit copies the
 *    new columns from the old table, where they don't exist. We copy only the columns that the
 *    previous snapshot had; new columns take their defaults.
 * 2. CHECKs are written table-qualified ("__new_x"."col"). migrate() runs with
 *    legacy_alter_table = ON, so the rename to "x" does not rewrite them and they break.
 *    Inside CREATE TABLE the qualifier is redundant, so we strip it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'migrations');

interface Journal {
  entries: { idx: number; tag: string }[];
}
interface Snapshot {
  tables: Record<string, { columns: Record<string, unknown> }>;
}

export function postprocess(source: string, previous: Snapshot | undefined): string {
  const copiesFixed = source.replace(
    /INSERT INTO `__new_(\w+)`\((.*?)\) SELECT (.*?) FROM `(\w+)`;/g,
    (match, table: string, columnList: string, _select: string, from: string) => {
      const oldColumns = previous?.tables[table]?.columns;
      if (!oldColumns) return match;
      const kept = columnList
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.replaceAll('"', '') in oldColumns)
        .join(', ');
      return `INSERT INTO \`__new_${table}\`(${kept}) SELECT ${kept} FROM \`${from}\`;`;
    },
  );

  return copiesFixed
    .split('--> statement-breakpoint')
    .map((statement) =>
      /^\s*CREATE TABLE/.test(statement) ? statement.replace(/"\w+"\.(?=")/g, '') : statement,
    )
    .join('--> statement-breakpoint');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const journal = JSON.parse(
    readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
  const latest = journal.entries.at(-1);
  if (!latest) process.exit(0);

  const prevSnapshotFile = join(
    migrationsDir,
    `meta/${String(latest.idx - 1).padStart(4, '0')}_snapshot.json`,
  );
  const previous =
    latest.idx > 0 ? (JSON.parse(readFileSync(prevSnapshotFile, 'utf8')) as Snapshot) : undefined;

  const file = join(migrationsDir, `${latest.tag}.sql`);
  const before = readFileSync(file, 'utf8');
  const after = postprocess(before, previous);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`Post-processed ${latest.tag}.sql`);
  }
}
