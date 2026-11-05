import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { requirePermission } from './permissions';
import { terminateUpload } from './uploads';
import { claimUploadJob, fencedUploadJob, heartbeatUploadJob, LostLease } from './upload-processor';
import { checkSignatures, inspectBytes, inspectLocal, VALIDATION_POLICY, ValidationFailure, type FileAnalyzer, type ValidationStorage } from './file-validation';

const rejected = new Set(['SIZE_EXCEEDED','SIZE_MISMATCH','SHA256_MISMATCH','INVALID_MP3','INVALID_PDF',
  'PDF_ENCRYPTED_OR_INVALID','MALWARE_OR_SCAN_LIMIT']);

async function retire(tx: PoolClient, resourceId: string, finalsOnly: boolean, days: number, signatureHorizon: Date | null) {
  // A later terminal result may require extending an earlier candidate's retention.
  await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=coalesce("retiredAt",statement_timestamp()::timestamptz(3)),
    "cleanupAfter"=greatest("cleanupAfter",coalesce("retiredAt",statement_timestamp()::timestamptz(3))+$3*interval '1 day',$4::timestamptz+interval '2 seconds'),
    "nextProbeAt"=greatest("nextProbeAt",coalesce("retiredAt",statement_timestamp()::timestamptz(3))+$3*interval '1 day',$4::timestamptz+interval '2 seconds')
    WHERE "resourceId"=$1 AND (NOT $2::boolean OR kind='FINAL') AND "activatedAt" IS NULL`, [resourceId, finalsOnly, days, signatureHorizon]);
}

export async function processValidationOnce(pool: Pool, storage: ValidationStorage, analyzer: FileAnalyzer, shutdown?: AbortSignal, uploadId?: string, scratchDirectory = os.tmpdir()): Promise<boolean> {
  const job = await claimUploadJob(pool, true, uploadId);
  if (!job) return false;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12 * 60 * 1000), ...(shutdown ? [shutdown] : [])]);
  const fenced = <T>(work: Parameters<typeof fencedUploadJob<T>>[2]) => fencedUploadJob(pool, job, work);
  let stopped = false, directory: string | undefined;
  const heartbeats = (async () => {
    while (!stopped && !signal.aborted) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(done, 20000);
        function done() { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); }
        controller.signal.addEventListener('abort', done, { once: true });
        if (controller.signal.aborted) done();
      });
      if (stopped || signal.aborted) return;
      try { if (!await heartbeatUploadJob(pool, job)) controller.abort(); } catch { controller.abort(); }
    }
  })();
  try {
    const live = await fenced(async (tx, u) => {
      if (u.status !== 'PROCESSING') throw new LostLease();
      try { await requirePermission(tx, { userId: u.creatorId, activeSessionId: null, singleSession: false }, 'SNIPERS_CONTENT_EDITOR', true); }
      catch { throw new ValidationFailure('EDITOR_REVOKED'); }
      if (u.classStatus === 'ARCHIVED') { await terminateUpload(tx, u, 'CANCELLED'); return null; }
      // An interrupted generation's destination is permanently abandoned. Never reuse its key.
      await retire(tx, u.resourceId, true, 7, null);
      await tx.query(`UPDATE "SnipersFileJob" SET phase='DOWNLOAD',"executionId"=NULL,"executionDeadlineAt"=NULL WHERE id=$1`, [job.id]);
      const row = (await tx.query(`SELECT r.type,u."expectedSha256" FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id WHERE u.id=$1`, [u.id])).rows[0];
      return { ...u, type: row.type as 'MP3' | 'PDF', sha256: row.expectedSha256 as string, sizeBytes: Number(u.sizeBytes) };
    });
    if (!live) return true;
    signal.throwIfAborted();
    if (!live.key) throw new ValidationFailure('MISSING_TEMPORARY');
    directory = await mkdtemp(path.join(scratchDirectory, 'snipers-validation-'));
    await chmod(directory, 0o700);
    const file = path.join(directory, 'input');
    const expected = { type: live.type, mimeType: live.mimeType, sizeBytes: live.sizeBytes, sha256: live.sha256 };
    const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    await inspectBytes(await storage.read(live.key, downloadSignal), expected, downloadSignal, file);
    await chmod(file, 0o444);
    await fenced(tx => tx.query(`UPDATE "SnipersFileJob" SET phase='ANALYZE',"executionId"=$2,
      "executionDeadlineAt"=clock_timestamp()+interval '12 minutes' WHERE id=$1`, [job.id, randomUUID()]));
    const proof = await analyzer.analyze(file, live.type, signal);
    signal.throwIfAborted();
    // Analyzer inputs are read-only, and this independent hash protects the bytes submitted to PUT.
    await inspectLocal(file, expected, signal);
    const target = await fenced(async (tx, u) => {
      const now = (await tx.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      checkSignatures(proof, now);
      if (u.classStatus === 'ARCHIVED') throw new ValidationFailure('CLASS_ARCHIVED');
      await tx.query(`UPDATE "SnipersUpload" SET "sourceSha256"=$2,"sourceSizeBytes"=$3,
        "formatCheckedAt"=statement_timestamp(),"antivirusCheckedAt"=statement_timestamp(),"signatureVersion"=$4,
        "signaturePublishedAt"=$5,"validationPolicyVersion"=$6,"validationGeneration"=$7 WHERE id=$1`,
      [u.id, live.sha256, live.sizeBytes, proof.signatureVersion, proof.signaturePublishedAt, VALIDATION_POLICY, job.generation]);
      const id = randomUUID(), key = `snipers/final/${u.resourceId}/${job.generation}/${id}`;
      await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt")
        VALUES ($1,$2,$3,'FINAL',$4,$5,'PUT_FINAL','IN_FLIGHT',clock_timestamp())`, [id,u.resourceId,key,job.id,job.generation]);
      await tx.query(`UPDATE "SnipersFileJob" SET phase='PUT_FINAL',"executionId"=NULL,"executionDeadlineAt"=NULL WHERE id=$1`, [job.id]);
      return { id, key };
    });
    // Revalidate immediately before the single remote write; no SQL transaction spans it.
    await fenced(async () => { signal.throwIfAborted(); });
    let acknowledged = false;
    try {
      await storage.putNew(target.key, file, live.sizeBytes, live.mimeType, live.id, AbortSignal.any([signal, AbortSignal.timeout(120000)]));
      acknowledged = true;
    } catch { /* An ambiguous PUT can be reconciled only through the complete definitive GET below. */ }
    await fenced(async tx => {
      await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"=$2::"SnipersObjectWriteState" WHERE id=$1`, [target.id, acknowledged ? 'ACKNOWLEDGED' : 'UNCERTAIN']);
      await tx.query(`UPDATE "SnipersFileJob" SET phase='VERIFY_FINAL' WHERE id=$1`, [job.id]);
    });
    try {
      const readSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
      await inspectBytes(await storage.read(target.key, readSignal), expected, readSignal);
    } catch {
      // Even a definitive GET error/hash mismatch cannot authorize another PUT to this key.
      throw new ValidationFailure(acknowledged ? 'FINAL_READBACK_FAILED' : 'PROMOTION_UNCERTAIN');
    }
    signal.throwIfAborted();
    await fenced(async (tx, u) => {
      await requirePermission(tx, { userId: u.creatorId, activeSessionId: null, singleSession: false }, 'SNIPERS_CONTENT_EDITOR', true);
      if (u.classStatus === 'ARCHIVED') throw new ValidationFailure('CLASS_ARCHIVED');
      checkSignatures(proof, (await tx.query('SELECT clock_timestamp() AS now')).rows[0].now);
      const activation = (await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='BYTES_VERIFIED',"verifiedSha256"=$2,
        "verifiedSizeBytes"=$3,"bytesVerifiedAt"=statement_timestamp(),"activatedAt"=statement_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1 RETURNING "activatedAt"`,
      [target.id,live.sha256,live.sizeBytes])).rows[0].activatedAt;
      await tx.query(`UPDATE "SnipersResource" SET status='VERIFIED',checksum=$2,"objectKey"=$3,"finalObjectId"=$4,"verifiedAt"=$5,"updatedAt"=clock_timestamp()
        WHERE id=$1 AND status='PENDING' AND "attachedAt" IS NULL`, [u.resourceId,live.sha256,target.key,target.id,activation]);
      await tx.query(`UPDATE "SnipersUpload" SET status='SUCCEEDED',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.id]);
      await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',phase='ACTIVATE',"completedGeneration"=generation,
        "leaseToken"=NULL,"leaseUntil"=NULL,"errorCode"=NULL,"executionId"=NULL,"executionDeadlineAt"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1`, [job.id]);
      await retire(tx, u.resourceId, false, 1, u.lastPartUrlExpiresAt);
    });
  } catch (error) {
    // Database invariant failures are implementation/configuration faults, not storage retries.
    if ((error as { severity?: string }).severity) throw error;
    if (!(error instanceof LostLease)) {
      try {
        await fenced(async (tx, u) => {
          const code = signal.aborted ? 'VALIDATION_INTERRUPTED' : error instanceof ValidationFailure ? error.code : 'VALIDATION_UNAVAILABLE';
          if (rejected.has(code)) {
            await tx.query(`UPDATE "SnipersResource" SET status='REJECTED',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.resourceId]);
            await tx.query(`UPDATE "SnipersUpload" SET status='FAILED',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.id]);
            await retire(tx, u.resourceId, false, 7, u.lastPartUrlExpiresAt);
          }
          const retry = (signal.aborted || !(error instanceof ValidationFailure)) && job.attempts < 4;
          await tx.query(`UPDATE "SnipersFileJob" SET status=$2::"SnipersFileJobStatus","errorCode"=$3,"leaseToken"=NULL,"leaseUntil"=NULL,
            "executionId"=NULL,"executionDeadlineAt"=NULL,"availableAt"=clock_timestamp()+interval '30 seconds',"updatedAt"=clock_timestamp() WHERE id=$1`,
          [job.id,rejected.has(code) ? 'FAILED' : retry ? 'WAIT_RETRY' : 'BLOCKED',code]);
        });
      } catch (fenceError) { if (!(fenceError instanceof LostLease)) throw fenceError; }
    }
  } finally {
    stopped = true; controller.abort(); await heartbeats;
    if (directory) { await chmod(path.join(directory,'signatures'),0o700).catch(() => {}); await rm(directory, { recursive: true, force: true }); }
  }
  return true;
}
