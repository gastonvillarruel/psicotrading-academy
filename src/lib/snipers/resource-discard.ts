// SQL intent commits before any R2 request. Uploads keep their existing fencing protocol.
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {parse} from './contracts';
import {requirePermission,transaction,type Actor} from './permissions';
import {lockUpload,terminateUpload} from './uploads';
import {reject} from './errors';
import {digest} from './preview';
import {retirementCandidate} from './resource-retirement-proof';
import {processPendingDeletions} from './storage-deletions';
import type {CleanupStorage} from './upload-storage';
import {resourceDiscardSchema,resourceDiscardAuditSchema,resourceDiscardAuditV6Schema,type ResourceDiscardResult} from './storage-management-contracts';

// Caller owns permission and the class lock. Shared by file and class deletion.
export async function discardResourceInTransaction(tx:PoolClient,actor:Actor,resourceId:string,operationId:string=randomUUID()):Promise<ResourceDiscardResult>{
  const command={operationId,resourceId},hash=digest({kind:'ADMIN_RESOURCE_DISCARD',...command});
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operationId]);
  const old=(await tx.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0];
  if(old){
    const p=resourceDiscardAuditSchema.safeParse(old.payload);
    if(!p.success||old.actorUserId!==actor.userId||old.action!=='FILE_FOUNDATION_CHANGED'
      ||old.entityType!=='SnipersResource'||old.entityId!==resourceId||p.data.commandHash!==hash
      ||p.data.result.operationId!==old.id||p.data.result.resourceId!==resourceId)reject('IDEMPOTENCY_CONFLICT','Solicitud diferente.');
    return {resourceId,classId:p.data.result.classId,state:'DISCARDED',replayed:true};
  }
  const identity=(await tx.query('SELECT "classId" FROM "SnipersResource" WHERE id=$1',[resourceId])).rows[0];
  if(!identity)reject('NOT_FOUND','Archivo inexistente.');
  await tx.query('SELECT id FROM "SnipersClass" WHERE id=$1 FOR UPDATE',[identity.classId]);
  await tx.query('SELECT id FROM "SnipersResource" WHERE id=$1 FOR UPDATE',[resourceId]);
  const upload=(await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1',[resourceId])).rows[0];
  const u=upload?await lockUpload(tx,upload.id):null;
  const r=(await tx.query('SELECT status,"attachedAt","deletionRequestedAt" FROM "SnipersResource" WHERE id=$1',[resourceId])).rows[0];
  if(!r.deletionRequestedAt){
    // Capture remote windows BEFORE invalidating leases: a timeout is not a remote abort.
    const window=(await tx.query(`SELECT clock_timestamp()::timestamptz(3) AS requested,
      greatest(clock_timestamp()::timestamptz(3),$2::timestamptz+interval '2 seconds',
        max(greatest("leaseUntil","executionDeadlineAt"))+interval '35 seconds')::timestamptz(3) AS after
      FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind<>'CLEAN_OBJECT'
        AND (status='RUNNING' OR "executionDeadlineAt">clock_timestamp())`,[resourceId,u?.lastPartUrlExpiresAt??null])).rows[0];
    if(r.attachedAt&&r.status!=='ARCHIVED')await tx.query('UPDATE "SnipersResource" SET "attachedAt"=NULL WHERE id=$1',[resourceId]);
    if(u&&['PREPARING','UPLOADING','COMPLETING','PROCESSING'].includes(u.status))await terminateUpload(tx,u,'CANCELLED');
    await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"attachedAt"=NULL,
      "archivedAt"=coalesce("archivedAt",clock_timestamp()),"deletionRequestedAt"=$2,"deletionAfter"=$3,"updatedAt"=clock_timestamp() WHERE id=$1`,[resourceId,window.requested,window.after]);
    await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL,"completedGeneration"=NULL
      WHERE "resourceId"=$1 AND kind='CLEAN_OBJECT' AND status='RUNNING'`,[resourceId]);
    await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=coalesce("retiredAt",$2::timestamptz),
      "cleanupAfter"=greatest(coalesce("retiredAt",$2::timestamptz),$3::timestamptz),
      "nextProbeAt"=greatest(coalesce("retiredAt",$2::timestamptz),$3::timestamptz),"updatedAt"=clock_timestamp()
      WHERE "resourceId"=$1`,[resourceId,window.requested,window.after]);
    await tx.query(`UPDATE "SnipersFileJob" j SET status='WAIT_RETRY',"completedGeneration"=NULL,
      "availableAt"=greatest(o."cleanupAfter",o."nextProbeAt"),"errorCode"=NULL,"updatedAt"=clock_timestamp()
      FROM "SnipersStorageObject" o WHERE j."storageObjectId"=o.id AND j.kind='CLEAN_OBJECT'
      AND o."resourceId"=$1 AND j.status<>'BLOCKED'`,[resourceId]);
    if(r.attachedAt)await tx.query('UPDATE "SnipersClass" SET version=version+1,"updatedAt"=clock_timestamp() WHERE id=$1',[identity.classId]);
  }
  const final=(await tx.query(`SELECT o.id,o."retiredAt" FROM "SnipersResource" r
    JOIN "SnipersStorageObject" o ON o.id=r."finalObjectId" WHERE r.id=$1`,[resourceId])).rows[0];
  const payload=resourceDiscardAuditV6Schema.parse({formatVersion:6,commandHash:hash,
    result:{...command,kind:'ADMIN_RESOURCE_DISCARD',classId:identity.classId,changed:!r.deletionRequestedAt,
      finalObjectId:final?.id??null,requestedAt:final?.retiredAt?.toISOString()??null}});
  await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
    VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[operationId,actor.userId,resourceId,JSON.stringify(payload)]);
  // Persist every authorized object before contacting R2.
  await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"availableAt","updatedAt")
    SELECT gen_random_uuid()::text,o."resourceId",o.id,'CLEAN_OBJECT',greatest(o."cleanupAfter",o."nextProbeAt"),clock_timestamp()
    FROM "SnipersStorageObject" o WHERE o."resourceId"=$1 AND o."retiredAt" IS NOT NULL
    AND ((o."activatedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key))
      OR (${retirementCandidate} AND NOT EXISTS(SELECT 1 FROM "SnipersResource" other WHERE other.id<>o."resourceId" AND (other."finalObjectId"=o.id OR other."objectKey"=o.key))))
    ON CONFLICT ("storageObjectId") WHERE kind='CLEAN_OBJECT' DO NOTHING`,[resourceId]);
  return {resourceId,classId:identity.classId,state:'DISCARDED',replayed:false};
}

export async function discardResource(pool:Pool,actor:Actor,input:unknown,storage?:()=>CleanupStorage):Promise<ResourceDiscardResult>{
  const v=parse(resourceDiscardSchema,input);
  const result=await transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    return discardResourceInTransaction(tx,actor,v.resourceId,v.operationId);
  });
  if(storage)await processPendingDeletions(pool,storage,{resourceIds:[result.resourceId],limit:2}).catch(()=>{});
  return result;
}
