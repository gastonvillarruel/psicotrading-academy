import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {transaction,type Actor} from '../../src/lib/snipers/permissions';
import {createClass} from '../../src/lib/snipers/content';
import {startUpload,completeUpload} from '../../src/lib/snipers/uploads';
import {processUploadOnce,claimUploadJob} from '../../src/lib/snipers/upload-processor';
import type {CleanupStorage,MultipartCursor} from '../../src/lib/snipers/upload-storage';
import {StorageDouble,body} from '../phase3b2d/fixtures';

export const op=()=>randomUUID();
export class CleanupDouble extends StorageDouble implements CleanupStorage {
  calls:{kind:string;key:string}[]=[];
  before?: (kind:string,key:string)=>Promise<void>;
  failDelete=false;failHead=false;identityMismatch=false;
  async head(key:string){
    this.calls.push({kind:'head',key});await this.before?.('head',key);
    if(this.failHead)throw Error('Unavailable');
    const r=await super.head(key);return r&&this.identityMismatch?{...r,uploadId:op()}:r;
  }
  async abort(key='',multipartId=''){
    this.calls.push({kind:'abort',key});await this.before?.('abort',key);
    if(this.multipart.get(multipartId)===key)this.multipart.delete(multipartId);
  }
  async listMultipart(key:string,cursor:MultipartCursor|null){
    assert.equal(cursor,null);
    this.calls.push({kind:'list',key});await this.before?.('list',key);
    return {uploads:[...this.multipart].filter(([,k])=>k.startsWith(key)).map(([multipartId,key])=>({key,multipartId})),next:null};
  }
  async deleteObject(key:string){
    this.calls.push({kind:'delete',key});await this.before?.('delete',key);this.objects.delete(key);
    if(this.failDelete)throw Error('Response lost');
  }
}
export async function testActor(pool:Pool,permission?:'SNIPERS_ADMIN'|'SNIPERS_CONTENT_EDITOR'|'SNIPERS_MEMBERSHIP_MANAGER'){
  const actor:Actor={userId:op(),activeSessionId:op(),singleSession:true};
  await pool.query(`INSERT INTO "User" (id,email,name,role,"activeSessionId","updatedAt") VALUES ($1,$2,'Prueba local archivos','STUDENT',$3,clock_timestamp())`,[actor.userId,`${actor.userId}@local.invalid`,actor.activeSessionId]);
  if(permission)await pool.query('INSERT INTO "UserPermission" (id,"userId",permission) VALUES ($1,$2,$3)',[op(),actor.userId,permission]);
  return actor;
}
export async function fresh(pool:Pool,actor:Actor,{provenance=true,final=false,name='Material retirado · prueba local'}={}){
  const storage=new CleanupDouble();
  const classId=(await createClass(pool,actor,{operationId:op(),title:'Gestión emocional · prueba local',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
  const fields={operationId:op(),classId,name,file:{type:'PDF',mimeType:'application/pdf',sizeBytes:storage.payload.length},expectedSha256:createHash('sha256').update(storage.payload).digest('hex')};
  let upload:{resourceId:string;uploadId:string};
  if(provenance)upload=await startUpload(pool,actor,fields);
  else{
    upload={resourceId:op(),uploadId:op()};
    await transaction(pool,async tx=>{
      await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,$3,'PDF','application/pdf',$4,clock_timestamp())`,[upload.resourceId,classId,name,storage.payload.length]);
      await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()+interval '1 day',clock_timestamp())`,[upload.uploadId,upload.resourceId,actor.userId,fields.expectedSha256]);
      await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PREPARE_UPLOAD',clock_timestamp())`,[op(),upload.resourceId,upload.uploadId]);
      // Deliberately malformed historical receipt: transfer recognizes its marker,
      // but the cleaner must reject its unproven origin.
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[op(),actor.userId,upload.resourceId,JSON.stringify({formatVersion:2,result:{kind:'UPLOAD_START',uploadId:upload.uploadId}})]);
    });
  }
  await processUploadOnce(pool,storage,undefined,upload.uploadId);
  if(final){
    await completeUpload(pool,actor,{operationId:op(),uploadId:upload.uploadId,parts:[{partNumber:1,etag:'fixture'}]});
    await processUploadOnce(pool,storage,undefined,upload.uploadId);
    const job=await claimUploadJob(pool,true,upload.uploadId);assert.ok(job);
    await transaction(pool,async tx=>{
      const id=op(),key=`snipers/final/${upload.resourceId}/${job.generation}/${id}`;
      await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt") VALUES ($1,$2,$3,'FINAL',$4,$5,'PUT_FINAL','ACKNOWLEDGED',clock_timestamp())`,[id,upload.resourceId,key,job.id,job.generation]);
      storage.objects.set(key,storage.payload);storage.uploadIds.set(key,upload.uploadId);
    });
  }
  const objects=(await pool.query('SELECT id,key,kind FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY kind DESC,id',[upload.resourceId])).rows as {id:string;key:string;kind:string}[];
  assert.ok(objects.length);
  for(const o of objects){storage.objects.set(o.key,storage.payload);storage.uploadIds.set(o.key,upload.uploadId);}
  storage.calls=[];
  return {...upload,classId,storage,objects};
}
export async function retire(pool:Pool,f:{resourceId:string;uploadId:string},due=true){
  await transaction(pool,async tx=>{
    await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp() WHERE id=$1`,[f.resourceId]);
    await tx.query(`UPDATE "SnipersUpload" SET status='CANCELLED' WHERE id=$1`,[f.uploadId]);
    await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "uploadId"=$1 AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED')`,[f.uploadId]);
    await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',
      "cleanupAfter"=statement_timestamp()+CASE WHEN $2 THEN -interval '1 day' ELSE interval '1 day' END,
      "nextProbeAt"=statement_timestamp()+CASE WHEN $2 THEN -interval '1 day' ELSE interval '1 day' END
      WHERE "resourceId"=$1 AND "retiredAt" IS NULL`,[f.resourceId,due]);
  });
}
