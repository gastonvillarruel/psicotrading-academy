import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { fail, localDir, writePrivate } from '../phase0/local';
import { localPool, requireRunner, verifyDatabase } from './guard';
import { PERMISSION_LOCK, transaction } from '../../src/lib/snipers/permissions';
import { initializeCatalog } from './catalog';

export async function bootstrapLocal(): Promise<void> {
  verifyDatabase(requireRunner());
  const credentials = path.join(localDir, 'phase1-synthetic-account.json');
  if (fs.existsSync(credentials)) throw new Error('Ya existe un archivo de cuenta sintética; no se reutiliza ni sobrescribe.');
  const pool = localPool();
  const id = randomUUID();
  const email = 'snipers-supervisor@local.invalid';
  const password = randomBytes(32).toString('base64url');
  const passwordHash = await hash(password, 12);
  try {
    await transaction(pool, async tx => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [PERMISSION_LOCK]);
      const previous = await tx.query(`SELECT 1 FROM "UserPermission" WHERE permission='SNIPERS_ADMIN' AND "revokedAt" IS NULL
        UNION ALL SELECT 1 FROM "SnipersAuditEvent" WHERE action='LOCAL_BOOTSTRAP'`);
      if (previous.rowCount) throw new Error('Bootstrap ya realizado o administrador existente.');
      const collision = await tx.query('SELECT 1 FROM "User" WHERE lower(email)=lower($1)', [email]);
      if (collision.rowCount) throw new Error('Colisión de identidad sintética.');
      // Persist only to an ignored local file before commit so a disk failure rolls the transaction back.
      // A failed transaction leaves this recovery file intentionally: never silently retry/recreate a bootstrap.
      writePrivate(credentials, JSON.stringify({ environment: 'local', database: 'snipers_dev', userId: id, email, password }, null, 2));
      await tx.query(`INSERT INTO "User" (id,email,password,name,role,"emailVerified","updatedAt")
        VALUES ($1,$2,$3,'Supervisor sintético Snipers','STUDENT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [id, email, passwordHash]);
      await tx.query(`INSERT INTO "UserPermission" (id,"userId",permission)
        VALUES ($1,$2,'SNIPERS_ADMIN')`, [randomUUID(), id]);
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,'LOCAL_BOOTSTRAP','User',$2,'{"environment":"local","permission":"SNIPERS_ADMIN"}')`, [randomUUID(), id]);
    });
    console.log('Cuenta sintética local creada con SNIPERS_ADMIN. Credenciales en .local/snipers/phase1-synthetic-account.json (no versionar).');
  } finally { await pool.end(); }
}

async function main() {
  const profile = requireRunner();
  verifyDatabase(profile);
  if (process.argv.length !== 3) throw new Error('Acción inválida.');
  if (process.argv[2] === 'bootstrap') { await bootstrapLocal(); return; }
  if (process.argv[2] !== 'catalog') throw new Error('Acción inválida.');
  const pool = localPool();
  try { console.log(JSON.stringify({ createdCodes: await initializeCatalog(pool) })); }
  finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/phase1/initialize.ts')) main().catch(fail);
