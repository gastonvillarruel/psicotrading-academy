// Only transfer preparation/completion. Deliberately stops before download, analysis or activation.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction, requirePermission } from './permissions';
import { lockUpload, terminateUpload, type UploadRow } from './uploads';
import { partBytes } from './upload-contracts';
import type { MultipartStorage, StoredPart } from './upload-storage';

type Claim = { id: string; uploadId: string; resourceId: string; kind: 'PREPARE_UPLOAD' | 'PROCESS_UPLOAD';
  generation: number; leaseToken: string; attempts: number; phase: string; previousPhase: string; upload: UploadRow };
class LostLease extends Error {}
class BlockedTransfer extends Error { constructor(readonly code: string) { super(code); } }
const eligible = `EXISTS (SELECT 1 FROM "SnipersAuditEvent" a WHERE a.action='FILE_FOUNDATION_CHANGED'
  AND a.payload->>'formatVersion'='2' AND a.payload->'result'->>'kind'='UPLOAD_START'
  AND a.payload->'result'->>'uploadId'=j."uploadId")`;

async function claimNext(pool: Pool): Promise<Claim | null> {
  return transaction(pool, async tx => {
    const candidate = (await tx.query(`SELECT j.id,j."uploadId" FROM "SnipersFileJob" j JOIN "SnipersUpload" u ON u.id=j."uploadId"
      WHERE ${eligible} AND ((j.kind='PREPARE_UPLOAD' AND u.status='PREPARING') OR (j.kind='PROCESS_UPLOAD' AND u.status='COMPLETING'))
      AND j."availableAt"<=clock_timestamp() AND (j.status IN ('READY','WAIT_RETRY') OR (j.status='RUNNING' AND j."leaseUntil"<=clock_timestamp()))
      ORDER BY j."availableAt",j.id LIMIT 1`)).rows[0];
    if (!candidate) return null;
    const upload = await lockUpload(tx, candidate.uploadId);
    const prior = (await tx.query('SELECT phase FROM "SnipersFileJob" WHERE id=$1', [candidate.id])).rows[0];
    const job = (await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,
      "leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '60 seconds',"updatedAt"=clock_timestamp()
      WHERE id=$1 AND "availableAt"<=clock_timestamp() AND (status IN ('READY','WAIT_RETRY') OR (status='RUNNING' AND "leaseUntil"<=clock_timestamp())) RETURNING *`, [candidate.id, randomUUID()])).rows[0];
    if (!job) return null;
    return { ...job, previousPhase: prior.phase, upload };
  });
}
async function fenced<T>(pool: Pool, job: Claim, work: (tx: PoolClient, upload: UploadRow) => Promise<T>): Promise<T> {
  return transaction(pool, async tx => {
    const u = await lockUpload(tx, job.uploadId);
    const row = await tx.query(`SELECT 1 FROM "SnipersFileJob" WHERE id=$1 AND generation=$2 AND "leaseToken"=$3
      AND status='RUNNING' AND "leaseUntil">clock_timestamp()`, [job.id, job.generation, job.leaseToken]);
    if (!row.rowCount || ['CANCELLED','EXPIRED','FAILED'].includes(u.status)) throw new LostLease();
    return work(tx, u);
  });
}
export async function heartbeatUploadJob(pool: Pool, job: Pick<Claim, 'id' | 'generation' | 'leaseToken'>): Promise<boolean> {
  return transaction(pool, async tx => {
    const row = await tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '60 seconds',"updatedAt"=clock_timestamp()
      WHERE id=$1 AND generation=$2 AND "leaseToken"=$3 AND status='RUNNING' AND "leaseUntil">clock_timestamp()`, [job.id, job.generation, job.leaseToken]);
    return row.rowCount === 1;
  });
}
export function matchingParts(actual: StoredPart[], expected: { partNumber: number; etag: string }[], size: number) {
  return actual.length === expected.length && actual.every((p, i) => p.partNumber === expected[i].partNumber
    && p.etag === expected[i].etag && p.sizeBytes === partBytes(size, p.partNumber));
}

export async function processUploadOnce(pool: Pool, storage: MultipartStorage, shutdown?: AbortSignal): Promise<boolean> {
  const job = await claimNext(pool);
  if (!job) return false;
  const controller = new AbortController();
  const signal = shutdown ? AbortSignal.any([controller.signal, shutdown]) : controller.signal;
  let stopped = false;
  // Sequential async heartbeat: never leave overlapping timers/SQL after a job finishes.
  const heartbeats = (async () => {
    while (!stopped) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(done, 20000);
        function done() { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); }
        controller.signal.addEventListener('abort', done, { once: true });
        if (controller.signal.aborted) done();
      });
      if (stopped || signal.aborted) return;
      try { if (!await heartbeatUploadJob(pool, job)) controller.abort(); }
      catch { controller.abort(); }
    }
  })();
  try {
    const live = await fenced(pool, job, async (tx, u) => {
      try { await requirePermission(tx, { userId: u.creatorId, activeSessionId: null, singleSession: false }, 'SNIPERS_CONTENT_EDITOR'); }
      catch { throw new BlockedTransfer('EDITOR_REVOKED'); }
      const now = (await tx.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      if (u.classStatus === 'ARCHIVED' || u.expiresAt <= now) {
        await terminateUpload(tx, u, u.status === 'PREPARING' || u.status === 'UPLOADING' ? 'EXPIRED' : 'CANCELLED');
        return null;
      }
      return u;
    });
    if (!live || signal.aborted) return true;
    if (job.kind === 'PREPARE_UPLOAD') {
      const object = await fenced(pool, job, async tx => {
        const old = (await tx.query('SELECT id,"writeState" FROM "SnipersStorageObject" WHERE "producerJobId"=$1 AND "retiredAt" IS NULL', [job.id])).rows;
        if (old.some(o => ['IN_FLIGHT','UNCERTAIN'].includes(o.writeState))) throw new BlockedTransfer('CREATE_UNCERTAIN');
        const objectId = randomUUID(), key = `snipers/temporary/${job.resourceId}/${job.generation}/${objectId}`;
        await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt")
          VALUES ($1,$2,$3,'TEMPORARY',$4,$5,'CREATE_MULTIPART','IN_FLIGHT',clock_timestamp())`, [objectId, job.resourceId, key, job.id, job.generation]);
        await tx.query(`UPDATE "SnipersFileJob" SET phase='CREATE_MULTIPART' WHERE id=$1`, [job.id]);
        return { objectId, key };
      });
      let multipartId: string;
      try { multipartId = await storage.create(object.key, live.mimeType, live.id, signal); }
      catch { throw new BlockedTransfer('CREATE_UNCERTAIN'); }
      // If cancelled/lost after R2 acknowledged create, abort the known orphan outside SQL.
      try {
        await fenced(pool, job, async (tx, u) => {
          await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='ACKNOWLEDGED',"updatedAt"=clock_timestamp() WHERE id=$1`, [object.objectId]);
          await tx.query(`UPDATE "SnipersUpload" SET status='UPLOADING',"temporaryObjectId"=$2,"multipartUploadId"=$3,"updatedAt"=clock_timestamp() WHERE id=$1`, [u.id, object.objectId, multipartId]);
          await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=generation,"leaseToken"=NULL,"leaseUntil"=NULL,"errorCode"=NULL WHERE id=$1`, [job.id]);
        });
      } catch (error) {
        if (error instanceof LostLease) { try { await storage.abort(object.key, multipartId, AbortSignal.timeout(35000)); } catch { /* retired inventory/lifecycle retains the unresolved object */ } }
        throw error;
      }
    } else {
      if (!live.key || !live.multipartUploadId || !live.completionManifest) throw new BlockedTransfer('MISSING_MULTIPART');
      const key = live.key;
      let object = await storage.head(key, signal);
      if (!object) {
        // A previous Complete may still be in flight. Absence alone never authorizes another uncertain write.
        if (job.previousPhase === 'COMPLETE_MULTIPART') throw new BlockedTransfer('COMPLETE_UNCERTAIN');
        const actual = await storage.listParts(key, live.multipartUploadId, signal);
        if (!matchingParts(actual, live.completionManifest, Number(live.sizeBytes))) throw new BlockedTransfer('PARTS_MISMATCH');
        await fenced(pool, job, async (tx, u) => {
          if (u.status !== 'COMPLETING') throw new LostLease();
          await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='IN_FLIGHT',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.temporaryObjectId]);
          await tx.query(`UPDATE "SnipersFileJob" SET phase='COMPLETE_MULTIPART' WHERE id=$1`, [job.id]);
        });
        try { await storage.complete(key, live.multipartUploadId, live.completionManifest, signal); }
        catch {
          object = await storage.head(key, signal);
          if (!object) throw new BlockedTransfer('COMPLETE_UNCERTAIN');
        }
        object = object ?? await storage.head(key, signal);
      }
      if (!object || object.sizeBytes !== Number(live.sizeBytes) || object.uploadId !== live.id) throw new BlockedTransfer('OBJECT_MISMATCH');
      await fenced(pool, job, async (tx, u) => {
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='ACKNOWLEDGED',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.temporaryObjectId]);
        await tx.query(`UPDATE "SnipersUpload" SET status='PROCESSING',"updatedAt"=clock_timestamp() WHERE id=$1`, [u.id]);
        // PROCESS_UPLOAD cannot SUCCEED until full 2C validation/activation. Park it explicitly.
        await tx.query(`UPDATE "SnipersFileJob" SET status='BLOCKED',phase='DOWNLOAD',"errorCode"='AWAITING_VALIDATION',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`, [job.id]);
      });
    }
  } catch (error) {
    if (!(error instanceof LostLease)) {
      try {
        await fenced(pool, job, async tx => {
          const blocked = error instanceof BlockedTransfer || job.attempts >= 3;
          await tx.query(`UPDATE "SnipersFileJob" SET status=$2::"SnipersFileJobStatus","errorCode"=$3,
            "leaseToken"=NULL,"leaseUntil"=NULL,"availableAt"=clock_timestamp()+interval '30 seconds',"updatedAt"=clock_timestamp() WHERE id=$1`,
          [job.id, blocked ? 'BLOCKED' : 'WAIT_RETRY', error instanceof BlockedTransfer ? error.code : 'STORAGE_UNAVAILABLE']);
        });
      } catch (fenceError) { if (!(fenceError instanceof LostLease)) throw fenceError; }
    }
  } finally { stopped = true; controller.abort(); await heartbeats; }
  return true;
}
