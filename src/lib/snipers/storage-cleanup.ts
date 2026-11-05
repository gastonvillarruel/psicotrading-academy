// Trusted worker only. No remote listing can authorize an object or a new key.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {Pool,PoolClient} from 'pg';
import type {z} from 'zod';
import {transaction} from './permissions';
import {lockUpload,terminateUpload,type UploadRow} from './uploads';
import {uploadReceiptSchema} from './upload-contracts';
import {cleanupAuditSchema,type cleanupError} from './file-contracts';
import {digest} from './preview';
import {LostLease} from './upload-processor';
import type {CleanupStorage,MultipartCursor} from './upload-storage';

type ErrorCode=z.infer<typeof cleanupError>;
type Audit=z.infer<typeof cleanupAuditSchema>['result'];
type Target={id:string;resourceId:string;key:string;kind:'TEMPORARY'|'FINAL';producerJobId:string;producerGeneration:number;
  writeState:string;activatedAt:Date|null;retiredAt:Date|null;cleanupAfter:Date|null;nextProbeAt:Date|null;
  cleanupState:string;protected:boolean;active:boolean;producerKind:string;producerUploadId:string;
  producerCurrentGeneration:number;now:Date};
export type CleanupClaim={id:string;uploadId:string;resourceId:string;objectId:string;generation:number;leaseToken:string};
const terminal=['SUCCEEDED','FAILED','CANCELLED','EXPIRED'];
const origin=`EXISTS (SELECT 1 FROM "SnipersAuditEvent" a WHERE a.action='FILE_FOUNDATION_CHANGED'
  AND a."entityType"='SnipersResource' AND a."entityId"=u."resourceId" AND a.payload->>'formatVersion'='2'
  AND a.payload->'result'->>'kind'='UPLOAD_START' AND a.payload->'result'->>'uploadId'=u.id)`;
class UnsafeTarget extends Error {constructor(readonly code:ErrorCode){super(code);}}

async function audit(tx:PoolClient,u:UploadRow,kind:Audit['kind'],job?:CleanupClaim,phase:Audit['phase']='RESERVED',errorCode:ErrorCode|null=null){
  const result:Audit={operationId:randomUUID(),resourceId:u.resourceId,uploadId:u.id,objectId:job?.objectId??null,
    jobId:job?.id??null,generation:job?.generation??0,phase,kind,errorCode};
  const payload=cleanupAuditSchema.parse({formatVersion:3,commandHash:digest(result),result});
  await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
    VALUES ($1,NULL,'FILE_FOUNDATION_CHANGED','SnipersResource',$2,$3::jsonb)`,[result.operationId,u.resourceId,JSON.stringify(payload)]);
}
async function provenance(tx:PoolClient,u:UploadRow){
  const rows=(await tx.query(`SELECT id,"actorUserId","entityId",payload FROM "SnipersAuditEvent"
    WHERE action='FILE_FOUNDATION_CHANGED' AND "entityType"='SnipersResource' AND "entityId"=$1
    AND payload->>'formatVersion'='2' AND payload->'result'->>'kind'='UPLOAD_START'`,[u.resourceId])).rows;
  return rows.some(a=>{const p=uploadReceiptSchema.safeParse(a.payload);return p.success&&a.actorUserId===u.creatorId
    &&p.data.result.operationId===a.id&&p.data.result.uploadId===u.id&&p.data.result.resourceId===u.resourceId;});
}
async function target(tx:PoolClient,id:string):Promise<Target|null>{
  return (await tx.query(`SELECT o.*,p.kind AS "producerKind",p."uploadId" AS "producerUploadId",
    p.generation AS "producerCurrentGeneration",clock_timestamp() AS now,
    EXISTS (SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key) AS protected,
    EXISTS (SELECT 1 FROM "SnipersFileJob" j WHERE j."resourceId"=o."resourceId" AND j.kind<>'CLEAN_OBJECT'
      AND j.status NOT IN ('SUCCEEDED','FAILED','CANCELLED')) AS active
    FROM "SnipersStorageObject" o JOIN "SnipersFileJob" p ON p.id=o."producerJobId" WHERE o.id=$1`,[id])).rows[0]??null;
}
function eligibility(u:UploadRow,o:Target|null):ErrorCode|null{
  if(!o||o.resourceId!==u.resourceId)return 'INVALID_OBJECT_IDENTITY';
  if(o.activatedAt||o.protected)return 'PROTECTED_FINAL';
  if(!terminal.includes(u.status)||o.active)return 'DEPENDENCY_ACTIVE';
  if(!o.retiredAt||!o.cleanupAfter||!o.nextProbeAt||o.cleanupAfter>o.now||o.nextProbeAt>o.now
    ||(u.lastPartUrlExpiresAt&&new Date(u.lastPartUrlExpiresAt.getTime()+2000)>o.now))return 'RETENTION_PENDING';
  const expected=`snipers/${o.kind==='FINAL'?'final':'temporary'}/${u.resourceId}/${o.producerGeneration}/${o.id}`;
  if(o.key!==expected||o.producerUploadId!==u.id||o.producerCurrentGeneration<o.producerGeneration
    ||o.producerKind!==(o.kind==='FINAL'?'PROCESS_UPLOAD':'PREPARE_UPLOAD'))return 'INVALID_OBJECT_IDENTITY';
  return null;
}

// One aggregate per call. Rechecking under canonical locks resolves finalization/expiry races.
export async function maintainStorageOnce(pool:Pool,uploadId?:string):Promise<boolean>{
  return transaction(pool,async tx=>{
    const row=(await tx.query(`SELECT u.id FROM "SnipersUpload" u WHERE ${origin}
      AND NOT EXISTS (SELECT 1 FROM "SnipersAuditEvent" a WHERE a."entityId"=u."resourceId" AND a.action='FILE_FOUNDATION_CHANGED'
        AND a.payload->>'formatVersion'='3' AND a.payload->'result'->>'kind'='CLEANUP_BLOCKED'
        AND a.payload->'result'->>'errorCode'='INVALID_PROVENANCE' AND a.payload->'result'->>'jobId' IS NULL)
      AND ($1::text IS NULL OR u.id=$1) AND (
      (u.status IN ('PREPARING','UPLOADING') AND u."expiresAt"<=clock_timestamp()) OR EXISTS (
        SELECT 1 FROM "SnipersStorageObject" o LEFT JOIN "SnipersFileJob" j ON j."storageObjectId"=o.id AND j.kind='CLEAN_OBJECT'
        WHERE o."resourceId"=u."resourceId" AND u.status IN ('SUCCEEDED','FAILED','CANCELLED','EXPIRED')
        AND o."retiredAt" IS NOT NULL AND o."activatedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key)
        AND (j.id IS NULL OR (j.status='SUCCEEDED' AND o."writeState" IN ('IN_FLIGHT','UNCERTAIN') AND o."nextProbeAt"<=clock_timestamp()))))
      ORDER BY u."createdAt",u.id LIMIT 1`,[uploadId??null])).rows[0];
    if(!row)return false;
    const u=await lockUpload(tx,row.id);
    if(!await provenance(tx,u)){await audit(tx,u,'CLEANUP_BLOCKED',undefined,'RESERVED','INVALID_PROVENANCE');return true;}
    const now=(await tx.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    if(['PREPARING','UPLOADING'].includes(u.status)&&u.expiresAt<=now){
      await terminateUpload(tx,u,'EXPIRED');u.status='EXPIRED';await audit(tx,u,'UPLOAD_EXPIRED');
    }
    if(!terminal.includes(u.status))return false;
    const object=(await tx.query(`SELECT o.id,j.id AS "jobId",j.status FROM "SnipersStorageObject" o
      LEFT JOIN "SnipersFileJob" j ON j."storageObjectId"=o.id AND j.kind='CLEAN_OBJECT'
      WHERE o."resourceId"=$1 AND o."retiredAt" IS NOT NULL AND o."activatedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "SnipersResource" r WHERE r."finalObjectId"=o.id OR r."objectKey"=o.key)
      AND (j.id IS NULL OR (j.status='SUCCEEDED' AND o."writeState" IN ('IN_FLIGHT','UNCERTAIN') AND o."nextProbeAt"<=clock_timestamp()))
      ORDER BY o."nextProbeAt",o.id LIMIT 1`,[u.resourceId])).rows[0];
    if(object){
      if(object.jobId)await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',phase='RESERVED',"completedGeneration"=NULL,
        "availableAt"=clock_timestamp(),"errorCode"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1`,[object.jobId]);
      else await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"availableAt","updatedAt")
        SELECT $1,"resourceId",id,'CLEAN_OBJECT',greatest("cleanupAfter","nextProbeAt"),clock_timestamp() FROM "SnipersStorageObject" WHERE id=$2
        ON CONFLICT ("storageObjectId") WHERE kind='CLEAN_OBJECT' DO NOTHING`,[randomUUID(),object.id]);
    }
    return true;
  });
}
async function blocked(tx:PoolClient,u:UploadRow,job:CleanupClaim,code:ErrorCode){
  // CANCELLED can fence an expired RUNNING lease; no producer is modified.
  await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL,"completedGeneration"=NULL WHERE id=$1`,[job.id]);
  await tx.query(`UPDATE "SnipersFileJob" SET status='BLOCKED',"errorCode"=$2,"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id,code]);
  await audit(tx,u,'CLEANUP_BLOCKED',job,'RESERVED',code);
}
export async function claimCleanupJob(pool:Pool,objectId?:string):Promise<CleanupClaim|null>{
  return transaction(pool,async tx=>{
    const candidate=(await tx.query(`SELECT j.id,j."resourceId",j."storageObjectId" AS "objectId",j.generation,u.id AS "uploadId"
      FROM "SnipersFileJob" j JOIN "SnipersUpload" u ON u."resourceId"=j."resourceId"
      WHERE j.kind='CLEAN_OBJECT' AND ($1::text IS NULL OR j."storageObjectId"=$1) AND j."availableAt"<=clock_timestamp()
      AND (j.status IN ('READY','WAIT_RETRY') OR (j.status='RUNNING' AND j."leaseUntil"<=clock_timestamp()))
      ORDER BY j."availableAt",j.id LIMIT 1`,[objectId??null])).rows[0];
    if(!candidate)return null;
    const u=await lockUpload(tx,candidate.uploadId);
    const current=(await tx.query(`SELECT status,"availableAt","leaseUntil",generation FROM "SnipersFileJob" WHERE id=$1`,[candidate.id])).rows[0];
    const now=(await tx.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    if(current.availableAt>now||(!['READY','WAIT_RETRY'].includes(current.status)&&!(current.status==='RUNNING'&&current.leaseUntil<=now)))return null;
    const o=await target(tx,candidate.objectId),code=await provenance(tx,u)?eligibility(u,o):'INVALID_PROVENANCE';
    if(code){
      if(code==='RETENTION_PENDING'&&o?.retiredAt){
        await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL,"completedGeneration"=NULL WHERE id=$1`,[candidate.id]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"availableAt"=greatest($2,$3,clock_timestamp()+interval '15 minutes'),"errorCode"='RETENTION_PENDING' WHERE id=$1`,[candidate.id,o.cleanupAfter,o.nextProbeAt]);
      }else await blocked(tx,u,candidate,code);
      return null;
    }
    const job=(await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,
      "leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '60 seconds',"errorCode"=NULL,"updatedAt"=clock_timestamp()
      WHERE id=$1 RETURNING id,generation,"leaseToken"`,[candidate.id,randomUUID()])).rows[0];
    return {...candidate,...job};
  });
}
async function fenced<T>(pool:Pool,job:CleanupClaim,work:(tx:PoolClient,u:UploadRow,o:Target)=>Promise<T>,check=true):Promise<T>{
  return transaction(pool,async tx=>{
    const u=await lockUpload(tx,job.uploadId);
    const found=await tx.query(`SELECT 1 FROM "SnipersFileJob" WHERE id=$1 AND kind='CLEAN_OBJECT'
      AND "storageObjectId"=$2 AND generation=$3 AND "leaseToken"=$4 AND status='RUNNING' AND "leaseUntil">clock_timestamp()`,
    [job.id,job.objectId,job.generation,job.leaseToken]);
    if(!found.rowCount)throw new LostLease();
    const o=await target(tx,job.objectId);
    if(check){const code=await provenance(tx,u)?eligibility(u,o):'INVALID_PROVENANCE';if(code)throw new UnsafeTarget(code);}
    if(!o)throw new LostLease();
    return work(tx,u,o);
  });
}
export async function heartbeatCleanupJob(pool:Pool,job:CleanupClaim):Promise<boolean>{
  try{return await fenced(pool,job,async tx=>{
    await tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '60 seconds',"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id]);return true;
  });}catch(e){if(e instanceof LostLease||e instanceof UnsafeTarget)return false;throw e;}
}

// A local abort stops waiting; it cannot assert that the provider cancelled an issued request.
function bounded<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export async function processCleanupOnce(pool:Pool,storage:CleanupStorage,shutdown?:AbortSignal,objectId?:string):Promise<boolean>{
  if(shutdown?.aborted)return false;
  const started=performance.now(),job=await claimCleanupJob(pool,objectId);
  if(!job)return false;
  const controller=new AbortController();
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,Math.floor(30000-(performance.now()-started)))),...(shutdown?[shutdown]:[])]);
  let stopped=false;
  const heartbeats=(async()=>{
    while(!stopped&&!signal.aborted){
      await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};
        const timer=setTimeout(done,20000);controller.signal.addEventListener('abort',done,{once:true});if(controller.signal.aborted)done();});
      if(stopped||signal.aborted)return;
      try{if(!await heartbeatCleanupJob(pool,job))controller.abort();}catch{controller.abort();}
    }
  })();
  const remote=async<T>(phase:Audit['phase'],work:(o:Target,s:AbortSignal)=>Promise<T>,destructive=false)=>{
    signal.throwIfAborted();
    const o=await fenced(pool,job,async(tx,u,o)=>{
      await tx.query('UPDATE "SnipersFileJob" SET phase=$2 WHERE id=$1',[job.id,phase]);
      if(destructive&&!((await tx.query(`SELECT 1 FROM "SnipersAuditEvent" WHERE action='FILE_FOUNDATION_CHANGED'
        AND "entityId"=$1 AND payload->>'formatVersion'='3' AND payload->'result'->>'jobId'=$2
        AND payload->'result'->>'generation'=$3 AND payload->'result'->>'phase'=$4
        AND payload->'result'->>'kind'='CLEANUP_INTENT'`,[u.resourceId,job.id,String(job.generation),phase])).rowCount))await audit(tx,u,'CLEANUP_INTENT',job,phase);
      return o;
    });
    const callSignal=AbortSignal.any([signal,AbortSignal.timeout(10000)]);
    const result=await bounded(()=>work(o,callSignal),callSignal);
    callSignal.throwIfAborted();signal.throwIfAborted();
    await fenced(pool,job,async()=>{});
    return result;
  };
  try{
    const o=await fenced(pool,job,async(_tx,_u,o)=>o);
    // Inventory authorizes the key; contradictory remote identity still fails closed.
    const present=await remote('PROBE',(o,s)=>storage.head(o.key,s));
    if(present&&present.uploadId!==job.uploadId)throw new UnsafeTarget('INVALID_OBJECT_IDENTITY');
    if(o.kind==='TEMPORARY'){
      const u=await fenced(pool,job,async(_tx,u)=>u);
      if(u.temporaryObjectId===o.id&&u.multipartUploadId)await remote('ABORT_MULTIPART',(o,s)=>storage.abort(o.key,u.multipartUploadId!,s),true);
      // Abort only exact matches discovered for this already-authorized SQL key.
      const scan=async(abort:boolean)=>{
        let cursor:MultipartCursor|null=null;const seen=new Set<string>();
        do{
          const page=await remote('PROBE',(o,s)=>storage.listMultipart(o.key,cursor,s));
          if(!Array.isArray(page.uploads))throw new UnsafeTarget('MULTIPART_RESPONSE_INVALID');
          for(const upload of page.uploads){
            if(typeof upload.key!=='string'||!upload.multipartId)throw new UnsafeTarget('MULTIPART_RESPONSE_INVALID');
            if(upload.key===o.key){if(!abort)return false;await remote('ABORT_MULTIPART',(o,s)=>storage.abort(o.key,upload.multipartId,s),true);}
          }
          cursor=page.next;
          if(cursor){const marker=JSON.stringify(cursor);if(!cursor.keyMarker||!cursor.uploadIdMarker||seen.has(marker))throw new UnsafeTarget('MULTIPART_RESPONSE_INVALID');seen.add(marker);}
        }while(cursor);
        return true;
      };
      await scan(true);
      if(!await scan(false))throw new Error('Multipart remains');
    }
    await remote('DELETE',(o,s)=>storage.deleteObject(o.key,s),true);
    if(await remote('PROBE',(o,s)=>storage.head(o.key,s)))throw new Error('Object remains');
    signal.throwIfAborted();
    await fenced(pool,job,async(tx,u,o)=>{
      signal.throwIfAborted();
      await tx.query(`UPDATE "SnipersStorageObject" SET "cleanupState"='QUIESCENT',"lastProbeAt"=statement_timestamp(),
        "lastAbsentAt"=statement_timestamp(),"nextProbeAt"=greatest("cleanupAfter",statement_timestamp()+interval '7 days'),"updatedAt"=clock_timestamp() WHERE id=$1`,[o.id]);
      await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',phase='PROBE',"completedGeneration"=generation,
        "leaseToken"=NULL,"leaseUntil"=NULL,"errorCode"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id]);
      if(o.cleanupState!=='QUIESCENT')await audit(tx,u,'CLEANUP_QUIESCENT',job,'PROBE');
    });
  }catch(error){
    if((error as {severity?:string}).severity)throw error;
    if(!(error instanceof LostLease))try{
      await fenced(pool,job,async(tx,u,o)=>{
        if(error instanceof UnsafeTarget){await blocked(tx,u,job,error.code);return;}
        const name=(error as {name?:string}).name;
        if(['AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch','NoSuchBucket'].includes(name??'')
          ||[401,403].includes((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode??0)){
          await blocked(tx,u,job,'STORAGE_CONFIGURATION');return;
        }
        const code:ErrorCode=signal.aborted?'VISIT_INTERRUPTED':'STORAGE_UNAVAILABLE';
        await tx.query(`UPDATE "SnipersStorageObject" SET "cleanupState"='PENDING',"lastProbeAt"=clock_timestamp(),
          "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()+interval '15 minutes'),"updatedAt"=clock_timestamp() WHERE id=$1`,[o.id]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"leaseToken"=NULL,"leaseUntil"=NULL,
          "availableAt"=greatest(clock_timestamp()+interval '15 minutes',$2::timestamptz),"errorCode"=$3,"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id,o.cleanupAfter,code]);
        await audit(tx,u,'CLEANUP_RETRY',job,'RESERVED',code);
      },false);
    }catch(e){if(!(e instanceof LostLease))throw e;}
  }finally{stopped=true;controller.abort();await heartbeats;}
  return true;
}
