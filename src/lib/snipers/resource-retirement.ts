import type {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {parse} from './contracts';
import {requirePermission,transaction,type Actor} from './permissions';
import {lockUpload,type UploadRow} from './uploads';
import {digest} from './preview';
import {reject} from './errors';
import {finalResourceIdentity,hasResourceRetirement} from './resource-retirement-proof';
import {resourceRetirementSchema,resourceRetirementAuditSchema,type ResourceRetirementView} from './resource-retirement-contracts';
import {storageResourceSchema} from './storage-management-contracts';
import {getStorageObjects,storageObjectsInTransaction,cleanStorageObject} from './storage-management';
import {inspectCleanupEligibility} from './storage-cleanup';
import type {CleanupStorage} from './upload-storage';

async function locked(tx:PoolClient,resourceId:string){
  const row=(await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1',[resourceId])).rows[0];
  if(!row)reject('INVALID_STATE','El recurso no tiene una carga acreditada.');
  return lockUpload(tx,row.id);
}
async function inspect(tx:PoolClient,u:UploadRow):Promise<ResourceRetirementView>{
  const r=(await tx.query('SELECT * FROM "SnipersResource" WHERE id=$1',[u.resourceId])).rows[0];
  const base:ResourceRetirementView={resourceId:u.resourceId,state:'PROTECTED',requested:false,canRequest:false,
    canContinue:false,availableAt:null,reason:'El archivo no cuenta con un definitivo verificado disponible para retirar.'};
  if(r.attachedAt)return {...base,reason:'Está vinculado a una clase. Primero desvinculá el archivo; archivar o despublicar la clase no lo desvincula.'};
  if(await hasResourceRetirement(tx,u.resourceId))return {...base,state:'PENDING',requested:true,reason:'Retiro definitivo registrado.'};
  if(r.status!=='VERIFIED'||r.archivedAt)return base;
  const final=(await tx.query(`SELECT o.id,o.key,o."producerGeneration" ${finalResourceIdentity}
    AND r.id=$1 AND o."retiredAt" IS NULL`,[u.resourceId])).rows[0];
  if(!final||final.key!==`snipers/final/${u.resourceId}/${final.producerGeneration}/${final.id}`)return base;
  const provenance=await inspectCleanupEligibility(tx,u,final.id);
  if(provenance!=='PROTECTED_FINAL')return {...base,reason:'No se pudo acreditar el origen y la protección del definitivo. Se conserva por seguridad.'};
  const busy=(await tx.query(`SELECT 1 FROM "SnipersFileJob" WHERE "resourceId"=$1 AND
    ((kind<>'CLEAN_OBJECT' AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED'))
      OR (status='RUNNING' AND "leaseUntil">clock_timestamp())) LIMIT 1`,[u.resourceId])).rowCount;
  if(busy)return {...base,state:'BLOCKED',reason:'Hay operaciones pendientes o una limpieza en curso. Esperá su resolución antes de solicitar el retiro.'};
  const other=(await tx.query(`SELECT 1 FROM "SnipersResource" r JOIN "SnipersStorageObject" o
    ON r."finalObjectId"=o.id OR r."objectKey"=o.key
    WHERE o."resourceId"=$1 AND r.id<>$1 LIMIT 1`,[u.resourceId])).rowCount;
  if(other)return {...base,reason:'Otro recurso todavía referencia un objeto de este archivo. Se conserva por seguridad.'};
  return {...base,state:'AVAILABLE',canRequest:true,
    reason:'Está desvinculado y puede solicitarse su retiro definitivo. Se conservan al menos siete días antes de limpiar su copia final.'};
}
export async function getResourceRetirement(pool:Pool,actor:Actor,input:unknown):Promise<ResourceRetirementView>{
  const base=await transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const v=parse(storageResourceSchema,input);
    return inspect(tx,await locked(tx,v.resourceId));
  });
  if(!base.requested)return base;
  const objects=await getStorageObjects(pool,actor,{resourceId:base.resourceId});
  if(objects.length&&objects.every(o=>o.state==='ABSENT'&&!o.availableAt))return {...base,state:'DELETED',reason:'El protocolo confirmó y registró la ausencia de todas las copias del archivo.'};
  const canContinue=objects.some(o=>o.canClean);
  if(objects.some(o=>o.state==='RUNNING'))return {...base,state:'RUNNING',reason:'Eliminación en curso. Actualizá para consultar el resultado confirmado.'};
  const blocked=objects.find(o=>['BLOCKED','PROTECTED','IN_USE','UNCERTAIN'].includes(o.state));
  if(blocked)return {...base,state:'BLOCKED',canContinue,reason:blocked.reason,availableAt:blocked.availableAt};
  const recheck=objects.find(o=>o.state==='ABSENT'&&o.availableAt);
  if(recheck)return {...base,canContinue,availableAt:recheck.availableAt,reason:'La ausencia fue observada, pero una escritura anterior incierta requiere otra revisión. La eliminación todavía no se considera completada.'};
  const dates=objects.filter(o=>o.state!=='ABSENT'&&o.availableAt).map(o=>o.availableAt!).sort();
  return {...base,canContinue,availableAt:dates[0]??null,reason:canContinue
    ?'Retiro registrado. Hay copias elegibles; cada ejecución procesa como máximo una copia.'
    :'Retiro registrado. La eliminación física espera el plazo de conservación o la próxima revisión. No se emiten nuevos enlaces ni se permite volver a vincularlo.'};
}

// Both administrative interfaces use this single resource-scoped mutation. The
// browser supplies no object/key; selection is derived from locked SQL inventory.
export async function requestResourceRetirement(pool:Pool,actor:Actor,input:unknown,storage:()=>CleanupStorage):Promise<ResourceRetirementView>{
  const request=await transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const v=parse(resourceRetirementSchema,input),kind='RESOURCE_RETIREMENT_REQUEST' as const;
    const hash=digest({kind,...v});
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[v.operationId]);
    const old=(await tx.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[v.operationId])).rows[0];
    if(old){
      const p=resourceRetirementAuditSchema.safeParse(old.payload);
      if(!p.success||old.actorUserId!==actor.userId||old.action!=='FILE_FOUNDATION_CHANGED'
        ||old.entityType!=='SnipersResource'||old.entityId!==v.resourceId||p.data.commandHash!==hash
        ||p.data.result.resourceId!==v.resourceId||p.data.result.operationId!==v.operationId)
        reject('IDEMPOTENCY_CONFLICT','Solicitud diferente.');
      const u=await locked(tx,v.resourceId);
      if(!await hasResourceRetirement(tx,u.resourceId,p.data.result.finalObjectId))reject('INVALID_STATE','Retiro no acreditado.');
      return p.data.result;
    }
    const u=await locked(tx,v.resourceId),current=await inspect(tx,u);
    const objects=await storageObjectsInTransaction(tx,u);
    const target=objects.some(o=>o.state==='RUNNING')?undefined:objects.find(o=>o.canClean);
    if(!current.requested){
      if(!current.canRequest)reject('INVALID_STATE','El recurso no admite retiro definitivo.');
      // Millisecond timestamp is persisted identically in the intent and both rows.
      const now=(await tx.query("SELECT date_trunc('milliseconds',clock_timestamp()+interval '1 millisecond') AS now")).rows[0].now as Date;
      const r=(await tx.query('SELECT "finalObjectId" FROM "SnipersResource" WHERE id=$1',[v.resourceId])).rows[0];
      await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=$2,"updatedAt"=$2 WHERE id=$1`,[v.resourceId,now]);
      await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=$2,
        "cleanupAfter"=greatest("cleanupAfter",$2::timestamptz+interval '7 days'),
        "nextProbeAt"=greatest("nextProbeAt","cleanupAfter",$2::timestamptz+interval '7 days'),"updatedAt"=$2 WHERE id=$1`,[r.finalObjectId,now]);
    }
    const r=(await tx.query(`SELECT r."finalObjectId",o."retiredAt" FROM "SnipersResource" r
        JOIN "SnipersStorageObject" o ON o.id=r."finalObjectId" WHERE r.id=$1`,[v.resourceId])).rows[0];
    const result={kind,...v,finalObjectId:r.finalObjectId,requestedAt:r.retiredAt.toISOString(),
      cleanupObjectId:target?.id??null,cleanupOperationId:target?randomUUID():null};
    const payload=resourceRetirementAuditSchema.parse({formatVersion:5,commandHash:hash,result});
    await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[v.operationId,actor.userId,v.resourceId,JSON.stringify(payload)]);
    // Further requests get their own actor receipt, without changing retirement dates.
    return result;
  });
  if(request.cleanupObjectId&&request.cleanupOperationId){
    // Reuse the existing exact-object administrative receipt and bounded cleaner.
    // A replay can only recover that visit; it cannot select a sibling or reopen it.
    const objects=await getStorageObjects(pool,actor,{resourceId:request.resourceId});
    const target=objects.find(o=>o.id===request.cleanupObjectId);
    if(!target)reject('INVALID_STATE','El objeto solicitado no pertenece al recurso.');
    const started=(await pool.query('SELECT 1 FROM "SnipersAuditEvent" WHERE id=$1',[request.cleanupOperationId])).rowCount;
    if(target?.canClean||started)await cleanStorageObject(pool,actor,
      {operationId:request.cleanupOperationId,objectId:request.cleanupObjectId},storage);
  }
  return getResourceRetirement(pool,actor,{resourceId:request.resourceId});
}
