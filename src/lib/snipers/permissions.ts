// Internal database service. HTTP callers must use server.ts, which supplies a validated session.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const PERMISSIONS = ['SNIPERS_CONTENT_EDITOR', 'SNIPERS_MEMBERSHIP_MANAGER', 'SNIPERS_ADMIN'] as const;
export type SnipersPermission = typeof PERMISSIONS[number];
export type Actor = { userId: string; activeSessionId: string | null; singleSession: boolean };
export const PERMISSION_LOCK = 1397639504;

export function checkPermissionName(value: string): asserts value is SnipersPermission {
  if (!(PERMISSIONS as readonly string[]).includes(value)) throw new Error('Permiso de Snipers inválido.');
}

export async function transaction<T>(pool: Pool, body: (tx: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await body(tx);
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      await tx.query('ROLLBACK').catch(() => {});
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === '40001' || code === '40P01')) continue;
      throw error;
    } finally { tx.release(); }
  }
}

export async function requirePermission(tx: PoolClient, actor: Actor, permission: SnipersPermission): Promise<void> {
  checkPermissionName(permission);
  const result = await tx.query<{ activeSessionId: string | null }>(
    'SELECT "activeSessionId" FROM "User" WHERE "id"=$1', [actor.userId]);
  if (result.rowCount !== 1 || (actor.singleSession && (!actor.activeSessionId || result.rows[0].activeSessionId !== actor.activeSessionId))) {
    throw new Error('Sesión no válida.');
  }
  const grants = await tx.query('SELECT 1 FROM "UserPermission" WHERE "userId"=$1 AND "revokedAt" IS NULL AND "permission" IN ($2,\'SNIPERS_ADMIN\')', [actor.userId, permission]);
  if (!grants.rowCount) throw new Error('Permiso de Snipers requerido.');
}

export async function hasPermission(pool: Pool, actor: Actor, permission: SnipersPermission): Promise<boolean> {
  try {
    return await transaction(pool, async tx => { await requirePermission(tx, actor, permission); return true; });
  } catch { return false; }
}

export async function changePermission(pool: Pool, actor: Actor, userId: string, permission: SnipersPermission, grant: boolean): Promise<boolean> {
  checkPermissionName(permission);
  return transaction(pool, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [PERMISSION_LOCK]);
    await requirePermission(tx, actor, 'SNIPERS_ADMIN');
    const target = await tx.query('SELECT 1 FROM "User" WHERE id=$1', [userId]);
    if (target.rowCount !== 1) throw new Error('Usuario inexistente.');
    const existing = await tx.query('SELECT "id", "revokedAt" FROM "UserPermission" WHERE "userId"=$1 AND "permission"=$2', [userId, permission]);
    const before = existing.rowCount === 1 && existing.rows[0].revokedAt === null;
    if (before === grant) return false;
    if (!grant && permission === 'SNIPERS_ADMIN') {
      const admins = await tx.query('SELECT count(*)::int AS count FROM "UserPermission" WHERE "permission"=\'SNIPERS_ADMIN\' AND "revokedAt" IS NULL');
      if (admins.rows[0].count <= 1) throw new Error('No se puede revocar al último administrador de Snipers.');
    }
    if (grant) {
      await tx.query(`INSERT INTO "UserPermission" (id,"userId",permission,"grantedById") VALUES ($1,$2,$3,$4)
        ON CONFLICT ("userId",permission) DO UPDATE SET "grantedAt"=CURRENT_TIMESTAMP,"grantedById"=$4,"revokedAt"=NULL,"revokedById"=NULL`,
      [randomUUID(), userId, permission, actor.userId]);
    } else {
      await tx.query('UPDATE "UserPermission" SET "revokedAt"=CURRENT_TIMESTAMP,"revokedById"=$3 WHERE "userId"=$1 AND permission=$2', [userId, permission, actor.userId]);
    }
    // Deliberately constructed allowlist: never serialize requests, users, tokens, or free-form context.
    await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
      VALUES ($1,$2,$3,'UserPermission',$4,$5::jsonb)`,
    [randomUUID(), actor.userId, grant ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED', userId, JSON.stringify({ permission, before, after: grant })]);
    return true;
  });
}
