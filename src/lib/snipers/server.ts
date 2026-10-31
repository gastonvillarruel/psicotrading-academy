import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth';
import { pool } from '../db';
import { changePermission, requirePermission, transaction, type Actor, type SnipersPermission } from './permissions';
import { actorFromSession } from './session';
import { previewKey } from './preview';
import { reject } from './errors';
import { createSnipersGateway } from './gateway';
import { createR2Storage, type DeliveryStorage } from './upload-storage';

async function currentActor(): Promise<Actor> {
  if (process.env.SNIPERS_ENABLED !== 'true') reject('DISABLED', 'Snipers deshabilitado.');
  previewKey(process.env.NEXTAUTH_SECRET);
  return actorFromSession(await getServerSession(authOptions), process.env.ENABLE_SINGLE_SESSION);
}

export async function requireSnipersPermission(permission: SnipersPermission): Promise<void> {
  const actor = await currentActor();
  await transaction(pool, tx => requirePermission(tx, actor, permission, true));
}

export async function grantSnipersPermission(userId: string, permission: SnipersPermission): Promise<boolean> {
  return changePermission(pool, await currentActor(), userId, permission, true);
}

export async function revokeSnipersPermission(userId: string, permission: SnipersPermission): Promise<boolean> {
  return changePermission(pool, await currentActor(), userId, permission, false);
}

// Internal server functions only: no "use server", public routes or client imports.
let deliveryStorage:DeliveryStorage|undefined;
export const snipers = createSnipersGateway(pool, () => getServerSession(authOptions), () => ({
  enabled: process.env.SNIPERS_ENABLED, singleSession: process.env.ENABLE_SINGLE_SESSION, secret: process.env.NEXTAUTH_SECRET,
}),()=>deliveryStorage??=createR2Storage());
