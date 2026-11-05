// Internal transaction combinator. Not exported through the gateway, actions or routes.
import type { Pool, PoolClient } from 'pg';
import { parse } from './contracts';
import { reject } from './errors';
import { requirePermission, transaction, type Actor } from './permissions';
import { digest } from './preview';
import { fileAuditSchema, foundationCommand, type FileReceipt, type FoundationCommand } from './file-contracts';

async function read(tx: PoolClient, actor: Actor, command: FoundationCommand, commandHash: string): Promise<FileReceipt | null> {
  const row = (await tx.query('SELECT "actorUserId",action,"entityType","entityId",payload,"createdAt" FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rows[0];
  if (!row) return null;
  const payload = fileAuditSchema.safeParse(row.payload);
  if (row.actorUserId !== actor.userId || row.action !== 'FILE_FOUNDATION_CHANGED' || row.entityType !== 'SnipersResource' || row.entityId !== command.resourceId || !payload.success || payload.data.commandHash !== commandHash) reject('IDEMPOTENCY_CONFLICT', 'Operación diferente.');
  if (payload.data.result.operationId !== command.operationId || payload.data.result.resourceId !== command.resourceId || payload.data.result.objectId !== command.objectId || payload.data.result.kind !== command.kind) reject('INTEGRITY', 'Recibo inválido.');
  return { result: payload.data.result, replayed: true, confirmedAt: row.createdAt.toISOString() };
}

// Caller supplies trusted SQL work. It MUST use this tx, acquire aggregate locks in
// canonical order and perform no remote I/O. No nested SQL transaction is started.
export async function withFileReceipt(pool: Pool, actor: Actor, input: unknown, work: (tx: PoolClient, command: FoundationCommand) => Promise<boolean>): Promise<FileReceipt> {
  const command = parse(foundationCommand, input);
  const commandHash = digest(command);
  try {
    return await transaction(pool, async tx => {
      await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
      const old = await read(tx, actor, command, commandHash);
      if (old) return old;
      const changed = await work(tx, command);
      const payload = parse(fileAuditSchema, { formatVersion: 1, commandHash, result: { ...command, changed } });
      const event = await tx.query('INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,\'FILE_FOUNDATION_CHANGED\',\'SnipersResource\',$3,$4::jsonb) RETURNING "createdAt"', [command.operationId, actor.userId, command.resourceId, JSON.stringify(payload)]);
      return { result: payload.result, replayed: false, confirmedAt: event.rows[0].createdAt.toISOString() };
    });
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const old = await transaction(pool, async tx => {
      await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
      return read(tx, actor, command, commandHash);
    });
    if (old) return old;
    throw error;
  }
}
