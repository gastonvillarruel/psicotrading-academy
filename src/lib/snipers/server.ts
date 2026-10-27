import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth';
import { pool } from '../db';
import { changePermission, requirePermission, transaction, type Actor, type SnipersPermission } from './permissions';

async function currentActor(): Promise<Actor> {
  if (process.env.SNIPERS_ENABLED !== 'true') throw new Error('Snipers deshabilitado.');
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) throw new Error('Sesión no válida.');
  return { userId: session.user.id, activeSessionId: session.user.activeSessionId ?? null,
    singleSession: process.env.ENABLE_SINGLE_SESSION !== 'false' };
}

export async function requireSnipersPermission(permission: SnipersPermission): Promise<void> {
  const actor = await currentActor();
  await transaction(pool, tx => requirePermission(tx, actor, permission));
}

export async function grantSnipersPermission(userId: string, permission: SnipersPermission): Promise<boolean> {
  return changePermission(pool, await currentActor(), userId, permission, true);
}

export async function revokeSnipersPermission(userId: string, permission: SnipersPermission): Promise<boolean> {
  return changePermission(pool, await currentActor(), userId, permission, false);
}
