import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { INITIAL_PLANS, validateExistingPlans } from '../phase1/catalog';
import { PERMISSION_LOCK, transaction } from '../../src/lib/snipers/permissions';
import { fileSha256, readLaunchProfile, verifyIdentity, verifyMigrationHistory } from './database';

type Target = { userId: string; email: string };
// Fault hook is dependency injection for isolated tests only; it is not exposed by the CLI.
export async function initializeLaunch(pool: Pool, target: Target, afterCatalog?: (tx: PoolClient) => Promise<void>) {
  if (!target.userId || !target.email || !target.email.includes('@')) throw new Error('Identidad del supervisor requerida.');
  return transaction(pool, async tx => {
    await tx.query('SET LOCAL search_path = public, pg_catalog');
    await tx.query('SELECT pg_advisory_xact_lock($1)', [PERMISSION_LOCK]);
    await tx.query('SELECT pg_advisory_xact_lock(1397639505)'); // Initialize before starting the singleton worker.
    const user = (await tx.query('SELECT id,email,"emailVerified" FROM "User" WHERE id=$1 FOR UPDATE', [target.userId])).rows[0];
    if (!user || user.email !== target.email || !user.emailVerified) throw new Error('Cuenta inexistente, correo distinto o no verificado.');
    const grants = (await tx.query(`SELECT "userId","revokedAt" FROM "UserPermission" WHERE permission='SNIPERS_ADMIN' FOR UPDATE`)).rows;
    const previous = (await tx.query(`SELECT 1 FROM "SnipersAuditEvent" WHERE action='LOCAL_BOOTSTRAP'
      OR (action IN ('PERMISSION_GRANTED','PERMISSION_REVOKED') AND payload->>'permission'='SNIPERS_ADMIN') LIMIT 1`)).rowCount;
    const same = grants.length === 1 && grants[0].userId === target.userId && grants[0].revokedAt === null;
    if (!same && (grants.length || previous)) throw new Error('Supervisor previo, revocado o ambiguo: usar gestión autorizada, sin reactivar permisos.');
    const plans = (await tx.query('SELECT code,name,"priceCents","durationDays",version FROM "SnipersPlan" FOR UPDATE')).rows;
    validateExistingPlans(plans);
    const created: string[] = [];
    for (const plan of INITIAL_PLANS) {
      if (plans.some(p => p.code === plan.code)) continue;
      await tx.query(`INSERT INTO "SnipersPlan" (id,code,name,"priceCents","durationDays","sortOrder","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,
        [randomUUID(), plan.code, plan.name, plan.priceCents, plan.durationDays, plan.sortOrder]);
      created.push(plan.code);
    }
    if (created.length) await tx.query(`INSERT INTO "SnipersAuditEvent" (id,action,"entityType","entityId",payload)
      VALUES ($1,'CATALOG_INITIALIZED','SnipersPlan','initial-catalog',$2::jsonb)`, [randomUUID(), JSON.stringify({ createdCodes: created })]);
    if (afterCatalog) await afterCatalog(tx);
    if (!same) {
      await tx.query(`INSERT INTO "UserPermission" (id,"userId",permission) VALUES ($1,$2,'SNIPERS_ADMIN')`, [randomUUID(), target.userId]);
      // NULL actor/grantor: offline administrative operation, not an invented authenticated session.
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,action,"entityType","entityId",payload)
        VALUES ($1,'PERMISSION_GRANTED','UserPermission',$2,$3::jsonb)`,
        [randomUUID(), target.userId, JSON.stringify({ permission: 'SNIPERS_ADMIN', before: false, after: true })]);
    }
    return { createdCodes: created, supervisorGranted: !same };
  });
}

async function main() {
  const [file, userId, email, backupManifest, ...rest] = process.argv.slice(2);
  if (!file || !userId || !email || !backupManifest || rest.length) throw new Error('Argumentos inválidos.');
  const profile = readLaunchProfile(file);
  if (profile.SNIPERS_LAUNCH_ENVIRONMENT === 'production' && email.toLowerCase().endsWith('.invalid')) throw new Error('Cuenta sintética rechazada.');
  const manifest = JSON.parse(fs.readFileSync(backupManifest, 'utf8'));
  const archive = backupManifest.replace(/\.json$/, '');
  if (archive === backupManifest || manifest.sha256 !== await fileSha256(archive) || !manifest.archiveListed
    || manifest.host !== profile.SNIPERS_EXPECT_HOST || String(manifest.port) !== profile.SNIPERS_EXPECT_PORT || manifest.database !== profile.SNIPERS_EXPECT_DATABASE
    || !Number.isFinite(Date.parse(manifest.createdAt)) || Math.abs(Date.now() - Date.parse(manifest.createdAt)) > 3600000) throw new Error('Falta respaldo reciente del destino exacto.');
  const pool = new Pool({ connectionString: profile.SNIPERS_LAUNCH_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=15000 -c lock_timeout=5000' });
  try {
    const client = await pool.connect();
    try { await verifyIdentity(client, profile); await verifyMigrationHistory(client, true); } finally { client.release(); }
    console.log(JSON.stringify(await initializeLaunch(pool, { userId, email })));
  } finally { await pool.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-launch/initialize.ts')) {
  main().catch(() => { console.error('Inicialización rechazada o fallida; no repetir concesiones sin verificar el resultado y la auditoría.'); process.exitCode = 1; });
}
