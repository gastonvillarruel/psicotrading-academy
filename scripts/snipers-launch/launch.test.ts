import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { isolatedEnv, readProfile, npmBackup, pgEnv, runPg, defaultBin } from '../phase0/local';
import { verifyDatabase } from '../phase1/guard';
import { initializeCatalog } from '../phase1/catalog';
import { assembleMigration, prepareMigration, reviewedBodies, migrationName, sha256 } from './prepare';
import { historicalMigrations, basicFilesMigration, launchConnection, launchPgEnv, privateDirectory, verifyIdentity, verifyMigrationHistory, type LaunchProfile } from './database';
import { initializeLaunch } from './initialize';
import { createAuthorizedBackup } from '../backup';
import { restoreVerify, verifyArchive } from './restore-verify';
import { r2Config, r2TestConfig } from '../../src/lib/snipers/upload-storage';
import { hash } from 'bcryptjs';

const directory = path.resolve('.local/snipers/launch-a');
privateDirectory(directory);
const local = readProfile(); verifyDatabase(local);
Object.assign(process.env, isolatedEnv(local), { SNIPERS_PHASE3A_LOCAL: '1', SNIPERS_NETWORK_TRACE: path.join(directory, `test-network-${Date.now()}.jsonl`) });
createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
const run = randomUUID().replace(/-/g, '').slice(0, 8);
const names = { candidate: `snipers_launch_case_${run}`, reference: `snipers_launch_ref_${run}`, failure: `snipers_launch_fail_${run}`, native: `snipers_launch_native_${run}`, restore: `snipers_launch_restore_${run}` };
const pools: Pool[] = [];
function profile(database: string): LaunchProfile {
  const url = new URL(local.DATABASE_URL); url.pathname = `/${database}`;
  return { SNIPERS_ENABLED: 'false', SNIPERS_LAUNCH_ENVIRONMENT: 'local', SNIPERS_LAUNCH_DATABASE_URL: url.toString(),
    SNIPERS_EXPECT_HOST: '127.0.0.1', SNIPERS_EXPECT_PORT: '55432', SNIPERS_EXPECT_DATABASE: database,
    SNIPERS_EXPECT_USER: 'snipers_local', PG_BIN: defaultBin };
}
function connect(database: string) {
  const p = new Pool({ connectionString: profile(database).SNIPERS_LAUNCH_DATABASE_URL, max: 4, connectionTimeoutMillis: 5000,
    options: '-c timezone=UTC -c statement_timeout=15000 -c lock_timeout=5000' }); pools.push(p); return p;
}
let candidate: Pool, reference: Pool;
function sql(database: string, text: string) { return runPg('psql', ['-X','-At','-v','ON_ERROR_STOP=1'], launchPgEnv(profile(database)), defaultBin, text); }
function snapshot(database: string) {
  return runPg('pg_dump', ['--schema-only','--no-owner','--no-privileges','--schema=public'], launchPgEnv(profile(database)), defaultBin)
    .replace(/^\\(?:un)?restrict .*\r?\n/gm, '').replace(/\r\n/g, '\n');
}
async function catalog(pool: Pool) {
  const queries = [
    `SELECT c.relname,k.conname,pg_get_constraintdef(k.oid,true) AS definition,k.condeferrable,k.condeferred FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.connamespace='public'::regnamespace ORDER BY 1,2`,
    `SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'snipers%' ORDER BY 1`,
    `SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY 1,2`,
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`,
    `SELECT t.typname,e.enumsortorder,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace='public'::regnamespace ORDER BY 1,2`,
  ];
  return Promise.all(queries.map(q => pool.query(q).then(r => r.rows)));
}

before(async () => {
  // The only privileged connection is the already isolated phase-0 localhost instance.
  const bootstrapFile = path.resolve('.local/snipers/bootstrap.env');
  const bootstrap = readProfile(bootstrapFile);
  const identity = JSON.parse(runPg('psql', ['-X','-At','-v','ON_ERROR_STOP=1'], pgEnv(bootstrap.DATABASE_URL), defaultBin,
    "SELECT json_build_object('database',current_database(),'user',current_user,'address',inet_server_addr(),'port',inet_server_port(),'data',current_setting('data_directory'));"));
  assert.equal(identity.database, 'postgres'); assert.equal(identity.user, 'snipers_bootstrap');
  assert.equal(identity.address, '127.0.0.1'); assert.equal(identity.port, 55432);
  assert.equal(path.resolve(identity.data), path.resolve('.local/snipers/postgres'));
  npmBackup(bootstrapFile);
  runPg('psql', ['-X','-v','ON_ERROR_STOP=1'], pgEnv(bootstrap.DATABASE_URL), defaultBin,
    Object.values(names).map(n => `CREATE DATABASE ${n} OWNER snipers_local;`).join('\n'));
  fs.writeFileSync(path.join(directory, `databases-${run}.json`), JSON.stringify(names), { flag: 'wx', mode: 0o600 });
  candidate = connect(names.candidate); reference = connect(names.reference);
  const base = fs.readFileSync('scripts/phase1/local-artifacts/init-local.sql', 'utf8')
    .replace(/DO \$local_only\$[\s\S]*?END \$local_only\$;\n/, '');
  assert.ok(!base.includes('LOCAL DEVELOPMENT ONLY: destination rejected'));
  for (const database of [names.candidate, names.reference, names.failure, names.native]) {
    // Mandatory backup of each dedicated, empty destination before SQL scripts.
    const file = path.join(directory, `${database}.profile`);
    const url = profile(database).SNIPERS_LAUNCH_DATABASE_URL;
    fs.writeFileSync(file, `SNIPERS_ENVIRONMENT=local\nDATABASE_URL="${url}"\nPG_BIN="${defaultBin}"\n`, { flag: 'wx', mode: 0o600 });
    npmBackup(file); sql(database, base);
  }
});
after(async () => { await Promise.all(pools.map(p => p.end())); });

test('deterministic migration, enum order and immutable output', () => {
  const first = prepareMigration(), second = prepareMigration();
  assert.equal(first.sha256, second.sha256); assert.equal(first.sha256, sha256(assembleMigration()));
  assert.equal((assembleMigration().match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((assembleMigration().match(/^COMMIT;/gm) ?? []).length, 1);
  const changed = path.join(directory, `immutable-${run}.sql`); fs.writeFileSync(changed, 'changed\n');
  assert.throws(() => prepareMigration(changed), /no se sobrescribe/); assert.equal(fs.readFileSync(changed, 'utf8'), 'changed\n');
});

test('atomic additive migration equals seven reviewed phases plus the authorized audit guard; preexisting schema/data unchanged', async () => {
  const id = randomUUID();
  await candidate.query(`INSERT INTO "User" (id,email,name,role,"updatedAt") VALUES ($1,$2,'Existing student','STUDENT',CURRENT_TIMESTAMP)`, [id, `${run}@existing.invalid`]);
  const before = (await candidate.query('SELECT * FROM "User"')).rows;
  const previous = await catalog(candidate);
  sql(names.candidate, assembleMigration());
  for (const body of reviewedBodies()) sql(names.reference, `BEGIN;\n${body}\nCOMMIT;`);
  sql(names.reference, `CREATE TRIGGER "snipers_preserve_audit_no_truncate" BEFORE TRUNCATE ON "SnipersAuditEvent"
    FOR EACH STATEMENT EXECUTE FUNCTION "snipers_preserve_audit"();`);
  assert.deepEqual(await catalog(candidate), await catalog(reference));
  assert.deepEqual((await candidate.query('SELECT * FROM "User"')).rows, before);
  const final = await catalog(candidate);
  for (let i=0; i<previous.length; i++) for (const row of previous[i]) assert.ok(final[i].some(r => JSON.stringify(r) === JSON.stringify(row)));
  // Also compare canonical dumps (table columns/defaults/indices, not only Prisma-supported features).
  assert.equal(snapshot(names.candidate), snapshot(names.reference));
  fs.writeFileSync(path.join(directory,`schema-${run}.json`),JSON.stringify({migrationSha256:sha256(assembleMigration()),
    reviewedChainPlusAuditGuardEquivalent:true,preexistingRowsUnchanged:true,preexistingObjectsPreserved:true,
    catalogSha256:sha256(JSON.stringify(final)),constraints:final[0].length,functions:final[1].length,triggers:final[2].length,
    localOnly:true,productionCompatibilityValidated:false},null,2),{flag:'wx',mode:0o600});
});

test('audit permits INSERT and rejects UPDATE, DELETE, TRUNCATE and cascading TRUNCATE', async () => {
  const tx = await candidate.connect(), id = randomUUID();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO "SnipersAuditEvent" (id,action,"entityType","entityId",payload)
      VALUES ($1,'CATALOG_INITIALIZED','SnipersPlan','audit-guard-probe','{"createdCodes":[]}')`, [id]);
    const before = (await tx.query('SELECT * FROM "SnipersAuditEvent" ORDER BY id')).rows;
    assert.ok(before.some(row => row.id === id));
    // Isolate CASCADE to this audit table, so a file-history trigger cannot mask failure.
    await tx.query('CREATE TABLE launch_audit_cascade_parent (id text PRIMARY KEY)');
    await tx.query(`ALTER TABLE "SnipersAuditEvent" ADD CONSTRAINT launch_audit_cascade_fkey
      FOREIGN KEY ("entityId") REFERENCES launch_audit_cascade_parent(id) NOT VALID`);
    for (const statement of [
      `UPDATE "SnipersAuditEvent" SET payload='{}' WHERE id='${id}'`,
      `DELETE FROM "SnipersAuditEvent" WHERE id='${id}'`,
      'TRUNCATE "SnipersAuditEvent"',
      'TRUNCATE launch_audit_cascade_parent CASCADE',
    ]) {
      await tx.query('SAVEPOINT audit_rejection');
      await assert.rejects(tx.query(statement), error => (error as { code?: string }).code === '23514'
        && (error as Error).message === 'Snipers audit is append-only');
      await tx.query('ROLLBACK TO SAVEPOINT audit_rejection');
      assert.deepEqual((await tx.query('SELECT * FROM "SnipersAuditEvent" ORDER BY id')).rows, before);
    }
  } finally { await tx.query('ROLLBACK'); tx.release(); }
});

test('forced failure rolls back every new object and leaves the baseline intact', () => {
  const before = snapshot(names.failure);
  assert.throws(() => sql(names.failure, assembleMigration().replace(/\nCOMMIT;\n$/, "\nSELECT 1/0;\nCOMMIT;\n")));
  assert.equal(snapshot(names.failure), before);
});

test('Prisma 7 validation and schema diff against the candidate', () => {
  const env = { ...isolatedEnv(local), DATABASE_URL: profile(names.candidate).SNIPERS_LAUNCH_DATABASE_URL,
    SNIPERS_LAUNCH_PROFILE: path.join(directory, `${names.candidate}.launch-profile`) };
  fs.writeFileSync(env.SNIPERS_LAUNCH_PROFILE, Object.entries(profile(names.candidate)).map(([k,v]) => `${k}="${v}"`).join('\n'), { flag: 'wx', mode: 0o600 });
  for (const args of [['validate'], ['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']]) {
    const r = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args, '--config','scripts/snipers-launch/prisma.config.ts'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    fs.writeFileSync(path.join(directory, `prisma-${args[0]}-${run}.log`), (r.stdout??'')+(r.stderr??''), { flag: 'wx', mode: 0o600 });
    assert.equal(r.status, 0, 'Prisma validation/diff failed; see private log.');
  }
});

test('SQL rejects invalid plans, overlapping coverage and unproven VERIFIED', async () => {
  await assert.rejects(candidate.query(`INSERT INTO "SnipersPlan" (id,code,name,"priceCents","durationDays","updatedAt") VALUES ($1,'INVALID','invalid',0,30,now())`, [randomUUID()]));
  const tx = await candidate.connect();
  try {
    await tx.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const user=(await tx.query('SELECT id FROM "User" LIMIT 1')).rows[0].id;
    const plan=randomUUID(), membership=randomUUID();
    await tx.query(`INSERT INTO "SnipersPlan" (id,code,name,"priceCents","durationDays","updatedAt") VALUES ($1,'TEST','test',3000,30,now())`,[plan]);
    await tx.query(`INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,now())`,[membership,user,plan]);
    await tx.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,now(),now()+interval '1 day','COURTESY','test',$4)`,[randomUUID(),membership,plan,user]);
    await assert.rejects(tx.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,now(),now()+interval '1 day','COURTESY','test',$4)`,[randomUUID(),membership,plan,user]));
  } finally { await tx.query('ROLLBACK'); tx.release(); }
  const cl=randomUUID();
  await candidate.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Test','{"type":"doc","content":[]}',now(),now())`,[cl]);
  await assert.rejects(candidate.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes",status,"updatedAt") VALUES ($1,$2,'Test','PDF','application/pdf',100,'VERIFIED',now())`,[randomUUID(),cl]));
});

test('initialization rolls back interruption, retries partial catalog and never reactivates supervisor', async () => {
  const userId = randomUUID(), email = `${run}@supervisor.invalid`;
  await candidate.query(`INSERT INTO "User" (id,email,role,"emailVerified","updatedAt") VALUES ($1,$2,'STUDENT',now(),now())`, [userId,email]);
  await assert.rejects(initializeLaunch(candidate, {userId,email:'wrong@invalid.invalid'}));
  await assert.rejects(initializeLaunch(candidate, {userId,email}, async () => { throw new Error('interruption'); }), /interruption/);
  assert.equal((await candidate.query('SELECT count(*)::int AS n FROM "SnipersPlan"')).rows[0].n, 0);
  assert.equal((await candidate.query('SELECT count(*)::int AS n FROM "UserPermission"')).rows[0].n, 0);
  await assert.rejects(initializeLaunch(candidate,{userId,email},async tx => {
    tx.on('error',()=>{}); await tx.query('SELECT pg_terminate_backend(pg_backend_pid())');
  }));
  assert.equal((await candidate.query('SELECT count(*)::int AS n FROM "SnipersPlan"')).rows[0].n,0);
  assert.equal((await candidate.query('SELECT count(*)::int AS n FROM "UserPermission"')).rows[0].n,0);
  // Existing catalog-only completion is a legitimate partial legacy operation.
  await initializeCatalog(candidate);
  await candidate.query(`UPDATE "SnipersPlan" SET name='Edited catalog',"priceCents"=3333,version=version+1 WHERE code='SNIPERS_LEVEL_1'`);
  const result = await initializeLaunch(candidate,{userId,email}); assert.equal(result.supervisorGranted,true); assert.deepEqual(result.createdCodes,[]);
  assert.deepEqual(await initializeLaunch(candidate,{userId,email}),{createdCodes:[],supervisorGranted:false});
  assert.equal((await candidate.query(`SELECT role FROM "User" WHERE id=$1`,[userId])).rows[0].role,'STUDENT');
  assert.equal((await candidate.query(`SELECT "priceCents" FROM "SnipersPlan" WHERE code='SNIPERS_LEVEL_1'`)).rows[0].priceCents,3333);
  await assert.rejects(candidate.query(`UPDATE "SnipersAuditEvent" SET payload='{}'::jsonb`));
  // Simulate a historical revocation in this disposable database; initialization must not revive it.
  const tx = await candidate.connect();
  try { await tx.query('BEGIN'); await tx.query(`UPDATE "UserPermission" SET "revokedAt"=now(),"revokedById"=$1 WHERE "userId"=$1`,[userId]); await tx.query('COMMIT'); }
  finally { tx.release(); }
  await assert.rejects(initializeLaunch(candidate,{userId,email}),/revocado/);
  assert.ok((await candidate.query(`SELECT "revokedAt" FROM "UserPermission" WHERE "userId"=$1`,[userId])).rows[0].revokedAt);
});

test('closed history gate detects missing, changed, unknown and failed records', async () => {
  const client=await reference.connect();
  try {
    await client.query(`CREATE TABLE _prisma_migrations (migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz)`);
    for (const m of historicalMigrations()) await client.query('INSERT INTO _prisma_migrations VALUES ($1,$2,now(),NULL)',[m.name,m.checksum]);
    await verifyMigrationHistory(client,false);
    for (const change of ["UPDATE _prisma_migrations SET checksum='changed'", 'UPDATE _prisma_migrations SET finished_at=NULL',
      "INSERT INTO _prisma_migrations VALUES ('unknown','x',now(),NULL)", 'DELETE FROM _prisma_migrations']) {
      await client.query('BEGIN'); await client.query(change); await assert.rejects(verifyMigrationHistory(client,false)); await client.query('ROLLBACK');
    }
    await assert.rejects(verifyMigrationHistory(client,true));
  } finally { client.release(); }
});

test('connection profiles reject implicit, crossed, pooling and unverified TLS before network', async () => {
  const p=profile(names.candidate); assert.equal(launchConnection(p).mode,'local');
  const changes: LaunchProfile[] = [{SNIPERS_ENABLED:'true'},{SNIPERS_EXPECT_DATABASE:'other'}, {SNIPERS_LAUNCH_DATABASE_URL:''},
    {SNIPERS_LAUNCH_ENVIRONMENT:'production'},{SNIPERS_LAUNCH_DATABASE_URL:p.SNIPERS_LAUNCH_DATABASE_URL+'&options=unsafe'}];
  for (const change of changes) assert.throws(()=>launchConnection({...p,...change}));
  const env=launchPgEnv(p); assert.equal(env.PGPASSWORD,new URL(local.DATABASE_URL).password); assert.equal(env.NODE_OPTIONS,undefined);
  const remote={...p,SNIPERS_LAUNCH_ENVIRONMENT:'production',SNIPERS_LAUNCH_DATABASE_URL:'postgresql://operator:synthetic@backup.invalid:5432/app?sslmode=verify-full',
    SNIPERS_EXPECT_HOST:'backup.invalid',SNIPERS_EXPECT_PORT:'5432',SNIPERS_EXPECT_DATABASE:'app',SNIPERS_EXPECT_USER:'operator'};
  assert.equal(launchConnection(remote).mode,'production');
  assert.throws(()=>launchConnection({...remote,SNIPERS_LAUNCH_DATABASE_URL:remote.SNIPERS_LAUNCH_DATABASE_URL.replace('verify-full','require')}));
  const file=path.join(directory,`remote-rejected-${run}.profile`);
  fs.writeFileSync(file,Object.entries(remote).map(([k,v])=>`${k}="${v}"`).join('\n'),{flag:'wx',mode:0o600});
  await assert.rejects(createAuthorizedBackup(file,false),/no autorizada/);
});

test('native Prisma deploy adds Snipers and its correction; repeated deploy is a no-op', async () => {
  const pool=connect(names.native),client=await pool.connect();
  try {
    await client.query(`CREATE TABLE _prisma_migrations (id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,
      finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0)`);
    for(const m of historicalMigrations()) await client.query('INSERT INTO _prisma_migrations (id,migration_name,checksum,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)',[randomUUID(),m.name,m.checksum]);
    await verifyMigrationHistory(client,false);
    const previous=(await client.query('SELECT * FROM _prisma_migrations ORDER BY migration_name')).rows;
    const file=path.join(directory,`${names.native}.launch-profile`);
    fs.writeFileSync(file,Object.entries(profile(names.native)).map(([k,v])=>`${k}="${v}"`).join('\n'),{flag:'wx',mode:0o600});
    const env={...isolatedEnv(local),SNIPERS_LAUNCH_PROFILE:file};
    await client.query("INSERT INTO _prisma_migrations (id,migration_name,checksum,finished_at) VALUES ($1,'unexpected','x',now())",[randomUUID()]);
    const blocked=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--config','scripts/snipers-launch/prisma.config.ts'],{env,encoding:'utf8',windowsHide:true,timeout:60000});
    assert.notEqual(blocked.status,0);assert.equal((await client.query(`SELECT to_regclass('public."SnipersPlan"') AS table`)).rows[0].table,null);
    await client.query("DELETE FROM _prisma_migrations WHERE migration_name='unexpected'");
    for(let i=0;i<2;i++) {
      const r=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--config','scripts/snipers-launch/prisma.config.ts'],{env,encoding:'utf8',windowsHide:true,timeout:60000});
      fs.writeFileSync(path.join(directory,`deploy-${run}-${i}.log`),(r.stdout??'')+(r.stderr??''),{flag:'wx',mode:0o600});
      assert.equal(r.status,0,'Native migration failed; see private log.');await verifyMigrationHistory(client,true);
    }
    assert.deepEqual((await client.query('SELECT * FROM _prisma_migrations WHERE migration_name<>ALL($1::text[]) ORDER BY migration_name',[[migrationName,basicFilesMigration]])).rows,previous);
  } finally {client.release();}
});

test('R2 strictly separates modes, previews, buckets and local fixtures without making network requests', () => {
  for (const mode of ['test','staging','production']) {
    const prefix=`SNIPERS_R2_${mode.toUpperCase()}_`;
    const env={ SNIPERS_R2_ENVIRONMENT:mode,SNIPERS_ENVIRONMENT:mode==='test'?'local':mode,
      [prefix+'ACCOUNT_ID']:'a'.repeat(32),[prefix+'BUCKET']:`snipers-${mode==='production'?'prod':mode}-launch`,[prefix+'ACCESS_KEY_ID']:'fixture',[prefix+'SECRET_ACCESS_KEY']:'fixture-secret' };
    assert.equal(r2Config(env).credentials.accessKeyId,'fixture');
    assert.throws(()=>r2Config({...env,[prefix+'BUCKET']:'snipers-other-crossed'}));
    assert.throws(()=>r2Config({...env,[prefix+'SECRET_ACCESS_KEY']:''}));
    assert.throws(()=>r2Config({...env,SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101'}));
    assert.throws(()=>r2Config({...env,[`SNIPERS_R2_${mode==='test'?'PRODUCTION':'TEST'}_ACCESS_KEY_ID`]:'crossed'}));
    if(mode==='production') { assert.throws(()=>r2Config({...env,VERCEL_ENV:'preview'}));assert.throws(()=>r2TestConfig(env)); }
    else assert.throws(()=>r2Config({...env,VERCEL_ENV:'production'}));
  }
  assert.throws(()=>r2Config({R2_ACCESS_KEY_ID:'ignored',AWS_SECRET_ACCESS_KEY:'ignored'}));
  assert.throws(()=>r2Config({SNIPERS_R2_ENVIRONMENT:'staging',SNIPERS_ENVIRONMENT:'staging',VERCEL_ENV:'preview',SNIPERS_R2_PRODUCTION_SECRET_ACCESS_KEY:'forbidden'}));
});

test('partial catalog and concurrent initialization preserve edits and grant exactly once',async()=>{
  const userId=randomUUID(),email=`${run}@partial.invalid`;
  await reference.query(`INSERT INTO "User" (id,email,role,"updatedAt") VALUES ($1,$2,'STUDENT',now())`,[userId,email]);
  await assert.rejects(initializeLaunch(reference,{userId,email}),/no verificado/);
  await reference.query(`UPDATE "User" SET "emailVerified"=now() WHERE id=$1`,[userId]);
  await reference.query(`INSERT INTO "SnipersPlan" (id,code,name,"priceCents","durationDays","updatedAt") VALUES ($1,'SNIPERS_LEVEL_1','Custom retained',3456,40,now())`,[randomUUID()]);
  const results=await Promise.all([initializeLaunch(reference,{userId,email}),initializeLaunch(reference,{userId,email})]);
  assert.equal(results.filter(r=>r.supervisorGranted).length,1);
  assert.equal(results.reduce((n,r)=>n+r.createdCodes.length,0),2);
  assert.deepEqual((await reference.query(`SELECT name,"priceCents","durationDays" FROM "SnipersPlan" WHERE code='SNIPERS_LEVEL_1'`)).rows[0],{name:'Custom retained',priceCents:3456,durationDays:40});
  assert.equal((await reference.query(`SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE action='PERMISSION_GRANTED'`)).rows[0].n,1);
});

test('application backup restores locally; restoration never certifies migration compatibility', async () => {
  await candidate.query('CREATE TABLE launch_backup_probe (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,payload jsonb NOT NULL)');
  await candidate.query(`INSERT INTO launch_backup_probe(payload) VALUES ('{"test":1}'),('{"test":2}')`);
  const p=profile(names.candidate), file=path.join(directory,`backup-${run}.profile`);
  fs.writeFileSync(file,Object.entries(p).map(([k,v])=>`${k}="${v}"`).join('\n'),{flag:'wx',mode:0o600});
  const backup=await createAuthorizedBackup(file,false,path.join(directory,`backup-${run}`));
  const manifest=await verifyArchive(backup.archive); assert.ok(manifest.sha256);
  const meta=JSON.parse(fs.readFileSync(backup.manifest,'utf8')); assert.equal(meta.completeSupabaseBackup,false);assert.equal(meta.restorationTested,false);
  assert.ok(!fs.readFileSync(backup.manifest,'utf8').includes(new URL(local.DATABASE_URL).password));
  const client=await candidate.connect(); try { await verifyIdentity(client,p); } finally {client.release();}
  // Provision only the declared trusted extension, before restoring into the otherwise empty destination.
  const emptyProfile=path.join(directory,`restore-${run}.profile`);
  fs.writeFileSync(emptyProfile,`SNIPERS_ENVIRONMENT=local\nDATABASE_URL="${profile(names.restore).SNIPERS_LAUNCH_DATABASE_URL}"\nPG_BIN="${defaultBin}"\n`,{flag:'wx',mode:0o600});
  npmBackup(emptyProfile); sql(names.restore,'CREATE EXTENSION btree_gist;');
  const report=path.join(directory,`restore-${run}.json`);
  assert.deepEqual(await restoreVerify(backup.archive,profile(names.restore),report),{restorationSucceeded:true,migrationCompatibilityValidated:false,objects:JSON.parse(fs.readFileSync(report,'utf8')).inventory.length});
  const restored=connect(names.restore);
  assert.deepEqual((await restored.query('SELECT * FROM "User" ORDER BY id')).rows,(await candidate.query('SELECT * FROM "User" ORDER BY id')).rows);
  assert.deepEqual(await catalog(restored),await catalog(candidate));
  assert.equal((await restored.query(`INSERT INTO launch_backup_probe(payload) VALUES ('{"test":3}') RETURNING id`)).rows[0].id,3);
  await assert.rejects(restoreVerify(backup.archive,profile(names.restore),path.join(directory,`repeat-${run}.json`)),/no vacío/);
  await assert.rejects(restoreVerify(backup.archive,p,path.join(directory,`source-${run}.json`)),/destino local dedicado/);
  const corrupt=path.join(directory,`corrupt-${run}.dump`);fs.copyFileSync(backup.archive,corrupt);fs.copyFileSync(backup.manifest,corrupt+'.json');fs.appendFileSync(corrupt,'corrupt');await assert.rejects(verifyArchive(corrupt));
});

test('compiled Node 22 campus: credential login, existing course/enrollment, disabled Snipers and logout', async () => {
  const pool=connect(names.native), userId=randomUUID(),courseId=randomUUID(),email=`${run}@campus.invalid`,password=randomUUID();
  await pool.query(`INSERT INTO "User" (id,email,name,password,role,"emailVerified","updatedAt") VALUES ($1,$2,'Launch campus student',$3,'STUDENT',now(),now())`,[userId,email,await hash(password,12)]);
  await pool.query(`INSERT INTO "Course" (id,slug,title,"shortDescription","longDescription",price,type) VALUES ($1,$2,'Legacy launch course','test','test',1,'RECORDED')`,[courseId,`launch-${run}`]);
  await pool.query(`INSERT INTO "Enrollment" (id,"userId","courseId") VALUES ($1,$2,$3)`,[randomUUID(),userId,courseId]);
  const {assertPortFree,startServer}=createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/server.cjs'));
  await assertPortFree(3112);
  const log=fs.createWriteStream(path.join(directory,`campus-${run}.log`),{flags:'wx',mode:0o600});
  const env:NodeJS.ProcessEnv={...isolatedEnv(local),DATABASE_URL:profile(names.native).SNIPERS_LAUNCH_DATABASE_URL,DIRECT_URL:'',
    NODE_ENV:'production',NEXTAUTH_URL:'http://127.0.0.1:3112',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3112',SNIPERS_PHASE3A_LOCAL:'1',
    NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"`,SNIPERS_NETWORK_TRACE:path.join(directory,`campus-${run}-network.jsonl`)};
  const server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3112'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']},3112,log);
  const cookies=new Map<string,string>();
  async function request(route:string,init:RequestInit={}) {
    const headers=new Headers(init.headers);headers.set('Cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
    const response=await fetch(`http://127.0.0.1:3112${route}`,{...init,headers,redirect:'manual'});
    for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
    return response;
  }
  try {
    await server.waitReady();
    assert.ok([302,303,307].includes((await request('/mi-campus')).status));
    const csrf=await (await request('/api/auth/csrf')).json();
    const login=await request('/api/auth/callback/credentials',{method:'POST',body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:'http://127.0.0.1:3112/mi-campus',json:'true'})});
    assert.equal(login.status,200);assert.equal((await (await request('/api/auth/session')).json()).user.id,userId);
    const campus=await request('/mi-campus');assert.equal(campus.status,200);const html=await campus.text();assert.ok(html.includes('Legacy launch course'));assert.ok(!html.includes('Grupo de Snipers'));
    assert.equal((await request(`/mi-campus/launch-${run}`)).status,200);
    assert.equal((await request('/mi-campus/snipers')).status,404);assert.equal((await request('/mi-campus/snipers/biblioteca')).status,404);
    await request('/api/auth/signout',{method:'POST',body:new URLSearchParams({csrfToken:csrf.csrfToken,json:'true'})});
    assert.ok(!(await (await request('/api/auth/session')).json()).user);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Enrollment" WHERE "userId"=$1 AND "courseId"=$2',[userId,courseId])).rows[0].n,1);
    fs.writeFileSync(path.join(directory,`campus-${run}.json`),JSON.stringify({login:true,existingCourse:true,enrollmentPreserved:true,disabledRoutes404:true,logout:true,persistentFlag:local.SNIPERS_ENABLED,localOnly:true}),{flag:'wx',mode:0o600});
  } finally {await server.stop();log.end();}
});
