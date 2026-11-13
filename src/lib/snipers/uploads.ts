// Trusted core: session-bound facade supplies the actor. All remote I/O is outside SQL transactions.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { parse } from './contracts';
import { requirePermission, transaction, type Actor } from './permissions';
import { digest } from './preview';
import { reject } from './errors';
import * as c from './upload-contracts';
import type { MultipartStorage } from './upload-storage';

export type UploadRow = { id: string; resourceId: string; creatorId: string; status: c.UploadState['status'];
  singleObject:boolean;
  expiresAt: Date; temporaryObjectId: string | null; multipartUploadId: string | null;
  completionManifest: { partNumber: number; etag: string }[] | null; lastPartUrlExpiresAt: Date | null;
  key: string | null; sizeBytes: string; mimeType: string; classStatus: string; name: string };

export async function lockUpload(tx: PoolClient, uploadId: string): Promise<UploadRow> {
  // Global aggregate order: class -> resource -> upload -> objects -> jobs.
  const identity = (await tx.query('SELECT r."classId",r.id FROM "SnipersUpload" u JOIN "SnipersResource" r ON r.id=u."resourceId" WHERE u.id=$1', [uploadId])).rows[0];
  if (!identity) reject('NOT_FOUND', 'Carga inexistente.');
  const cl = (await tx.query('SELECT status FROM "SnipersClass" WHERE id=$1 FOR UPDATE', [identity.classId])).rows[0];
  await tx.query('SELECT id FROM "SnipersResource" WHERE id=$1 FOR UPDATE', [identity.id]);
  await tx.query('SELECT id FROM "SnipersUpload" WHERE id=$1 FOR UPDATE', [uploadId]);
  await tx.query('SELECT id FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY id FOR UPDATE', [identity.id]);
  await tx.query('SELECT id FROM "SnipersFileJob" WHERE "resourceId"=$1 ORDER BY id FOR UPDATE', [identity.id]);
  return { ...(await tx.query(`SELECT u.*,o.key,r."sizeBytes",r."mimeType",r.name FROM "SnipersUpload" u
    JOIN "SnipersResource" r ON r.id=u."resourceId" LEFT JOIN "SnipersStorageObject" o ON o.id=u."temporaryObjectId" WHERE u.id=$1`, [uploadId])).rows[0], classStatus: cl.status };
}
async function own(tx: PoolClient, actor: Actor, uploadId: string) {
  const u = await lockUpload(tx, uploadId);
  // Even another editor/admin cannot operate somebody else's transfer.
  if (u.creatorId !== actor.userId) reject('NOT_FOUND', 'Carga inexistente.');
  return u;
}
async function clock(tx: PoolClient) { return (await tx.query('SELECT clock_timestamp() AS now')).rows[0].now as Date; }

async function receipt(tx: PoolClient, actor: Actor, operationId: string, hash: string): Promise<c.UploadReceipt | null> {
  const row = (await tx.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1', [operationId])).rows[0];
  if (!row) return null;
  const payload = c.uploadReceiptSchema.safeParse(row.payload);
  if (row.actorUserId !== actor.userId || row.action !== 'FILE_FOUNDATION_CHANGED' || row.entityType !== 'SnipersResource'
    || !payload.success || payload.data.commandHash !== hash || payload.data.result.operationId !== operationId
    || payload.data.result.resourceId !== row.entityId) reject('IDEMPOTENCY_CONFLICT', 'Operación diferente.');
  await own(tx, actor, payload.data.result.uploadId);
  return payload.data.result;
}
async function mutate(pool: Pool, actor: Actor, operationId: string, kind: c.UploadReceipt['kind'], input: unknown,
  work: (tx: PoolClient) => Promise<{ resourceId: string; uploadId: string }>): Promise<c.UploadReceipt> {
  const hash = digest({ kind, input });
  const read = (tx: PoolClient) => receipt(tx, actor, operationId, hash);
  try {
    return await transaction(pool, async tx => {
      await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
      const old = await read(tx); if (old) return old;
      const result = { operationId, kind, ...await work(tx) };
      const payload = parse(c.uploadReceiptSchema, { formatVersion: 2, commandHash: hash, result });
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`, [operationId, actor.userId, result.resourceId, JSON.stringify(payload)]);
      return result;
    });
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const old = await transaction(pool, async tx => { await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true); return read(tx); });
    if (old) return old;
    reject('CONCURRENT', 'Reintentá el mismo envío.');
  }
}
export async function startUpload(pool: Pool, actor: Actor, input: unknown, singleObject=false) {
  const v = parse(c.startUploadSchema, input);
  return mutate(pool, actor, v.operationId, 'UPLOAD_START', v, async tx => {
    const cl = (await tx.query('SELECT status FROM "SnipersClass" WHERE id=$1 FOR UPDATE', [v.classId])).rows[0];
    if (!cl) reject('NOT_FOUND', 'Clase inexistente.');
    if (cl.status === 'ARCHIVED') reject('INVALID_STATE', 'Clase archivada.');
    const resourceId = randomUUID(), uploadId = randomUUID();
    await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp())`,
      [resourceId, v.classId, v.name, v.file.type, v.file.mimeType, v.file.sizeBytes]);
    if(singleObject)await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","singleObject","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,true,clock_timestamp()+interval '24 hours',clock_timestamp())`,
      [uploadId, resourceId, actor.userId, v.expectedSha256]);
    else await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()+interval '24 hours',clock_timestamp())`,
      [uploadId, resourceId, actor.userId, v.expectedSha256]);
    await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())`, [randomUUID(), resourceId, uploadId,singleObject?'PROCESS_UPLOAD':'PREPARE_UPLOAD']);
    return { resourceId, uploadId };
  });
}
export async function getUpload(pool: Pool, actor: Actor, input: unknown): Promise<c.UploadState> {
  const v = parse(c.uploadQuerySchema, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
    const u = await own(tx, actor, v.uploadId);
    const job = (await tx.query(`SELECT kind,status,phase,"errorCode" FROM "SnipersFileJob" WHERE "uploadId"=$1 ORDER BY CASE kind WHEN 'PROCESS_UPLOAD' THEN 0 ELSE 1 END LIMIT 1`, [u.id])).rows[0];
    // Transfer completion parks validation until the next authenticated advance.
    const awaitingValidation = u.status === 'PROCESSING' && job?.kind === 'PROCESS_UPLOAD'
      && job.status === 'BLOCKED' && job.phase === 'DOWNLOAD' && job.errorCode === 'AWAITING_VALIDATION';
    return { uploadId: u.id, resourceId: u.resourceId, status: u.status, expiresAt: u.expiresAt.toISOString(),
      expired: u.expiresAt <= await clock(tx), sizeBytes: Number(u.sizeBytes), name: u.name, partSizeBytes: c.PART_BYTES,
      transferComplete: u.status === 'PROCESSING', blocked: job?.status === 'BLOCKED' && !awaitingValidation, errorCode: job?.errorCode ?? null,singleObject:u.singleObject };
  });
}
export async function signUploadPart(pool: Pool, actor: Actor, input: unknown, storage: () => MultipartStorage) {
  const v = parse(c.signPartSchema, input);
  const signed = await transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
    const u = await own(tx, actor, v.uploadId), now = await clock(tx);
    if (u.status !== 'UPLOADING' || u.expiresAt <= now || u.classStatus === 'ARCHIVED' || !u.key || !u.multipartUploadId) reject('INVALID_STATE', 'Carga cerrada.');
    if (v.partNumber > Math.ceil(Number(u.sizeBytes) / c.PART_BYTES)) reject('VALIDATION', 'Parte fuera del archivo.');
    const expiresAt = new Date(Math.min(now.getTime() + 10 * 60 * 1000, u.expiresAt.getTime()));
    await tx.query('UPDATE "SnipersUpload" SET "lastPartUrlExpiresAt"=greatest("lastPartUrlExpiresAt",$2),"updatedAt"=clock_timestamp() WHERE id=$1', [u.id, expiresAt]);
    return { key: u.key, multipartId: u.multipartUploadId, bytes: c.partBytes(Number(u.sizeBytes), v.partNumber), expiresAt };
  });
  const url = await storage().signPart(signed.key, signed.multipartId, v.partNumber, signed.bytes, signed.expiresAt);
  return { url, expiresAt: signed.expiresAt.toISOString(), sizeBytes: signed.bytes };
}
export async function completeUpload(pool: Pool, actor: Actor, input: unknown) {
  const v = parse(c.completeUploadSchema, input);
  return mutate(pool, actor, v.operationId, 'UPLOAD_COMPLETE', v, async tx => {
    const u = await own(tx, actor, v.uploadId);
    const manifestHash = digest(v.parts);
    if (['COMPLETING', 'PROCESSING'].includes(u.status) && digest(u.completionManifest) === manifestHash) return { resourceId: u.resourceId, uploadId: u.id };
    if (u.status !== 'UPLOADING' || u.expiresAt <= await clock(tx) || u.classStatus === 'ARCHIVED') reject('INVALID_STATE', 'Carga cerrada.');
    if (v.parts.length !== Math.ceil(Number(u.sizeBytes) / c.PART_BYTES)) reject('VALIDATION', 'Faltan partes.');
    await tx.query(`UPDATE "SnipersUpload" SET status='COMPLETING',"completionManifest"=$2::jsonb,"manifestHash"=$3,"updatedAt"=clock_timestamp() WHERE id=$1`, [u.id, JSON.stringify(v.parts), manifestHash]);
    if(u.singleObject)await tx.query(`UPDATE "SnipersFileJob" SET phase='COMPLETE_MULTIPART',"availableAt"=clock_timestamp() WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[u.id]);
    else await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PROCESS_UPLOAD',clock_timestamp())`, [randomUUID(), u.resourceId, u.id]);
    return { resourceId: u.resourceId, uploadId: u.id };
  });
}

// SQL-only termination: cancellation is irreversible, but remote abort can be retried safely afterwards.
export async function terminateUpload(tx: PoolClient, u: UploadRow, status: 'CANCELLED' | 'EXPIRED' | 'FAILED') {
  await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, [u.resourceId]);
  await tx.query('UPDATE "SnipersUpload" SET status=$2,"updatedAt"=clock_timestamp() WHERE id=$1', [u.id, status]);
  await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL,"completedGeneration"=NULL,"updatedAt"=clock_timestamp()
    WHERE "uploadId"=$1 AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED')`, [u.id]);
  // Seven days covers a sealed cancelled transfer. No physical deletion/cleaner in 2B.
  await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp(),
    "cleanupAfter"=greatest(clock_timestamp()+interval '7 days',coalesce($2::timestamptz,clock_timestamp())+interval '2 seconds'),
    "nextProbeAt"=greatest(clock_timestamp()+interval '7 days',coalesce($2::timestamptz,clock_timestamp())+interval '2 seconds')
    WHERE "resourceId"=$1 AND "retiredAt" IS NULL`, [u.resourceId, u.lastPartUrlExpiresAt]);
}
// New uploads never need recovery retention. Keep only outstanding writer windows.
export async function terminateSingleUpload(tx:PoolClient,u:UploadRow,status:'CANCELLED'|'EXPIRED'|'FAILED',errorCode?:string){
  if(!u.singleObject)throw Error('Single-object upload required');
  const window=(await tx.query(`SELECT clock_timestamp()::timestamptz(3) AS requested,
    greatest(clock_timestamp()::timestamptz(3),$2::timestamptz+interval '2 seconds',
      max(greatest("leaseUntil","executionDeadlineAt"))+interval '35 seconds')::timestamptz(3) AS after
    FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind<>'CLEAN_OBJECT'
    AND (status='RUNNING' OR "executionDeadlineAt">clock_timestamp())`,[u.resourceId,u.lastPartUrlExpiresAt])).rows[0];
  if(errorCode)await tx.query(`UPDATE "SnipersFileJob" SET "errorCode"=$2 WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD' AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED')`,[u.id,errorCode]);
  await terminateUpload(tx,u,status);
  await tx.query(`UPDATE "SnipersResource" SET "deletionRequestedAt"=$2,"deletionAfter"=$3 WHERE id=$1`,[u.resourceId,window.requested,window.after]);
  await tx.query(`UPDATE "SnipersStorageObject" SET "cleanupAfter"=greatest("retiredAt",$2::timestamptz),
    "nextProbeAt"=greatest("retiredAt",$2::timestamptz) WHERE "resourceId"=$1`,[u.resourceId,window.after]);
  await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"availableAt","updatedAt")
    SELECT gen_random_uuid()::text,"resourceId",id,'CLEAN_OBJECT',greatest("cleanupAfter","nextProbeAt"),clock_timestamp()
    FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND "activatedAt" IS NULL
    ON CONFLICT ("storageObjectId") WHERE kind='CLEAN_OBJECT' DO NOTHING`,[u.resourceId]);
}
export async function cancelUpload(pool: Pool, actor: Actor, input: unknown, storage: () => MultipartStorage) {
  const v = parse(c.cancelUploadSchema, input);
  const result = await mutate(pool, actor, v.operationId, 'UPLOAD_CANCEL', v, async tx => {
    const u = await own(tx, actor, v.uploadId);
    if (u.status !== 'CANCELLED') {
      if (!['PREPARING','UPLOADING','COMPLETING','PROCESSING'].includes(u.status)) reject('INVALID_STATE', 'Carga cerrada.');
      if(u.singleObject)await terminateSingleUpload(tx,u,'CANCELLED');
      else await terminateUpload(tx, u, 'CANCELLED');
    }
    return { resourceId: u.resourceId, uploadId: u.id };
  });
  const target = await transaction(pool, async tx => { await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true); return own(tx, actor, v.uploadId); });
  let abortPending = false;
  if (target.key && target.multipartUploadId) {
    try { await storage().abort(target.key, target.multipartUploadId, AbortSignal.timeout(35000)); }
    catch { abortPending = true; }
  }
  return { ...result, abortPending };
}
