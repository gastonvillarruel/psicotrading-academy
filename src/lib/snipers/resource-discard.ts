// SQL-only administrative discard. Physical cleanup remains exclusively in storage-cleanup.
import type {Pool} from 'pg';
import {parse} from './contracts';
import {requirePermission,transaction,type Actor} from './permissions';
import {lockUpload,terminateUpload} from './uploads';
import {reject} from './errors';
import {digest} from './preview';
import {inspectResourceRetirement,retireVerifiedResourceInTransaction} from './resource-retirement';
import {resourceDiscardSchema,resourceDiscardAuditSchema,type ResourceDiscardResult} from './storage-management-contracts';

export async function discardResource(pool:Pool,actor:Actor,input:unknown):Promise<ResourceDiscardResult>{
  const v=parse(resourceDiscardSchema,input),hash=digest({kind:'ADMIN_RESOURCE_DISCARD',...v});
  return transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[v.operationId]);
    const old=(await tx.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[v.operationId])).rows[0];
    if(old){
      const p=resourceDiscardAuditSchema.safeParse(old.payload);
      if(!p.success||old.actorUserId!==actor.userId||old.action!=='FILE_FOUNDATION_CHANGED'
        ||old.entityType!=='SnipersResource'||old.entityId!==v.resourceId||p.data.commandHash!==hash
        ||p.data.result.operationId!==old.id||p.data.result.resourceId!==v.resourceId)
        reject('IDEMPOTENCY_CONFLICT','Solicitud diferente.');
      return {resourceId:v.resourceId,classId:p.data.result.classId,state:'DISCARDED',replayed:true};
    }
    const identity=(await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1',[v.resourceId])).rows[0];
    if(!identity)reject('NOT_FOUND','Carga inexistente.');
    const u=await lockUpload(tx,identity.id);
    const r=(await tx.query('SELECT "classId",status,"attachedAt" FROM "SnipersResource" WHERE id=$1',[v.resourceId])).rows[0];
    const result={resourceId:v.resourceId,classId:r.classId as string,replayed:false};
    if(r.attachedAt)return {...result,state:'LINKED'};
    // Never fence a producer that still owns a live lease or execution window.
    // Once quiescent, the existing termination fences SQL writers; uncertain remote
    // writes retain their inventory, deadlines and recurring absence probes.
    const busy=await tx.query(`SELECT 1 FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind<>'CLEAN_OBJECT'
      AND ((status='RUNNING' AND "leaseUntil">clock_timestamp()) OR "executionDeadlineAt">clock_timestamp()
        OR ($2::boolean AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED'))) LIMIT 1`,
    [v.resourceId,r.status!=='PENDING']);
    if(busy.rowCount)return {...result,state:'BUSY'};
    if(r.status==='PENDING'){
      if(!['PREPARING','UPLOADING','COMPLETING','PROCESSING'].includes(u.status))reject('INVALID_STATE','Carga inconsistente.');
      await terminateUpload(tx,u,'CANCELLED');
    }else if(r.status==='VERIFIED'){
      const current=await inspectResourceRetirement(tx,u);
      if(current.state==='BLOCKED')return {...result,state:'BUSY'};
      await retireVerifiedResourceInTransaction(tx,u);
    }else if(r.status!=='ARCHIVED'){
      if(!(r.status==='REJECTED'&&u.status==='FAILED'))
        reject('INVALID_STATE','Carga inconsistente.');
      await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`,[v.resourceId]);
      // Existing retired copies keep their original retention and probe dates.
      await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp(),
        "cleanupAfter"=greatest(statement_timestamp()+interval '7 days',$2::timestamptz+interval '2 seconds'),
        "nextProbeAt"=greatest(statement_timestamp()+interval '7 days',$2::timestamptz+interval '2 seconds'),"updatedAt"=clock_timestamp()
        WHERE "resourceId"=$1 AND "retiredAt" IS NULL`,[v.resourceId,u.lastPartUrlExpiresAt]);
    }
    const final=(await tx.query(`SELECT o.id,o."retiredAt" FROM "SnipersResource" r
      JOIN "SnipersStorageObject" o ON o.id=r."finalObjectId" WHERE r.id=$1`,[v.resourceId])).rows[0];
    const payload=resourceDiscardAuditSchema.parse({formatVersion:6,commandHash:hash,
      result:{...v,kind:'ADMIN_RESOURCE_DISCARD',classId:r.classId,changed:r.status!=='ARCHIVED',
        finalObjectId:final?.id??null,requestedAt:final?.retiredAt?.toISOString()??null}});
    await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
      VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[v.operationId,actor.userId,v.resourceId,JSON.stringify(payload)]);
    // Maintenance performs enqueueing, retries and all remote operations.
    return {...result,state:'DISCARDED'};
  });
}
