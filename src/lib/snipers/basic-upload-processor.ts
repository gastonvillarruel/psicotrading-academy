// Request-driven policy 2. Reuses the existing aggregate, jobs, leases and fences.
// No work survives a completed request; scratch files are never checkpoints.
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { transaction, requirePermission, type Actor } from './permissions';
import { getUpload, lockUpload, terminateUpload } from './uploads';
import { claimUploadJob, fencedUploadJob, processUploadOnce, LostLease, type Claim } from './upload-processor';
import { inspectBytes, ValidationFailure, type ValidationStorage } from './file-validation';
import { BASIC_VALIDATION_POLICY, checkBasicFormat } from './basic-file-validation';
import type { MultipartStorage } from './upload-storage';
import type { PrivateFileType } from './file-contracts';
import {advanceSingleObjectUpload} from './single-object-upload';

export const ADVANCE_BUDGET_MS = 45000;
const invalid = new Set(['SIZE_EXCEEDED','SIZE_MISMATCH','SHA256_MISMATCH','INVALID_MP3','INVALID_M4A','UNSUPPORTED_M4A','INVALID_PDF']);
type Step = Claim & { executionId: string };

async function retireCandidates(tx: PoolClient, resourceId: string, finalsOnly: boolean, days: number, horizon: Date | null) {
  await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=coalesce("retiredAt",statement_timestamp()::timestamptz(3)),
    "cleanupAfter"=greatest("cleanupAfter",coalesce("retiredAt",statement_timestamp()::timestamptz(3))+$3*interval '1 day',$4::timestamptz+interval '2 seconds'),
    "nextProbeAt"=greatest("nextProbeAt",coalesce("retiredAt",statement_timestamp()::timestamptz(3))+$3*interval '1 day',$4::timestamptz+interval '2 seconds')
    WHERE "resourceId"=$1 AND (NOT $2::boolean OR kind='FINAL') AND "activatedAt" IS NULL`, [resourceId,finalsOnly,days,horizon]);
}

async function claimStep(pool: Pool, uploadId: string): Promise<Step | null> {
  // A normally yielded step keeps its generation and lease. Concurrent requests see
  // executionId and do nothing. A dead/expired request is reclaimed normally below.
  const resumed = await transaction(pool, async tx => {
    const upload = await lockUpload(tx, uploadId);
    if (upload.status !== 'PROCESSING') return null;
    const job = (await tx.query(`SELECT * FROM "SnipersFileJob" WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'
      AND status='RUNNING' AND "leaseUntil">clock_timestamp() AND "executionId" IS NULL
      AND phase IN ('PUT_FINAL','VERIFY_FINAL')`, [uploadId])).rows[0] as Claim | undefined;
    if (!job) return null;
    const proof = (await tx.query('SELECT "validationPolicyVersion","validationGeneration" FROM "SnipersUpload" WHERE id=$1', [uploadId])).rows[0];
    if (proof.validationPolicyVersion !== BASIC_VALIDATION_POLICY || proof.validationGeneration !== job.generation) return null;
    const executionId = randomUUID();
    await tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '60 seconds',
      "executionId"=$2,"executionDeadlineAt"=clock_timestamp()+interval '45 seconds' WHERE id=$1`, [job.id,executionId]);
    return { ...job, upload, executionId };
  });
  if (resumed) return resumed;
  const job = await claimUploadJob(pool, true, uploadId);
  if (!job) return null;
  return fencedUploadJob(pool, job, async (tx, upload) => {
    await retireCandidates(tx, upload.resourceId, true, 7, null);
    const executionId = randomUUID();
    await tx.query(`UPDATE "SnipersFileJob" SET phase='DOWNLOAD',"executionId"=$2,
      "executionDeadlineAt"=clock_timestamp()+interval '45 seconds' WHERE id=$1`, [job.id,executionId]);
    return { ...job, upload, phase: 'DOWNLOAD', executionId };
  });
}

export async function advancePrivateUpload(pool: Pool, actor: Actor, uploadId: string,
  storage: MultipartStorage & ValidationStorage, shutdown?: AbortSignal): Promise<void> {
  // Strict parsing, ownership, single-session and explicit editorial permission.
  const state = await getUpload(pool, actor, { uploadId });
  if(state.singleObject)return advanceSingleObjectUpload(pool,actor,uploadId,storage,shutdown);
  const signal = AbortSignal.any([AbortSignal.timeout(ADVANCE_BUDGET_MS), ...(shutdown ? [shutdown] : [])]);
  signal.throwIfAborted();
  if (['PREPARING','COMPLETING'].includes(state.status)) {
    await processUploadOnce(pool, storage, signal, uploadId);
    return;
  }
  if (state.status !== 'PROCESSING') return;
  const job = await claimStep(pool, uploadId);
  if (!job) return;
  const fenced = <T>(work: (tx: PoolClient, upload: Claim['upload']) => Promise<T>) => fencedUploadJob(pool, job, async (tx, u) => {
    const live = await tx.query('SELECT 1 FROM "SnipersFileJob" WHERE id=$1 AND "executionId"=$2', [job.id,job.executionId]);
    if (!live.rowCount) throw new LostLease();
    return work(tx, u);
  });
  let directory: string | undefined;
  try {
    const source = await fenced(async (tx, u) => {
      await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
      if (u.creatorId !== actor.userId) throw new LostLease();
      if (u.classStatus === 'ARCHIVED') { await terminateUpload(tx,u,'CANCELLED'); return null; }
      const r = (await tx.query(`SELECT r.type,u."expectedSha256" FROM "SnipersResource" r
        JOIN "SnipersUpload" u ON u."resourceId"=r.id WHERE u.id=$1`, [uploadId])).rows[0];
      return { ...u, type: r.type as PrivateFileType, sha256: r.expectedSha256 as string, sizeBytes: Number(u.sizeBytes) };
    });
    if (!source) return;
    if (!source.key) throw new ValidationFailure('MISSING_TEMPORARY');
    const expected = { type: source.type, mimeType: source.mimeType, sizeBytes: source.sizeBytes, sha256: source.sha256 };
    if (job.phase === 'DOWNLOAD' || job.phase === 'PUT_FINAL') {
      directory = await mkdtemp(path.join(os.tmpdir(), 'snipers-basic-'));
      const file = path.join(directory, 'input');
      await inspectBytes(await storage.read(source.key,signal), expected, signal, file);
      if (job.phase === 'DOWNLOAD') {
        await checkBasicFormat(file, source.type, signal);
        await fenced(async (tx, u) => {
          signal.throwIfAborted();
          await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
          if (u.classStatus === 'ARCHIVED') { await terminateUpload(tx,u,'CANCELLED'); return; }
          await tx.query(`UPDATE "SnipersUpload" SET "sourceSha256"=$2,"sourceSizeBytes"=$3,
            "formatCheckedAt"=statement_timestamp(),"antivirusCheckedAt"=NULL,"signatureVersion"=NULL,"signaturePublishedAt"=NULL,
            "validationPolicyVersion"=$4,"validationGeneration"=$5 WHERE id=$1`,
          [uploadId,source.sha256,source.sizeBytes,BASIC_VALIDATION_POLICY,job.generation]);
          await tx.query(`UPDATE "SnipersFileJob" SET phase='PUT_FINAL',"executionId"=NULL,"executionDeadlineAt"=NULL WHERE id=$1`, [job.id]);
        });
      } else {
        const target = await fenced(async (tx, u) => {
          signal.throwIfAborted();
          await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
          if (u.classStatus === 'ARCHIVED') throw new ValidationFailure('CLASS_ARCHIVED');
          // There is exactly one write per key. Any interrupted generation abandons it.
          const id = randomUUID(), key = `snipers/final/${u.resourceId}/${job.generation}/${id}`;
          await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt")
            VALUES ($1,$2,$3,'FINAL',$4,$5,'PUT_FINAL','IN_FLIGHT',clock_timestamp())`, [id,u.resourceId,key,job.id,job.generation]);
          return { id,key };
        });
        let acknowledged = false;
        try { await storage.putNew(target.key,file,source.sizeBytes,source.mimeType,uploadId,signal); acknowledged = true; }
        catch { /* Reconcile exclusively with a full GET in the next request. */ }
        await fenced(async tx => {
          await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"=$2::"SnipersObjectWriteState" WHERE id=$1`,
            [target.id,acknowledged ? 'ACKNOWLEDGED' : 'UNCERTAIN']);
          await tx.query(`UPDATE "SnipersFileJob" SET phase='VERIFY_FINAL',"executionId"=NULL,"executionDeadlineAt"=NULL WHERE id=$1`, [job.id]);
        });
      }
    } else if (job.phase === 'VERIFY_FINAL') {
      const target = await fenced(async tx => (await tx.query(`SELECT id,key FROM "SnipersStorageObject"
        WHERE "producerJobId"=$1 AND "producerGeneration"=$2 AND kind='FINAL' AND "retiredAt" IS NULL`, [job.id,job.generation])).rows[0]);
      if (!target) throw new ValidationFailure('MISSING_FINAL');
      // Failed/missing/ambiguous reads never authorize a second write to this key.
      await inspectBytes(await storage.read(target.key,signal), expected, signal);
      await fenced(async (tx, u) => {
        signal.throwIfAborted();
        await requirePermission(tx, actor, 'SNIPERS_CONTENT_EDITOR', true);
        if (u.classStatus === 'ARCHIVED') { await terminateUpload(tx,u,'CANCELLED'); return; }
        const activation = (await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='BYTES_VERIFIED',"verifiedSha256"=$2,
          "verifiedSizeBytes"=$3,"bytesVerifiedAt"=statement_timestamp(),"activatedAt"=statement_timestamp(),"updatedAt"=clock_timestamp()
          WHERE id=$1 RETURNING "activatedAt"`, [target.id,source.sha256,source.sizeBytes])).rows[0].activatedAt;
        await tx.query(`UPDATE "SnipersResource" SET status='VERIFIED',checksum=$2,"objectKey"=$3,"finalObjectId"=$4,
          "verifiedAt"=$5,"updatedAt"=clock_timestamp() WHERE id=$1 AND status='PENDING' AND "attachedAt" IS NULL`,
        [u.resourceId,source.sha256,target.key,target.id,activation]);
        await tx.query(`UPDATE "SnipersUpload" SET status='SUCCEEDED',"updatedAt"=clock_timestamp() WHERE id=$1`, [uploadId]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',phase='ACTIVATE',"completedGeneration"=generation,
          "leaseToken"=NULL,"leaseUntil"=NULL,"errorCode"=NULL,"executionId"=NULL,"executionDeadlineAt"=NULL WHERE id=$1`, [job.id]);
        await retireCandidates(tx,u.resourceId,false,1,u.lastPartUrlExpiresAt);
      });
    }
  } catch (error) {
    if ((error as { severity?: string }).severity) throw error;
    if (!(error instanceof LostLease)) await fenced(async (tx, u) => {
      const code = signal.aborted ? 'VALIDATION_INTERRUPTED' : error instanceof ValidationFailure ? error.code : 'VALIDATION_UNAVAILABLE';
      if (invalid.has(code)) {
        await tx.query(`UPDATE "SnipersResource" SET status='REJECTED',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.resourceId]);
        await tx.query(`UPDATE "SnipersUpload" SET status='FAILED',"updatedAt"=clock_timestamp() WHERE id=$1`, [uploadId]);
        await retireCandidates(tx,u.resourceId,false,7,u.lastPartUrlExpiresAt);
      }
      // Recovery takes a new generation and abandons any uncertain destination.
      await tx.query(`UPDATE "SnipersFileJob" SET status=$2::"SnipersFileJobStatus","errorCode"=$3,
        "leaseToken"=NULL,"leaseUntil"=NULL,"executionId"=NULL,"executionDeadlineAt"=NULL,
        "availableAt"=clock_timestamp()+interval '30 seconds' WHERE id=$1`,
      [job.id,invalid.has(code) ? 'FAILED' : job.attempts < 4 ? 'WAIT_RETRY' : 'BLOCKED',code]);
    }).catch(failure => { if (!(failure instanceof LostLease)) throw failure; });
  } finally {
    if (directory) await rm(directory,{recursive:true,force:true});
  }
}
