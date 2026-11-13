// One object and one producer per new upload. No copy, replayed writes or recovery generations.
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {transaction,requirePermission,type Actor} from './permissions';
import {lockUpload,terminateSingleUpload,type UploadRow} from './uploads';
import {fencedUploadJob,matchingParts,LostLease,type Claim} from './upload-processor';
import {inspectBytes,ValidationFailure,type ValidationStorage} from './file-validation';
import {checkBasicFormat,BASIC_VALIDATION_POLICY} from './basic-file-validation';
import type {MultipartStorage} from './upload-storage';
import type {PrivateFileType} from './file-contracts';

async function claim(pool:Pool,actor:Actor,uploadId:string):Promise<Claim|null>{
  return transaction(pool,async tx=>{
    await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);
    const u=await lockUpload(tx,uploadId);
    if(!u.singleObject||u.creatorId!==actor.userId)throw new LostLease();
    if(!['PREPARING','COMPLETING','PROCESSING'].includes(u.status))return null;
    const j=(await tx.query(`SELECT *,clock_timestamp() AS now FROM "SnipersFileJob" WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[uploadId])).rows[0];
    if(!j)throw Error('Missing upload job');
    if(u.classStatus==='ARCHIVED'||u.expiresAt<=j.now){await terminateSingleUpload(tx,u,'CANCELLED');return null;}
    if(j.status==='RUNNING'){
      if(j.leaseUntil<=j.now)await terminateSingleUpload(tx,u,'FAILED','UPLOAD_INTERRUPTED');
      return null;
    }
    if(!['READY','WAIT_RETRY'].includes(j.status)||j.availableAt>j.now)return null;
    const job=(await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=generation+1,attempts=attempts+1,
      "leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '60 seconds',"errorCode"=NULL,"updatedAt"=clock_timestamp()
      WHERE id=$1 RETURNING *`,[j.id,randomUUID()])).rows[0];
    return {...job,previousPhase:j.phase,upload:u};
  });
}

export async function advanceSingleObjectUpload(pool:Pool,actor:Actor,uploadId:string,
  storage:MultipartStorage&ValidationStorage,shutdown?:AbortSignal){
  const job=await claim(pool,actor,uploadId);if(!job)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const signal=shutdown?AbortSignal.any([controller.signal,shutdown]):controller.signal;
  const fenced=<T>(work:(tx:PoolClient,u:UploadRow)=>Promise<T>)=>fencedUploadJob(pool,job,async(tx,u)=>{
    await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);
    if(u.creatorId!==actor.userId||!u.singleObject)throw new LostLease();
    return work(tx,u);
  });
  const yieldStep=(tx:PoolClient,phase:string)=>tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',phase=$2,
    "leaseToken"=NULL,"leaseUntil"=NULL,"availableAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id,phase]);
  let directory:string|undefined;
  try{
    if(job.upload.status==='PREPARING'){
      const object=await fenced(async(tx,u)=>{
        // A lost CREATE response is abandoned, never retried against this key.
        if((await tx.query('SELECT 1 FROM "SnipersStorageObject" WHERE "resourceId"=$1',[u.resourceId])).rowCount)
          throw new ValidationFailure('UPLOAD_INTERRUPTED');
        const id=randomUUID(),key=`snipers/final/${u.resourceId}/${job.generation}/${id}`;
        await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt")
          VALUES ($1,$2,$3,'FINAL',$4,$5,'CREATE_MULTIPART','IN_FLIGHT',clock_timestamp())`,[id,u.resourceId,key,job.id,job.generation]);
        await tx.query(`UPDATE "SnipersFileJob" SET phase='CREATE_MULTIPART' WHERE id=$1`,[job.id]);
        return {id,key,mime:u.mimeType};
      });
      const multipartId=await storage.create(object.key,object.mime,uploadId,signal);
      await fenced(async(tx,u)=>{
        signal.throwIfAborted();
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='ACKNOWLEDGED' WHERE id=$1`,[object.id]);
        await tx.query(`UPDATE "SnipersUpload" SET status='UPLOADING',"temporaryObjectId"=$2,"multipartUploadId"=$3,"updatedAt"=clock_timestamp() WHERE id=$1`,[u.id,object.id,multipartId]);
        await yieldStep(tx,'COMPLETE_MULTIPART');
      });
    }else if(job.upload.status==='COMPLETING'){
      const u=job.upload;
      if(!u.key||!u.multipartUploadId||!u.completionManifest)throw new ValidationFailure('UPLOAD_INTERRUPTED');
      const parts=await storage.listParts(u.key,u.multipartUploadId,signal);
      if(!matchingParts(parts,u.completionManifest,Number(u.sizeBytes)))throw new ValidationFailure('SIZE_MISMATCH');
      await fenced(async tx=>{await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='IN_FLIGHT' WHERE id=$1`,[u.temporaryObjectId]);});
      await storage.complete(u.key,u.multipartUploadId,u.completionManifest,signal);
      await fenced(async tx=>{
        signal.throwIfAborted();
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='ACKNOWLEDGED' WHERE id=$1`,[u.temporaryObjectId]);
        await tx.query(`UPDATE "SnipersUpload" SET status='PROCESSING',"updatedAt"=clock_timestamp() WHERE id=$1`,[u.id]);
        await yieldStep(tx,'DOWNLOAD');
      });
    }else{
      const source=await fenced(async(tx,u)=>{
        const r=(await tx.query(`SELECT r.type,u."expectedSha256" FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id WHERE u.id=$1`,[u.id])).rows[0];
        return {...u,type:r.type as PrivateFileType,sha256:r.expectedSha256 as string};
      });
      if(!source.key||!source.temporaryObjectId)throw new ValidationFailure('UPLOAD_INTERRUPTED');
      directory=await mkdtemp(path.join(os.tmpdir(),'snipers-single-'));const file=path.join(directory,'input');
      const proof=await inspectBytes(await storage.read(source.key,signal),{type:source.type,mimeType:source.mimeType,sizeBytes:Number(source.sizeBytes),sha256:source.sha256},signal,file);
      await checkBasicFormat(file,source.type,signal);
      await fenced(async(tx,u)=>{
        signal.throwIfAborted();
        if(u.classStatus==='ARCHIVED'){await terminateSingleUpload(tx,u,'CANCELLED');return;}
        const activation=(await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='BYTES_VERIFIED',"verifiedSha256"=$2,
          "verifiedSizeBytes"=$3,"bytesVerifiedAt"=statement_timestamp(),"activatedAt"=statement_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1 RETURNING "activatedAt"`,[u.temporaryObjectId,proof.sha256,proof.sizeBytes])).rows[0].activatedAt;
        await tx.query(`UPDATE "SnipersResource" SET status='VERIFIED',checksum=$2,"objectKey"=$3,"finalObjectId"=$4,
          "verifiedAt"=$5,"updatedAt"=clock_timestamp() WHERE id=$1`,[u.resourceId,proof.sha256,source.key,u.temporaryObjectId,activation]);
        await tx.query(`UPDATE "SnipersUpload" SET status='SUCCEEDED',"sourceSha256"=$2,"sourceSizeBytes"=$3,
          "formatCheckedAt"=$6,"validationPolicyVersion"=$4,"validationGeneration"=$5,"updatedAt"=clock_timestamp() WHERE id=$1`,[u.id,proof.sha256,proof.sizeBytes,BASIC_VALIDATION_POLICY,job.generation,activation]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',phase='ACTIVATE',"completedGeneration"=generation,
          "leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1`,[job.id]);
      });
    }
  }catch(error){
    if((error as {severity?:string}).severity)throw error;
    if(!(error instanceof LostLease))await fenced(async(tx,u)=>{
      await terminateSingleUpload(tx,u,'FAILED',error instanceof ValidationFailure?error.code:'UPLOAD_INTERRUPTED');
    }).catch(failure=>{if(!(failure instanceof LostLease))throw failure;});
  }finally{clearTimeout(timer);controller.abort();if(directory)await rm(directory,{recursive:true,force:true});}
}
