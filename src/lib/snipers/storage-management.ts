// Session-bound storage facade only; R2 identities never leave this module.
import type {Pool,PoolClient} from 'pg';
import {parse} from './contracts';
import {requirePermission,transaction,type Actor} from './permissions';
import {lockUpload,type UploadRow} from './uploads';
import {inspectCleanupEligibility,maintainStorageOnce,processCleanupOnce} from './storage-cleanup';
import {digest} from './preview';
import {reject} from './errors';
import type {CleanupStorage} from './upload-storage';
import {retirementCandidate} from './resource-retirement-proof';
import {storagePageSchema,storageResourceSchema,storageCleanupSchema,storageRequestAuditSchema,
  type StoragePage,type StorageResource,type StorageSummary,type StorageObjectView} from './storage-management-contracts';

type ObjectRow={id:string;resourceId:string;kind:'TEMPORARY'|'FINAL';verifiedSizeBytes:string|null;createdAt:Date;
  activatedAt:Date|null;retiredAt:Date|null;cleanupAfter:Date|null;nextProbeAt:Date|null;lastAbsentAt:Date|null;
  cleanupState:string;writeState:string;protected:boolean;jobStatus:string|null;leaseUntil:Date|null;
  availableAt:Date|null;generation:number|null;errorCode:string|null;now:Date};
const iso=(v:Date|null)=>v?.toISOString()??null;
const messages:Record<string,string>={
  PROTECTED_FINAL:'Es un archivo definitivo protegido. Desvincularlo o archivar su clase no permite eliminarlo.',
  DEPENDENCY_ACTIVE:'La carga o su procesamiento todavía tienen operaciones pendientes.',
  RETENTION_PENDING:'Debe cumplirse el plazo de conservación y revisión antes de limpiarlo.',
  INVALID_PROVENANCE:'No se pudo acreditar el origen del objeto. Se conserva por seguridad.',
  INVALID_OBJECT_IDENTITY:'No se pudo acreditar la identidad del objeto. Se conserva por seguridad.',
  STORAGE_CONFIGURATION:'La configuración de almacenamiento requiere revisión.',
  MULTIPART_RESPONSE_INVALID:'El almacenamiento no confirmó una respuesta completa. Se conserva por seguridad.',
};
async function rows(tx:PoolClient,resourceId:string):Promise<ObjectRow[]>{
  return (await tx.query<ObjectRow>(`SELECT o.id,o."resourceId",o.kind,o."verifiedSizeBytes",o."createdAt",
    o."activatedAt",o."retiredAt",o."cleanupAfter",o."nextProbeAt",o."lastAbsentAt",o."cleanupState",o."writeState",
    EXISTS(SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key) AS protected,
    j.status AS "jobStatus",j."leaseUntil",j."availableAt",j.generation,j."errorCode",clock_timestamp() AS now
    FROM "SnipersStorageObject" o LEFT JOIN "SnipersFileJob" j ON j."storageObjectId"=o.id AND j.kind='CLEAN_OBJECT'
    WHERE o."resourceId"=$1 ORDER BY o."createdAt",o.id`,[resourceId])).rows;
}
async function view(tx:PoolClient,u:UploadRow,o:ObjectRow):Promise<StorageObjectView>{
  const code=await inspectCleanupEligibility(tx,u,o.id);
  const deadlines=[o.cleanupAfter,o.nextProbeAt,o.availableAt,
    u.lastPartUrlExpiresAt?new Date(u.lastPartUrlExpiresAt.getTime()+2000):null].filter((d):d is Date=>!!d);
  const availableAt=deadlines.length?new Date(Math.max(...deadlines.map(d=>d.getTime()))):null;
  const result:StorageObjectView={id:o.id,resourceId:o.resourceId,kind:o.kind,createdAt:o.createdAt.toISOString(),
    sizeBytes:o.verifiedSizeBytes,state:'PENDING',canClean:false,reason:'Pendiente de revisión de limpieza.',
    availableAt:iso(availableAt),lastAbsentAt:iso(o.lastAbsentAt)};
  if(code==='PROTECTED_FINAL')return {...result,state:'PROTECTED',reason:messages.PROTECTED_FINAL,availableAt:null};
  if(o.jobStatus==='RUNNING'&&o.leaseUntil&&o.leaseUntil>o.now)
    return {...result,state:'RUNNING',reason:'Hay una limpieza en curso. Actualizá para consultar su resultado.'};
  const uncertainWrite=['IN_FLIGHT','UNCERTAIN'].includes(o.writeState);
  if(o.cleanupState==='QUIESCENT'&&o.lastAbsentAt&&o.jobStatus==='SUCCEEDED'
    &&!(uncertainWrite&&o.nextProbeAt&&o.nextProbeAt<=o.now))
    return {...result,state:'ABSENT',reason:uncertainWrite
      ?'La ausencia fue confirmada. Una escritura anterior incierta requiere otra revisión en la fecha indicada.'
      :'El protocolo confirmó la ausencia del objeto.',availableAt:uncertainWrite?iso(o.nextProbeAt):null};
  if(code==='RETENTION_PENDING'&&o.jobStatus==='WAIT_RETRY'&&['STORAGE_UNAVAILABLE','VISIT_INTERRUPTED'].includes(o.errorCode??''))
    return {...result,state:'UNCERTAIN',reason:'El intento anterior no confirmó ausencia. El protocolo permite reintentar a partir de la fecha indicada.'};
  if(code)return {...result,state:code==='DEPENDENCY_ACTIVE'?'IN_USE':code==='RETENTION_PENDING'?'RETAINED':'BLOCKED',
    reason:messages[code]??'No se permite la limpieza en el estado actual.',availableAt:code==='RETENTION_PENDING'?iso(availableAt):null};
  if(o.jobStatus==='BLOCKED'||o.jobStatus==='CANCELLED')
    return {...result,state:'BLOCKED',reason:messages[o.errorCode??'']??'La limpieza está bloqueada y requiere revisión. No se reabre desde esta pantalla.'};
  if(o.availableAt&&o.availableAt>o.now)
    return {...result,state:'UNCERTAIN',reason:'El intento anterior no confirmó ausencia. El protocolo permite reintentar a partir de la fecha indicada.'};
  return {...result,state:'ELIGIBLE',canClean:true,reason:'Objeto retirado, sin referencias protegidas ni operaciones pendientes; su plazo de conservación se cumplió.'};
}
async function lockedResource(tx:PoolClient,resourceId:string){
  const identity=(await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1',[resourceId])).rows[0];
  if(!identity){
    if(!(await tx.query('SELECT 1 FROM "SnipersResource" WHERE id=$1',[resourceId])).rowCount)reject('NOT_FOUND','Recurso inexistente.');
    return null;
  }
  return lockUpload(tx,identity.id);
}
export async function listStorageResources(pool:Pool,actor:Actor,input:unknown):Promise<StoragePage>{
  return transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const v=parse(storagePageSchema,input);
    const items=(await tx.query<StorageResource & {createdAt:Date}>(`SELECT r.id,r.name,r.type,r."sizeBytes",r."createdAt",
      r."classId",c.title AS "classTitle",c.status AS "classStatus",r.status,r."attachedAt" IS NOT NULL AS attached,
      (SELECT count(*)::text FROM "SnipersStorageObject" o WHERE o."resourceId"=r.id) AS "objectCount"
      FROM "SnipersResource" r JOIN "SnipersClass" c ON c.id=r."classId"
      ORDER BY r."createdAt" DESC,r.id LIMIT 26 OFFSET $1`,[v.offset])).rows;
    const resources=(await tx.query(`SELECT count(*)::text AS resources,coalesce(sum("sizeBytes"),0)::text AS "logicalBytes",
      count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM "SnipersStorageObject" o WHERE o."resourceId"=r.id))::text AS "withoutObjects"
      FROM "SnipersResource" r`)).rows[0];
    const objects=(await tx.query(`SELECT count(*)::text AS objects,
      count(*) FILTER(WHERE "verifiedSizeBytes" IS NOT NULL)::text AS "verifiedObjects",
      coalesce(sum("verifiedSizeBytes"),0)::text AS "verifiedBytes",
      count(*) FILTER(WHERE "verifiedSizeBytes" IS NULL)::text AS "unknownSizeObjects",
      count(*) FILTER(WHERE "cleanupState"='QUIESCENT' AND "lastAbsentAt" IS NOT NULL)::text AS "absentObjects",
      count(*) FILTER(WHERE "retiredAt" IS NOT NULL AND "cleanupState"<>'QUIESCENT'
        AND (("activatedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key))
          OR ${retirementCandidate}))::text AS "pendingObjects"
      FROM "SnipersStorageObject" o`)).rows[0];
    return {items:items.slice(0,25).map(r=>({...r,createdAt:r.createdAt.toISOString()})),offset:v.offset,
      hasMore:items.length>25,summary:{...resources,...objects} as StorageSummary};
  });
}
export async function getStorageObjects(pool:Pool,actor:Actor,input:unknown):Promise<StorageObjectView[]>{
  return transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const v=parse(storageResourceSchema,input),u=await lockedResource(tx,v.resourceId);
    if(!u)return [];
    return storageObjectsInTransaction(tx,u);
  });
}
// Internal read model: caller holds authorization and the aggregate locks.
export async function storageObjectsInTransaction(tx:PoolClient,u:UploadRow):Promise<StorageObjectView[]>{
  const result=[];
  for(const o of await rows(tx,u.resourceId))result.push(await view(tx,u,o));
  return result;
}
export async function cleanStorageObject(pool:Pool,actor:Actor,input:unknown,storage:()=>CleanupStorage):Promise<StorageObjectView>{
  // The durable actor receipt is independent of the cleaner's existing system audit.
  // Its baseline generation prevents replays of a completed request from starting another visit.
  const request=await transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const v=parse(storageCleanupSchema,input),hash=digest({kind:'ADMIN_CLEANUP_REQUEST',...v});
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[v.operationId]);
    const old=(await tx.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[v.operationId])).rows[0];
    if(old){
      const p=storageRequestAuditSchema.safeParse(old.payload);
      if(!p.success||old.actorUserId!==actor.userId||old.action!=='FILE_FOUNDATION_CHANGED'
        ||old.entityType!=='SnipersResource'||p.data.commandHash!==hash||p.data.result.operationId!==old.id
        ||p.data.result.resourceId!==old.entityId||p.data.result.objectId!==v.objectId)reject('IDEMPOTENCY_CONFLICT','Solicitud diferente.');
      return p.data.result;
    }
    const identity=(await tx.query('SELECT "resourceId" FROM "SnipersStorageObject" WHERE id=$1',[v.objectId])).rows[0];
    if(!identity)reject('NOT_FOUND','Objeto inexistente.');
    const u=await lockedResource(tx,identity.resourceId);
    if(!u)reject('INVALID_STATE','Carga no acreditada.');
    const o=(await rows(tx,identity.resourceId)).find(o=>o.id===v.objectId)!;
    if(!(await view(tx,u,o)).canClean)reject('INVALID_STATE','El objeto no es elegible.');
    const result={kind:'ADMIN_CLEANUP_REQUEST' as const,...v,resourceId:identity.resourceId as string,generation:o.generation??0};
    const payload=storageRequestAuditSchema.parse({formatVersion:4,commandHash:hash,result});
    await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
      VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[v.operationId,actor.userId,result.resourceId,JSON.stringify(payload)]);
    return result;
  });
  // Recheck session, permission, eligibility and live leases before any remote work.
  const work=await transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_ADMIN',true);
    const u=await lockedResource(tx,request.resourceId);
    if(!u)reject('INVALID_STATE','Carga no acreditada.');
    const o=(await rows(tx,request.resourceId)).find(o=>o.id===request.objectId);
    if(!o)reject('NOT_FOUND','Objeto inexistente.');
    const current=await view(tx,u,o);
    const finished=(o.generation??0)>request.generation&&o.jobStatus!=='RUNNING';
    return {uploadId:u.id,run:current.canClean&&!finished};
  });
  if(work.run){
    const adapter=storage();
    await maintainStorageOnce(pool,work.uploadId,request.objectId);
    await processCleanupOnce(pool,adapter,undefined,request.objectId);
  }
  const result=(await getStorageObjects(pool,actor,{resourceId:request.resourceId})).find(o=>o.id===request.objectId);
  if(!result)reject('NOT_FOUND','Objeto inexistente.');
  return result;
}
