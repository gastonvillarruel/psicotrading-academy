import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import { localPool, requireRunner, verifyDatabase } from '../phase1/guard';
import { withFileReceipt } from '../../src/lib/snipers/file-receipts';
import { changePermission, type Actor } from '../../src/lib/snipers/permissions';

const uuid = () => randomUUID();
const sha = 'a'.repeat(64);
type Fixture = { classId: string; resource: string; upload: string; prepare: string; temporary: string; process: string; final: string; key: string };
const errorCode = (error: unknown) => (error as { code?: string }).code;

test('3B-2A: PostgreSQL real, SQL directo, commit y concurrencia', { timeout: 240000 }, async t => {
  assert.equal(process.env.SNIPERS_PHASE3B2A_LOCAL, '1');
  const profile = requireRunner(); verifyDatabase(profile);
  const pool = localPool();
  const root: Actor = { userId: JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json', 'utf8')).userId, activeSessionId: null, singleSession: false };
  const run = async (body: (tx: PoolClient) => Promise<void>, commit = false, isolation = 'SERIALIZABLE') => {
    const tx = await pool.connect();
    try { await tx.query(`BEGIN ISOLATION LEVEL ${isolation}`); await body(tx); await tx.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { await tx.query('ROLLBACK'); throw error; }
    finally { tx.release(); }
  };
  async function rejects(tx: PoolClient, statement: string, params: unknown[] = [], code = '23514', message?: RegExp) {
    await tx.query('SAVEPOINT violation');
    let caught: unknown;
    try { await tx.query(statement, params); await tx.query('SET CONSTRAINTS ALL IMMEDIATE'); }
    catch (error) { caught = error; }
    await tx.query('ROLLBACK TO SAVEPOINT violation'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
    assert.ok(caught, 'La violación debe fallar, incluyendo al confirmar restricciones diferidas');
    assert.equal(errorCode(caught), code);
    if (message) assert.match((caught as Error).message, message);
  }
  async function claim(tx: PoolClient, job: string, milliseconds = 60000) {
    return (await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+$3*interval '1 millisecond'
      WHERE id=$1 AND (status IN ('READY','WAIT_RETRY') OR (status='RUNNING' AND "leaseUntil"<=clock_timestamp())) RETURNING generation`, [job, uuid(), milliseconds])).rowCount;
  }
  const finish = (tx: PoolClient, job: string) => tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=generation,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [job]);
  async function retire(tx: PoolClient, object: string, days: number) {
    await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp(),"cleanupAfter"=clock_timestamp()+$2*interval '1 day',"nextProbeAt"=clock_timestamp()+$2*interval '1 day' WHERE id=$1`, [object, days]);
  }
  async function make(tx: PoolClient, stage: 'pending' | 'uploading' | 'candidate' | 'verified' = 'pending'): Promise<Fixture> {
    const f: Fixture = { classId: uuid(), resource: uuid(), upload: uuid(), prepare: uuid(), temporary: uuid(), process: uuid(), final: uuid(), key: `snipers/final/${uuid()}` };
    await tx.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Fixture 3B-2A','{"type":"doc","content":[]}',clock_timestamp(),clock_timestamp())`, [f.classId]);
    await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Foundation fixture','PDF','application/pdf',10,clock_timestamp())`, [f.resource, f.classId]);
    await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()+interval '24 hours',clock_timestamp())`, [f.upload, f.resource, root.userId, sha]);
    await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PREPARE_UPLOAD',clock_timestamp())`, [f.prepare, f.resource, f.upload]);
    if (stage === 'pending') return f;
    await claim(tx, f.prepare);
    await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,1,'CREATE_MULTIPART','ACKNOWLEDGED',clock_timestamp())`, [f.temporary, f.resource, `snipers/temporary/${uuid()}`, f.prepare]);
    await tx.query(`UPDATE "SnipersUpload" SET status='UPLOADING',"temporaryObjectId"=$2,"multipartUploadId"=$3 WHERE id=$1`, [f.upload, f.temporary, `fixture-${uuid()}`]);
    await finish(tx, f.prepare);
    if (stage === 'uploading') return f;
    await tx.query(`UPDATE "SnipersUpload" SET status='COMPLETING',"completionManifest"='[{"partNumber":1,"etag":"opaque"}]',"manifestHash"=$2 WHERE id=$1`, [f.upload, sha]);
    await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PROCESS_UPLOAD',clock_timestamp())`, [f.process, f.resource, f.upload]);
    await claim(tx, f.process);
    await tx.query(`UPDATE "SnipersUpload" SET status='PROCESSING',"sourceSha256"=$2,"sourceSizeBytes"=10,"formatCheckedAt"=statement_timestamp(),"antivirusCheckedAt"=statement_timestamp(),"signaturePublishedAt"=statement_timestamp()-interval '1 hour',"signatureVersion"='fixture-1',"validationPolicyVersion"=1,"validationGeneration"=1 WHERE id=$1`, [f.upload, sha]);
    await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","verifiedSha256","verifiedSizeBytes","bytesVerifiedAt","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,1,'PUT_FINAL','BYTES_VERIFIED',$5,10,clock_timestamp(),clock_timestamp())`, [f.final, f.resource, f.key, f.process, sha]);
    if (stage === 'verified') await promote(tx, f);
    return f;
  }
  async function promote(tx: PoolClient, f: Fixture, checksum = sha) {
    const activated = (await tx.query('UPDATE "SnipersStorageObject" SET "activatedAt"=clock_timestamp() WHERE id=$1 RETURNING "activatedAt"', [f.final])).rows[0].activatedAt;
    await tx.query(`UPDATE "SnipersResource" SET status='VERIFIED',"verifiedAt"=$2,"objectKey"=$3,"finalObjectId"=$4,checksum=$5 WHERE id=$1`, [f.resource, activated, f.key, f.final, checksum]);
    await tx.query(`UPDATE "SnipersUpload" SET status='SUCCEEDED' WHERE id=$1`, [f.upload]);
    await finish(tx, f.process); await retire(tx, f.temporary, 1);
  }
  async function waitLock(pid: number) {
    for (let i = 0; i < 100; i++) {
      if ((await pool.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type=\'Lock\'', [pid])).rowCount) return;
      await delay(20);
    }
    assert.fail('No se observó espera real de bloqueo');
  }
  async function terminate(tx: PoolClient, f: Fixture, status: 'FAILED' | 'CANCELLED', rejected = false) {
    await tx.query(`UPDATE "SnipersResource" SET status=$2::"SnipersResourceStatus","archivedAt"=CASE WHEN $2::text='ARCHIVED' THEN clock_timestamp() END WHERE id=$1`, [f.resource, rejected ? 'REJECTED' : 'ARCHIVED']);
    await tx.query('UPDATE "SnipersUpload" SET status=$2 WHERE id=$1', [f.upload, status]);
    await tx.query(`UPDATE "SnipersFileJob" SET status=$2,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [f.process, status]);
    await retire(tx, f.temporary, 7);
    await tx.query(`UPDATE "SnipersStorageObject" SET "cleanupAfter"="retiredAt"+interval '7 days' WHERE id=$1`, [f.final]);
  }
  try {
    await t.test('catálogo real: FK compuestas y comprobaciones diferibles instaladas', async () => {
      const rows = (await pool.query(`SELECT conname,condeferrable,condeferred FROM pg_constraint WHERE conname IN ('SnipersResource_finalObjectId_id_fkey','SnipersUpload_temporaryObjectId_resourceId_fkey','SnipersFileJob_storageObjectId_resourceId_fkey')`)).rows;
      assert.equal(rows.length, 3); assert.ok(rows.every(r => r.condeferrable && r.condeferred));
      const triggers = (await pool.query(`SELECT tgname,tgdeferrable,tginitdeferred FROM pg_trigger WHERE tgname IN ('snipers_file_consistency','snipers_file_finalization')`)).rows;
      assert.equal(triggers.length, 6); assert.ok(triggers.every(r => r.tgdeferrable && r.tginitdeferred));
    });
    await t.test('preflight canónico rechaza historia incompatible sin repararla', async () => run(async tx => {
      // Session-local shadow reproduces a historical row before new constraints exist.
      // The canonical preflight is executed unchanged; public tables are not altered.
      await tx.query('CREATE TEMP TABLE "SnipersResource" (status "SnipersResourceStatus") ON COMMIT DROP');
      await tx.query('INSERT INTO pg_temp."SnipersResource" VALUES (\'VERIFIED\')');
      const preflight = fs.readFileSync('prisma/snipers-review/phase3b2a.sql', 'utf8').match(/DO \$preflight\$[\s\S]*?\$preflight\$;/)?.[0];
      assert.ok(preflight);
      await tx.query('SAVEPOINT history');
      await assert.rejects(tx.query(preflight), e => errorCode(e) === 'P0001' && /no automatic repair/.test((e as Error).message));
      await tx.query('ROLLBACK TO SAVEPOINT history');
      assert.equal((await tx.query('SELECT status FROM pg_temp."SnipersResource"')).rows[0].status, 'VERIFIED');
    }));
    await t.test('fixture histórico READ COMMITTED: clave reservada sin inventario y límites originales', async () => run(async tx => {
      const classId = uuid();
      await tx.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Historical','{}',clock_timestamp(),clock_timestamp())`, [classId]);
      await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"objectKey","mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Historical','PDF',$3,'application/pdf',10,clock_timestamp())`, [uuid(), classId, `private/${uuid()}.pdf`]);
      await rejects(tx, `INSERT INTO "SnipersResource" (id,"classId",name,type,"objectKey","mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Bad','PDF','https://invalid.local/file','application/pdf',10,clock_timestamp())`, [uuid(), classId]);
      await rejects(tx, `INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","expiresAt","updatedAt") SELECT $1,id,$2,$3,clock_timestamp()+interval '1 day',clock_timestamp() FROM "SnipersResource" WHERE "classId"=$4`, [uuid(), root.userId, sha, classId], '23514', /SERIALIZABLE/);
    }, true, 'READ COMMITTED'));

    for (const [type, mime, maximum] of [['MP3', 'audio/mpeg', 262144000], ['PDF', 'application/pdf', 26214400]] as const) {
      await t.test(`SQL directo: tamaño ${type} exacto, exceso, cero y MIME falso`, async () => run(async tx => {
        const f = await make(tx);
        for (const [size, mimeType, valid] of [[maximum, mime, true], [maximum + 1, mime, false], [0, mime, false], [10, 'text/html', false]] as const) {
          const statement = `INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Limit',$3,$4,$5,clock_timestamp())`;
          const params = [uuid(), f.classId, type, mimeType, size];
          if (valid) await tx.query(statement, params); else await rejects(tx, statement, params);
        }
      }));
    }
    await t.test('FK compuestas rechazan destinos de otro recurso', async () => run(async tx => {
      const a = await make(tx, 'candidate'); const b = await make(tx, 'candidate');
      const c = await make(tx, 'uploading');
      await tx.query('SET CONSTRAINTS "SnipersResource_finalObjectId_id_fkey" IMMEDIATE');
      await rejects(tx, 'UPDATE "SnipersResource" SET "finalObjectId"=$2,"verifiedAt"=clock_timestamp(),status=\'VERIFIED\',"objectKey"=$3,checksum=$4 WHERE id=$1', [a.resource, b.final, b.key, sha], '23503');
      await rejects(tx, `INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PROCESS_UPLOAD',clock_timestamp())`, [uuid(), a.resource, c.upload], '23503');
      await rejects(tx, `INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,1,clock_timestamp())`, [uuid(), a.resource, `snipers/temporary/${uuid()}`, b.process], '23503');
      const d = await make(tx);
      await tx.query('SET CONSTRAINTS "SnipersUpload_temporaryObjectId_resourceId_fkey" IMMEDIATE');
      await rejects(tx, `UPDATE "SnipersUpload" SET status='UPLOADING',"temporaryObjectId"=$2,"multipartUploadId"='fixture' WHERE id=$1`, [d.upload, b.final], '23503');
      await tx.query('SET CONSTRAINTS "SnipersFileJob_storageObjectId_resourceId_fkey" IMMEDIATE');
      await rejects(tx, `INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [uuid(), a.resource, b.final], '23503');
    }));
    await t.test('upload requiere trabajo; la violación diferida revierte COMMIT completo', async () => {
      const tx = await pool.connect(); const resource = uuid();
      try {
        await tx.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const classId = uuid();
        await tx.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Rollback','{}',clock_timestamp(),clock_timestamp())`, [classId]);
        await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Rollback','PDF','application/pdf',10,clock_timestamp())`, [resource, classId]);
        await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()+interval '1 day',clock_timestamp())`, [uuid(), resource, root.userId, sha]);
        await assert.rejects(tx.query('COMMIT'), e => errorCode(e) === '23514');
      } finally { await tx.query('ROLLBACK'); tx.release(); }
      assert.equal((await pool.query('SELECT 1 FROM "SnipersResource" WHERE id=$1', [resource])).rowCount, 0);
    });
    await t.test('CHECK: NULL no elude evidencia ni forma del lease', async () => run(async tx => {
      const f = await make(tx, 'candidate');
      await rejects(tx, `UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [f.process]);
      await rejects(tx, 'UPDATE "SnipersFileJob" SET "leaseToken"=NULL WHERE id=$1', [f.process]);
      await rejects(tx, 'UPDATE "SnipersResource" SET status=\'VERIFIED\' WHERE id=$1', [f.resource]);
      await rejects(tx, `INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeState","verifiedSha256","bytesVerifiedAt","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,1,'BYTES_VERIFIED',$5,clock_timestamp(),clock_timestamp())`, [uuid(), f.resource, `snipers/final/${uuid()}`, f.process, sha]);
    }));
    await t.test('manifiesto congelado: formato, partes y generación de validación', async () => run(async tx => {
      const f = await make(tx, 'uploading');
      for (const manifest of ['[]', '[{"partNumber":2,"etag":"x"}]', '[{"partNumber":1,"etag":"x","extra":true}]', '[{"partNumber":1,"etag":"x"},{"partNumber":2,"etag":"y"}]']) {
        await rejects(tx, `WITH sealed AS (UPDATE "SnipersUpload" SET status='COMPLETING',"completionManifest"=$2::jsonb,"manifestHash"=$3 WHERE id=$1 RETURNING id,"resourceId") INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") SELECT $4,"resourceId",id,'PROCESS_UPLOAD',clock_timestamp() FROM sealed`, [f.upload, manifest, sha, uuid()]);
      }
      const c = await make(tx, 'candidate');
      await rejects(tx, `UPDATE "SnipersUpload" SET "completionManifest"='[{"partNumber":1,"etag":"other"}]' WHERE id=$1`, [c.upload]);
      await rejects(tx, 'UPDATE "SnipersUpload" SET "validationGeneration"=2 WHERE id=$1', [c.upload]);
      await rejects(tx, 'UPDATE "SnipersUpload" SET "expectedSha256"=$2 WHERE id=$1', [c.upload, 'b'.repeat(64)]);
    }));
    await t.test('prueba final completa es atómica y validar no vincula', async () => {
      let f!: Fixture;
      await run(async tx => { f = await make(tx, 'verified'); }, true);
      const r = (await pool.query('SELECT status,"attachedAt",checksum FROM "SnipersResource" WHERE id=$1', [f.resource])).rows[0];
      assert.deepEqual(r, { status: 'VERIFIED', attachedAt: null, checksum: sha });
      await run(async tx => {
        await rejects(tx, 'UPDATE "SnipersResource" SET checksum=$2 WHERE id=$1', [f.resource, 'b'.repeat(64)]);
        await rejects(tx, 'UPDATE "SnipersResource" SET "classId"=$2 WHERE id=$1', [f.resource, uuid()]);
        await rejects(tx, 'UPDATE "SnipersStorageObject" SET "verifiedSizeBytes"=11 WHERE id=$1', [f.final]);
        await rejects(tx, 'UPDATE "SnipersFileJob" SET status=\'READY\',"completedGeneration"=NULL WHERE id=$1', [f.process]);
        await rejects(tx, 'UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp(),"cleanupAfter"=clock_timestamp()+interval \'7 days\',"nextProbeAt"=clock_timestamp()+interval \'7 days\' WHERE id=$1', [f.final]);
      });
    });
    await t.test('resultados parciales de preparación y procesamiento no confirman', async () => run(async tx => {
      const pending = await make(tx); await claim(tx, pending.prepare);
      await rejects(tx, `UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=generation,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [pending.prepare], '23514', /acknowledged atomically/);
      const candidate = await make(tx, 'candidate');
      await rejects(tx, `UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=generation,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [candidate.process], '23514', /finalized atomically/);
    }));
    await t.test('hash discordante revierte prueba, trabajo y recurso al confirmar', async () => run(async tx => {
      const f = await make(tx, 'candidate');
      await tx.query('SAVEPOINT bad_proof');
      await promote(tx, f, 'b'.repeat(64));
      await assert.rejects(tx.query('SET CONSTRAINTS ALL IMMEDIATE'), e => errorCode(e) === '23514');
      await tx.query('ROLLBACK TO SAVEPOINT bad_proof'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
      assert.equal((await tx.query('SELECT status FROM "SnipersResource" WHERE id=$1', [f.resource])).rows[0].status, 'PENDING');
    }));
    await t.test('retiro irreversible, destinos no reutilizables y limpieza sólo de retirados', async () => run(async tx => {
      const f = await make(tx, 'candidate');
      await rejects(tx, `INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [uuid(), f.resource, f.final]);
      await retire(tx, f.final, 1);
      await tx.query('SET CONSTRAINTS ALL IMMEDIATE'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET "retiredAt"=NULL,"cleanupAfter"=NULL,"nextProbeAt"=NULL WHERE id=$1', [f.final]);
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET "activatedAt"=clock_timestamp() WHERE id=$1', [f.final]);
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET key=$2 WHERE id=$1', [f.final, `snipers/final/${uuid()}`]);
      await rejects(tx, 'DELETE FROM "SnipersStorageObject" WHERE id=$1', [f.final]);
      await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [uuid(), f.resource, f.final]);
      await rejects(tx, `INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [uuid(), f.resource, f.final], '23505');
      await tx.query('SET CONSTRAINTS ALL IMMEDIATE');
      await rejects(tx, 'TRUNCATE "SnipersResource","SnipersUpload","SnipersFileJob","SnipersStorageObject"', [], '23514', /history is permanent/);
    }));
    await t.test('archivo terminal exige retirar el definitivo en la misma transacción', async () => run(async tx => {
      const f = await make(tx, 'verified');
      await rejects(tx, `UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp() WHERE id=$1`, [f.resource]);
      await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp() WHERE id=$1`, [f.resource]);
      await retire(tx, f.final, 7);
      await tx.query('SET CONSTRAINTS ALL IMMEDIATE'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
      await rejects(tx, `UPDATE "SnipersResource" SET status='VERIFIED',"archivedAt"=NULL WHERE id=$1`, [f.resource]);
      await rejects(tx, 'UPDATE "SnipersResource" SET "attachedAt"=clock_timestamp() WHERE id=$1', [f.resource]);
    }));
    await t.test('SQL directo: cada evidencia de validación es obligatoria y concordante', async () => run(async tx => {
      const f = await make(tx, 'candidate');
      const mutations = [
        '"sourceSha256"=NULL', '"sourceSizeBytes"=11', '"formatCheckedAt"=NULL', '"antivirusCheckedAt"=NULL',
        '"signatureVersion"=NULL', '"signaturePublishedAt"=clock_timestamp()-interval \'73 hours\'', '"validationPolicyVersion"=NULL',
      ];
      for (const mutation of mutations) {
        await tx.query('SAVEPOINT proof');
        await tx.query(`UPDATE "SnipersUpload" SET ${mutation} WHERE id=$1`, [f.upload]);
        await promote(tx, f);
        await assert.rejects(tx.query('SET CONSTRAINTS ALL IMMEDIATE'), e => errorCode(e) === '23514');
        await tx.query('ROLLBACK TO SAVEPOINT proof'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
      }
    }));
    await t.test('SQL directo: UUID, identidades, uniqueness, tipos y retención mínima', async () => run(async tx => {
      const f = await make(tx, 'candidate');
      await rejects(tx, 'UPDATE "SnipersFileJob" SET "leaseToken"=\'not-a-uuid\' WHERE id=$1', [f.process], '22P02');
      await rejects(tx, 'UPDATE "SnipersFileJob" SET "resourceId"=$2 WHERE id=$1', [f.process, uuid()]);
      await rejects(tx, 'UPDATE "SnipersUpload" SET "creatorId"=$2 WHERE id=$1', [f.upload, uuid()]);
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET "producerGeneration"=2 WHERE id=$1', [f.final]);
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET "writeOperation"=\'CREATE_MULTIPART\' WHERE id=$1', [f.final]);
      await rejects(tx, `INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PREPARE_UPLOAD',clock_timestamp())`, [uuid(), f.resource, f.upload], '23505');
      await rejects(tx, `INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,1,clock_timestamp())`, [uuid(), f.resource, f.key, f.process], '23505');
      await rejects(tx, 'UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp(),"cleanupAfter"=clock_timestamp(),"nextProbeAt"=clock_timestamp() WHERE id=$1', [f.final]);
      await rejects(tx, 'DELETE FROM "SnipersUpload" WHERE id=$1', [f.upload]);
      await rejects(tx, 'DELETE FROM "SnipersFileJob" WHERE id=$1', [f.process]);
      await rejects(tx, 'DELETE FROM "SnipersResource" WHERE id=$1', [f.resource]);
    }));
    await t.test('retirado quiescente conserva marca y no se reactiva por cambiar observaciones', async () => run(async tx => {
      const f = await make(tx, 'candidate'); await retire(tx, f.final, 1);
      await tx.query('UPDATE "SnipersStorageObject" SET "lastProbeAt"=statement_timestamp(),"lastAbsentAt"=statement_timestamp(),"cleanupState"=\'QUIESCENT\' WHERE id=$1', [f.final]);
      await tx.query('SET CONSTRAINTS ALL IMMEDIATE'); await tx.query('SET CONSTRAINTS ALL DEFERRED');
      await tx.query('UPDATE "SnipersStorageObject" SET "cleanupState"=\'PENDING\',"lastProbeAt"=clock_timestamp() WHERE id=$1', [f.final]);
      assert.ok((await tx.query('SELECT "retiredAt" FROM "SnipersStorageObject" WHERE id=$1', [f.final])).rows[0].retiredAt);
      await rejects(tx, 'UPDATE "SnipersResource" SET "attachedAt"=clock_timestamp() WHERE id=$1', [f.resource]);
    }));

    for (const archiveFirst of [true, false]) {
      await t.test(`conexiones independientes: ${archiveFirst ? 'retiro' : 'activación'} primero, espera observada y commit`, async () => {
        let f!: Fixture; await run(async tx => { f = await make(tx, 'candidate'); }, true);
        const a = await pool.connect(); const b = await pool.connect();
        try {
          await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          const pid = (await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
          if (archiveFirst) await retire(a, f.final, 1); else await promote(a, f);
          const competing = (archiveFirst ? promote(b, f) : retire(b, f.final, 7)).then(() => null, error => error);
          await waitLock(pid); await a.query('COMMIT');
          const error = await competing; assert.equal(errorCode(error), '40001'); await b.query('ROLLBACK');
          const r = (await pool.query('SELECT r.status,o."retiredAt" FROM "SnipersResource" r JOIN "SnipersStorageObject" o ON o.id=$2 WHERE r.id=$1', [f.resource, f.final])).rows[0];
          assert.equal(r.status, archiveFirst ? 'PENDING' : 'VERIFIED'); assert.equal(r.retiredAt !== null, archiveFirst);
        } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
      });
    }
    await t.test('SKIP LOCKED, takeover y CAS obsoleto usan PostgreSQL real', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const a = await pool.connect(); const b = await pool.connect();
      try {
        await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await claim(a, f.prepare, 300);
        await a.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,1,clock_timestamp())`, [f.temporary, f.resource, `snipers/temporary/${uuid()}`, f.prepare]);
        assert.equal((await b.query('SELECT id FROM "SnipersFileJob" WHERE id=$1 FOR UPDATE SKIP LOCKED', [f.prepare])).rowCount, 0);
        const old = (await a.query('SELECT generation,"leaseToken" FROM "SnipersFileJob" WHERE id=$1', [f.prepare])).rows[0];
        await a.query('COMMIT'); await b.query('ROLLBACK');
        while (!(await pool.query('SELECT "leaseUntil"<=clock_timestamp() expired FROM "SnipersFileJob" WHERE id=$1', [f.prepare])).rows[0].expired) await delay(20);
        await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); assert.equal(await claim(b, f.prepare), 1); await b.query('COMMIT');
        await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        assert.equal((await a.query('UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval \'60 seconds\' WHERE id=$1 AND generation=$2 AND "leaseToken"=$3 AND "leaseUntil">clock_timestamp()', [f.prepare, old.generation, old.leaseToken])).rowCount, 0);
        await rejects(a, `INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,1,clock_timestamp())`, [uuid(), f.resource, `snipers/temporary/${uuid()}`, f.prepare]);
        await rejects(a, `UPDATE "SnipersStorageObject" SET "writeOperation"='CREATE_MULTIPART',"writeState"='ACKNOWLEDGED' WHERE id=$1`, [f.temporary]);
        await a.query('ROLLBACK');
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });
    await t.test('recibo concurrente: una modificación y un evento; replay no reescribe', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const command = { operationId: uuid(), resourceId: f.resource, objectId: null, kind: 'INVENTORY_RECORDED' };
      const work = async (tx: PoolClient) => { await tx.query('SELECT id FROM "SnipersClass" WHERE id=$1 FOR UPDATE', [f.classId]); await tx.query('UPDATE "SnipersClass" SET version=version+1 WHERE id=$1', [f.classId]); return true; };
      const receipts = await Promise.all([withFileReceipt(pool, root, command, work), withFileReceipt(pool, root, command, work)]);
      assert.equal(receipts.filter(r => r.replayed).length, 1);
      assert.equal((await pool.query('SELECT version FROM "SnipersClass" WHERE id=$1', [f.classId])).rows[0].version, 2);
      assert.equal((await pool.query('SELECT 1 FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rowCount, 1);
      await assert.rejects(withFileReceipt(pool, root, { ...command, objectId: uuid() }, work), e => errorCode(e) === 'IDEMPOTENCY_CONFLICT');
    });
    await t.test('fallo diferido revierte también el recibo insertado y la versión', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx, 'uploading'); }, true);
      const command = { operationId: uuid(), resourceId: f.resource, objectId: f.temporary, kind: 'OBJECT_RETIRED' };
      await assert.rejects(withFileReceipt(pool, root, command, async tx => {
        await tx.query('UPDATE "SnipersClass" SET version=version+1 WHERE id=$1', [f.classId]);
        await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [uuid(), f.resource, f.temporary]);
        return true;
      }), e => errorCode(e) === '23514');
      assert.equal((await pool.query('SELECT version FROM "SnipersClass" WHERE id=$1', [f.classId])).rows[0].version, 1);
      assert.equal((await pool.query('SELECT 1 FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rowCount, 0);
    });
    await t.test('recibos reautorizan antes de replay y no heredan ADMIN global', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const actor: Actor = { userId: uuid(), activeSessionId: null, singleSession: false };
      await pool.query(`INSERT INTO "User" (id,email,role,"updatedAt") VALUES ($1,$2,'ADMIN',clock_timestamp())`, [actor.userId, `${actor.userId}@local.invalid`]);
      const command = { operationId: uuid(), resourceId: f.resource, objectId: null, kind: 'INVENTORY_RECORDED' };
      await assert.rejects(withFileReceipt(pool, actor, command, async () => false), e => errorCode(e) === 'FORBIDDEN');
      await changePermission(pool, root, actor.userId, 'SNIPERS_CONTENT_EDITOR', true);
      await withFileReceipt(pool, actor, command, async () => false);
      await changePermission(pool, root, actor.userId, 'SNIPERS_CONTENT_EDITOR', false);
      await assert.rejects(withFileReceipt(pool, actor, command, async () => false), e => errorCode(e) === 'FORBIDDEN');
    });

    for (const [name, status, rejected] of [['rechazo', 'FAILED', true], ['cancelación', 'CANCELLED', false], ['fallo', 'FAILED', false]] as const) {
      await t.test(`retiro 24h seguido de ${name}: extensión atómica, sin reactivación`, async () => {
        let f!: Fixture; let before!: { retiredAt: Date; cleanupAfter: Date };
        await run(async tx => {
          f = await make(tx, 'candidate'); await retire(tx, f.final, 1);
          before = (await tx.query('SELECT "retiredAt","cleanupAfter" FROM "SnipersStorageObject" WHERE id=$1', [f.final])).rows[0];
        }, true);
        await run(async tx => { await terminate(tx, f, status, rejected); }, true);
        const row = (await pool.query('SELECT "retiredAt","cleanupAfter","nextProbeAt","activatedAt" FROM "SnipersStorageObject" WHERE id=$1', [f.final])).rows[0];
        assert.equal(row.retiredAt.getTime(), before.retiredAt.getTime());
        assert.equal(row.cleanupAfter.getTime() - row.retiredAt.getTime(), 7 * 86400000);
        assert.ok(row.nextProbeAt >= row.cleanupAfter); assert.equal(row.activatedAt, null);
        assert.equal((await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1', [f.upload])).rows[0].status, status);
        await run(async tx => {
          await rejects(tx, `UPDATE "SnipersStorageObject" SET "cleanupAfter"="cleanupAfter"-interval '1 second' WHERE id=$1`, [f.final], '23514', /cannot decrease/);
          await rejects(tx, `UPDATE "SnipersStorageObject" SET "retiredAt"="retiredAt"+interval '1 second' WHERE id=$1`, [f.final], '23514', /irreversible/);
          await rejects(tx, `UPDATE "SnipersStorageObject" SET "cleanupAfter"="cleanupAfter"+interval '1 day' WHERE id=$1`, [f.final], '23514', /policy justification/);
        });
      });
    }
    for (const extensionFirst of [true, false]) {
      await t.test(`retención vs reclamación: ${extensionFirst ? 'extensión' : 'claim'} primero, bloqueo y fencing durable`, async () => {
        let f!: Fixture; const cleaner = uuid();
        await run(async tx => {
          f = await make(tx, 'candidate');
          await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp()-interval '2 days',"cleanupAfter"=clock_timestamp()-interval '1 day',"nextProbeAt"=clock_timestamp()-interval '1 day' WHERE id=$1`, [f.final]);
          await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`, [cleaner, f.resource, f.final]);
        }, true);
        const a = await pool.connect(); const b = await pool.connect(); let token: string | undefined;
        try {
          await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          const pidA = (await a.query('SELECT pg_backend_pid() pid')).rows[0].pid;
          const pidB = (await b.query('SELECT pg_backend_pid() pid')).rows[0].pid; assert.notEqual(pidA, pidB);
          if (extensionFirst) {
            await terminate(a, f, 'FAILED');
            const pending = claim(b, cleaner).then(() => null, e => e);
            await waitLock(pidB); await a.query('COMMIT');
            assert.equal(errorCode(await pending), '40001'); await b.query('ROLLBACK');
          } else {
            await b.query('SELECT id FROM "SnipersStorageObject" WHERE id=$1 FOR UPDATE', [f.final]);
            assert.equal(await claim(b, cleaner), 1);
            token = (await b.query('SELECT "leaseToken" FROM "SnipersFileJob" WHERE id=$1', [cleaner])).rows[0].leaseToken;
            const pending = terminate(a, f, 'FAILED').then(() => null, e => e);
            await waitLock(pidA); await b.query('COMMIT');
            assert.equal(errorCode(await pending), '40001'); await a.query('ROLLBACK');
            await run(async tx => { await terminate(tx, f, 'FAILED'); }, true);
          }
        } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
        const job = (await pool.query('SELECT status,"leaseToken","availableAt" FROM "SnipersFileJob" WHERE id=$1', [cleaner])).rows[0];
        const object = (await pool.query('SELECT "cleanupAfter","nextProbeAt","retiredAt" FROM "SnipersStorageObject" WHERE id=$1', [f.final])).rows[0];
        assert.equal(job.status, 'WAIT_RETRY'); assert.equal(job.leaseToken, null);
        assert.ok(job.availableAt >= object.cleanupAfter); assert.ok(object.nextProbeAt >= object.cleanupAfter); assert.ok(object.retiredAt);
        await run(async tx => {
          if (token) assert.equal((await tx.query(`UPDATE "SnipersFileJob" SET phase='DELETE' WHERE id=$1 AND generation=1 AND "leaseToken"=$2`, [cleaner, token])).rowCount, 0);
          assert.equal((await tx.query('SELECT 1 FROM "SnipersFileJob" WHERE id=$1 AND "availableAt"<=clock_timestamp()', [cleaner])).rowCount, 0);
          await rejects(tx, `UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '30 seconds' WHERE id=$1`, [cleaner, uuid()], '23514', /Invalid generation claim/);
          await tx.query('UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE id=$1', [cleaner]);
          await rejects(tx, `UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '30 seconds' WHERE id=$1`, [cleaner, uuid()], '23514', /not due/);
        });
      });
    }
    await t.test('write skew real: terminación vs candidato de otra fila no confirman juntos', async () => {
      let f!: Fixture; const candidate = uuid();
      await run(async tx => {
        f = await make(tx, 'candidate'); await retire(tx, f.final, 1);
        await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [f.process]);
        assert.equal(await claim(tx, f.process), 1);
      }, true);
      const a = await pool.connect(); const b = await pool.connect();
      try {
        await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        // Both SQL reads finish before either write: independent snapshots form the barrier.
        assert.equal((await a.query('SELECT count(*)::int n FROM "SnipersStorageObject" WHERE "resourceId"=$1', [f.resource])).rows[0].n, 2);
        assert.equal((await b.query('SELECT status FROM "SnipersFileJob" WHERE id=$1', [f.process])).rows[0].status, 'RUNNING');
        await terminate(a, f, 'FAILED'); await a.query('SET CONSTRAINTS ALL IMMEDIATE');
        let loser: unknown;
        try {
          await b.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,2,clock_timestamp())`, [candidate, f.resource, `snipers/final/${uuid()}`, f.process]);
          await b.query('SET CONSTRAINTS ALL IMMEDIATE');
        } catch (e) { loser = e; }
        await a.query('COMMIT');
        if (!loser) { try { await b.query('COMMIT'); } catch (e) { loser = e; } }
        assert.equal(errorCode(loser), '40001');
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
      assert.equal((await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1', [f.upload])).rows[0].status, 'FAILED');
      assert.equal((await pool.query('SELECT 1 FROM "SnipersStorageObject" WHERE id=$1', [candidate])).rowCount, 0);
    });
    for (const collision of ['key', 'producer'] as const) {
      await t.test(`unicidad aislada de ${collision}: nombre de restricción exacto`, async () => run(async tx => {
        const a = await make(tx, 'candidate'); const b = await make(tx, 'candidate');
        if (collision === 'key') {
          await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [b.process]);
          assert.equal(await claim(tx, b.process), 1);
        }
        await tx.query('SAVEPOINT isolated_unique');
        let caught: unknown;
        try {
          await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,$5,clock_timestamp())`, [uuid(), b.resource, collision === 'key' ? a.key : `snipers/final/${uuid()}`, b.process, collision === 'key' ? 2 : 1]);
        } catch (e) { caught = e; }
        await tx.query('ROLLBACK TO SAVEPOINT isolated_unique');
        assert.equal(errorCode(caught), '23505');
        assert.equal((caught as { constraint: string }).constraint, collision === 'key' ? 'SnipersStorageObject_key_key' : 'SnipersStorageObject_producerJobId_producerGeneration_kind_key');
      }));
    }
    await t.test('recibo: barrera fuerza 23505 real y conciliación, sin repetir trabajo', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const command = { operationId: uuid(), resourceId: f.resource, objectId: null, kind: 'INVENTORY_RECORDED' };
      const { digest } = await import('../../src/lib/snipers/preview');
      let opened!: () => void; let resume!: () => void;
      const entered = new Promise<void>(resolve => { opened = resolve; }); const barrier = new Promise<void>(resolve => { resume = resolve; });
      const errors: string[] = []; let workCalls = 0;
      // Observe genuine pg errors; every query, connection, commit and rollback reaches PostgreSQL.
      const observed = { connect: async () => {
        const client = await pool.connect();
        return { query: async (text: string, values?: unknown[]) => {
          try { return await client.query(text, values); } catch (e) { errors.push(errorCode(e) ?? 'UNKNOWN'); throw e; }
        }, release: () => client.release() } as PoolClient;
      } } as Pool;
      const pending = withFileReceipt(observed, root, command, async () => { workCalls++; opened(); await barrier; return true; });
      try {
        await entered;
        await run(async tx => {
          await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`, [command.operationId, root.userId, f.resource, JSON.stringify({ formatVersion: 1, commandHash: digest(command), result: { ...command, changed: true } })]);
        }, true);
      } finally { resume(); }
      const receipt = await pending;
      assert.deepEqual(errors, ['23505']); assert.equal(workCalls, 1); assert.equal(receipt.replayed, true);
      assert.equal((await pool.query('SELECT 1 FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rowCount, 1);
    });
    await t.test('UUID ajeno: dos editores vigentes, conflicto sin ejecutar callback', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const editors: Actor[] = Array.from({ length: 2 }, () => ({ userId: uuid(), activeSessionId: null, singleSession: false }));
      for (const editor of editors) {
        await pool.query(`INSERT INTO "User" (id,email,role,"updatedAt") VALUES ($1,$2,'STUDENT',clock_timestamp())`, [editor.userId, `${editor.userId}@local.invalid`]);
        await changePermission(pool, root, editor.userId, 'SNIPERS_CONTENT_EDITOR', true);
      }
      const command = { operationId: uuid(), resourceId: f.resource, objectId: null, kind: 'INVENTORY_RECORDED' };
      await withFileReceipt(pool, editors[0], command, async () => false);
      let calls = 0;
      await assert.rejects(withFileReceipt(pool, editors[1], command, async () => { calls++; return true; }), e => errorCode(e) === 'IDEMPOTENCY_CONFLICT');
      assert.equal(calls, 0);
      assert.equal((await pool.query('SELECT "actorUserId" FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rows[0].actorUserId, editors[0].userId);
    });
    await t.test('ETag SQL rechaza controles y contrato coincide con clasificación local', async () => run(async tx => {
      const { completionManifest } = await import('../../src/lib/snipers/file-contracts');
      const f = await make(tx, 'uploading');
      for (const code of [...Array.from({ length: 31 }, (_, i) => i + 1), ...Array.from({ length: 33 }, (_, i) => i + 127)]) {
        const etag = `x${String.fromCharCode(code)}y`;
        assert.equal((await tx.query(`SELECT $1::text ~ '[[:cntrl:]]' AS forbidden`, [etag])).rows[0].forbidden, true);
        assert.equal(completionManifest.safeParse([{ partNumber: 1, etag }]).success, false);
        await rejects(tx, `WITH sealed AS (UPDATE "SnipersUpload" SET status='COMPLETING',"completionManifest"=$2::jsonb,"manifestHash"=$3 WHERE id=$1 RETURNING id,"resourceId") INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") SELECT $4,"resourceId",id,'PROCESS_UPLOAD',clock_timestamp() FROM sealed`, [f.upload, JSON.stringify([{ partNumber: 1, etag }]), sha, uuid()], '23514', /manifest parts/);
      }
      // PostgreSQL text/jsonb rejects NUL before the manifest checker can run.
      await rejects(tx, `UPDATE "SnipersUpload" SET "completionManifest"=$2::jsonb WHERE id=$1`, [f.upload, JSON.stringify([{ partNumber: 1, etag: 'x\0y' }])], '22P05');
    }));
    await t.test('costo acotado: 1/10/50/100/200 generaciones y objetos retirados', async () => {
      let f!: Fixture; await run(async tx => { f = await make(tx); }, true);
      const samples = []; let generation = 0;
      for (const count of [1, 10, 50, 100, 200]) {
        await run(async tx => {
          for (; generation < count; generation++) {
            assert.equal(await claim(tx, f.prepare), 1); const object = uuid();
            await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,$5,clock_timestamp())`, [object, f.resource, `snipers/temporary/${uuid()}`, f.prepare, generation + 1]);
            await retire(tx, object, 0);
            await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [f.prepare]);
          }
        }, true);
        const checkMs = []; const commitMs = [];
        for (let i = 0; i < 7; i++) {
          const client = await pool.connect();
          try {
            const start = performance.now(); await client.query('SELECT snipers_file_check_resource($1)', [f.resource]); checkMs.push(performance.now() - start);
            await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
            await client.query('UPDATE "SnipersFileJob" SET "updatedAt"=clock_timestamp() WHERE id=$1', [f.prepare]);
            const beforeCommit = performance.now(); await client.query('COMMIT'); commitMs.push(performance.now() - beforeCommit);
          } finally { await client.query('ROLLBACK'); client.release(); }
        }
        const median = (values: number[]) => [...values].sort((a, b) => a - b)[3];
        samples.push({ objects: count, generations: count, checkMedianMs: median(checkMs), deferredCommitMedianMs: median(commitMs), checkMs, commitMs });
      }
      assert.equal((await pool.query('SELECT count(*)::int n FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND "retiredAt" IS NOT NULL', [f.resource])).rows[0].n, 200);
      fs.writeFileSync('.local/snipers/phase3b2a/history-cost.json', JSON.stringify({ synthetic: true, resourceId: f.resource, samples, optimized: false }, null, 2));
      console.log('HISTORY_COST', JSON.stringify(samples.map(({ objects, checkMedianMs, deferredCommitMedianMs }) => ({ objects, checkMedianMs, deferredCommitMedianMs }))));
    });
  } finally { await pool.end(); }
});
