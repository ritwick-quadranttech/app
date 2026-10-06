/**
 * Creates a custom migration that re-applies every trigger in src/schema/triggers.ts.
 * Run after any migration that rebuilds a table:  pnpm db:triggers
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTriggerMigration } from '../src/schema/triggers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--custom', '--name=reapply_triggers'], {
  cwd: root,
  stdio: 'inherit',
});
const journal = JSON.parse(readFileSync(join(root, 'migrations/meta/_journal.json'), 'utf8')) as {
  entries: { tag: string }[];
};
const latest = journal.entries.at(-1);
if (!latest?.tag.endsWith('reapply_triggers')) throw new Error('drizzle-kit did not create it');
writeFileSync(join(root, `migrations/${latest.tag}.sql`), renderTriggerMigration());
console.log(`Wrote triggers to ${latest.tag}.sql`);
