import { auditLogs, companies, type Db, type NegativeStockPolicy } from '@repo/database';
import { eq } from 'drizzle-orm';
import { DocumentNotFoundError } from './errors';
import { assertIsoDate } from './fiscal';
import type { Actor } from './posting/service';

/** Per-company posting controls. Changes are audit-logged. */
export interface PostingSettings {
  readonly negativeStockPolicy: NegativeStockPolicy;
  /** Nothing dated on or before this can be posted or cancelled. */
  readonly lockedUntil: string | null;
}

export async function getPostingSettings(db: Db, companyId: string): Promise<PostingSettings> {
  const [row] = await db
    .select({
      negativeStockPolicy: companies.negativeStockPolicy,
      lockedUntil: companies.lockedUntil,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!row) throw new DocumentNotFoundError(`Company ${companyId} not found.`);
  return row;
}

export async function updatePostingSettings(
  tx: Db,
  actor: Actor,
  companyId: string,
  changes: Partial<PostingSettings>,
): Promise<PostingSettings> {
  if (changes.lockedUntil) assertIsoDate(changes.lockedUntil, 'lockedUntil');
  const before = await getPostingSettings(tx, companyId);
  const after = { ...before, ...changes };
  await tx.update(companies).set(after).where(eq(companies.id, companyId));
  await tx.insert(auditLogs).values({
    companyId,
    userId: actor.userId,
    action: 'UPDATE',
    entity: 'companies',
    entityId: companyId,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    createdBy: actor.userId,
  });
  return after;
}
