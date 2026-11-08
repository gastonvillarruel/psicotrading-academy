import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv,npmBackup,profilePath} from '../phase0/local';
import {transaction} from '../../src/lib/snipers/permissions';
import {discardResource} from '../../src/lib/snipers/resource-discard';
import {createStorageManagementGateway} from '../../src/lib/snipers/storage-management-gateway';
import {listStorageResources,getStorageObjects} from '../../src/lib/snipers/storage-management';
import {maintainStorageOnce,processCleanupOnce} from '../../src/lib/snipers/storage-cleanup';
import {linkResource,getEditorialClass,signResource,transitionContent} from '../../src/lib/snipers/content';
import {claimUploadJob,fencedUploadJob,LostLease} from '../../src/lib/snipers/upload-processor';
import {completeUpload} from '../../src/lib/snipers/uploads';
import {verified} from '../phase3b2d/fixtures';
import {fresh,testActor,op,CleanupDouble} from './fixtures';
import {workerMode,runWorkerCycle} from '../phase3b2b/worker-cycle';
import {historicalRetirement} from './retirement-fixtures';

test('discard: local PostgreSQL and simulated R2',{timeout:120000},async t=>{
  const profile=localProfile();verifyDatabase(profile);const backup=npmBackup(profilePath);
  Object.assign(process.env,isolatedEnv(profile),{SNIPERS_PHASE3A_LOCAL:'1'});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const pool=new Pool({connectionString:profile.DATABASE_URL,max:8,connectionTimeoutMillis:5000,
    options:'-c statement_timeout=15000 -c lock_timeout=5000'});
  const admin=await testActor(pool,'SNIPERS_ADMIN'),editor=await testActor(pool,'SNIPERS_CONTENT_EDITOR');
  const discard=(resourceId:string,operationId=op())=>discardResource(pool,admin,{resourceId,operationId});
  const objects=(resourceId:string)=>getStorageObjects(pool,admin,{resourceId});
  const snapshots=async(resourceId:string)=>({
    upload:(await pool.query('SELECT * FROM "SnipersUpload" WHERE "resourceId"=$1',[resourceId])).rows,
    jobs:(await pool.query(`SELECT * FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind<>'CLEAN_OBJECT' ORDER BY id`,[resourceId])).rows,
    retention:(await pool.query('SELECT id,"retiredAt","cleanupAfter","nextProbeAt","writeState" FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY id',[resourceId])).rows,
  });
  const rejected=async()=>{
    const f=await fresh(pool,admin,{final:true});
    await transaction(pool,async tx=>{
      await tx.query(`UPDATE "SnipersResource" SET status='REJECTED' WHERE id=$1`,[f.resourceId]);
      await tx.query(`UPDATE "SnipersUpload" SET status='FAILED' WHERE id=$1`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersFileJob" SET status='FAILED',"errorCode"='INVALID_PDF',"leaseToken"=NULL,"leaseUntil"=NULL
        WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',
        "cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE "resourceId"=$1`,[f.resourceId]);
    });return f;
  };
  try{
    await t.test('server authorization, strict input, session and disabled gateway',async()=>{
      const f=await fresh(pool,admin);
      await assert.rejects(discardResource(pool,editor,{resourceId:f.resourceId,operationId:op()}),{code:'FORBIDDEN'});
      await assert.rejects(discardResource(pool,{...admin,activeSessionId:op()},{resourceId:f.resourceId,operationId:op()}),{code:'SESSION'});
      await assert.rejects(discardResource(pool,admin,{resourceId:f.resourceId,operationId:op(),key:'forbidden'}),{code:'VALIDATION'});
      const api=createStorageManagementGateway(pool,async()=>({user:{id:admin.userId,activeSessionId:admin.activeSessionId}}),
        ()=>({enabled:'false'}),()=>{throw Error('Must not initialize R2');});
      await assert.rejects(api.discard({resourceId:f.resourceId,operationId:op()}),{code:'DISABLED'});
    });
    await t.test('rejected discard preserves FAILED, error, retired dates and producer history; concurrent replay',async()=>{
      const f=await rejected(),before=await snapshots(f.resourceId),operationId=op();
      const results=await Promise.all([discard(f.resourceId,operationId),discard(f.resourceId,operationId)]);
      assert.ok(results.every(r=>r.state==='DISCARDED'));assert.equal(results.filter(r=>r.replayed).length,1);
      assert.deepEqual(await snapshots(f.resourceId),before);
      assert.equal((await pool.query('SELECT status FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0].status,'ARCHIVED');
      const receipt=(await pool.query('SELECT "actorUserId",payload FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0];
      assert.equal(receipt.actorUserId,admin.userId);assert.equal(receipt.payload.result.kind,'ADMIN_RESOURCE_DISCARD');
      assert.equal((await getEditorialClass(pool,admin,f.classId)).resources.length,0);
      assert.ok(!(await listStorageResources(pool,admin,{})).items.some(r=>r.id===f.resourceId));
      assert.ok((await listStorageResources(pool,admin,{archived:true})).items.some(r=>r.id===f.resourceId));
      await assert.rejects(discard(op(),operationId),{code:'IDEMPOTENCY_CONFLICT'});
      await assert.rejects(discardResource(pool,editor,{resourceId:f.resourceId,operationId}),{code:'FORBIDDEN'});
      assert.equal(f.storage.calls.length,0);
      // Cleanup of every retired copy works without a browser call.
      for(const o of f.objects){await maintainStorageOnce(pool,f.uploadId,o.id);await processCleanupOnce(pool,f.storage,undefined,o.id);}
      assert.ok((await objects(f.resourceId)).every(o=>o.state==='ABSENT'));
    });
    await t.test('verified detached discard keeps proof and existing temporary retention; delivery stops',async()=>{
      const storage=new CleanupDouble(),f=await verified(pool,admin,'PDF',storage);
      const before=await snapshots(f.resourceId),proof=(await pool.query('SELECT "finalObjectId","objectKey",checksum,"verifiedAt" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0];
      assert.equal((await discard(f.resourceId)).state,'DISCARDED');
      const after=await snapshots(f.resourceId);assert.deepEqual(after.upload,before.upload);assert.deepEqual(after.jobs,before.jobs);
      assert.deepEqual(after.retention.find(o=>o.retiredAt&&o.id!==proof.finalObjectId),before.retention.find(o=>o.retiredAt));
      assert.deepEqual((await pool.query('SELECT "finalObjectId","objectKey",checksum,"verifiedAt" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0],proof);
      assert.ok((await objects(f.resourceId)).every(o=>o.state==='RETAINED'));
      const cl=await getEditorialClass(pool,admin,f.classId);
      await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'PUBLISH'});
      await assert.rejects(signResource(pool,admin,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>storage),{code:'INVALID_STATE'});
      for(const o of await objects(f.resourceId)){
        await maintainStorageOnce(pool,f.uploadId,o.id);await processCleanupOnce(pool,storage,undefined,o.id);
      }
      assert.equal(storage.calls.filter(c=>c.kind==='delete').length,0);
    });
    await t.test('linked file remains usable; linking and discard serialize safely',async()=>{
      const f=await verified(pool,admin),cl=await getEditorialClass(pool,admin,f.classId);
      await linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:cl.version,transition:'ATTACH'});
      assert.equal((await discard(f.resourceId)).state,'LINKED');
      assert.equal((await getEditorialClass(pool,admin,f.classId)).resources[0].status,'VERIFIED');
      const other=await verified(pool,admin),current=await getEditorialClass(pool,admin,other.classId);
      const race=await Promise.allSettled([discard(other.resourceId),linkResource(pool,admin,{operationId:op(),classId:other.classId,
        resourceId:other.resourceId,expectedVersion:current.version,transition:'ATTACH'})]);
      assert.ok(race.some(r=>r.status==='fulfilled'));
      const row=(await pool.query('SELECT status,"attachedAt" FROM "SnipersResource" WHERE id=$1',[other.resourceId])).rows[0];
      assert.ok((row.status==='ARCHIVED'&&!row.attachedAt)||(row.status==='VERIFIED'&&row.attachedAt));
    });
    await t.test('pending: live lease blocks discard; expired writer is fenced and uncertainty retained',async()=>{
      const f=await fresh(pool,admin),operationId=op();
      await completeUpload(pool,admin,{operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'fixture'}]});
      const job=await claimUploadJob(pool,false,f.uploadId);assert.ok(job);
      await fencedUploadJob(pool,job,async tx=>{
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='IN_FLIGHT' WHERE id=$1`,[f.objects[0].id]);
        await tx.query(`UPDATE "SnipersFileJob" SET "executionId"=$2,"executionDeadlineAt"=clock_timestamp()+interval '45 seconds' WHERE id=$1`,[job.id,op()]);
      });
      assert.equal((await discard(f.resourceId,operationId)).state,'BUSY');
      assert.equal((await pool.query('SELECT status FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0].status,'PENDING');
      // Simulate elapsed time under the existing lease rules, never shorten object retention.
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '0.1 seconds',
        "executionDeadlineAt"=clock_timestamp()+interval '0.05 seconds' WHERE id=$1`,[job.id]));
      await new Promise(resolve=>setTimeout(resolve,150));
      assert.equal((await discard(f.resourceId,operationId)).state,'DISCARDED');
      await assert.rejects(fencedUploadJob(pool,job,async()=>{}),LostLease);
      const o=(await objects(f.resourceId))[0];assert.equal(o.state,'RETAINED');assert.equal(o.lastAbsentAt,null);
      assert.equal((await snapshots(f.resourceId)).retention[0].writeState,'IN_FLIGHT');
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,0);
    });
    await t.test('admin can cancel another editor\'s quiescent transfer without resetting old retired candidates',async()=>{
      const f=await fresh(pool,editor),operationId=op();
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersUpload" SET "lastPartUrlExpiresAt"=clock_timestamp()+interval '10 minutes' WHERE id=$1`,[f.uploadId]));
      const r=await discard(f.resourceId,operationId);assert.equal(r.state,'DISCARDED');
      const row=(await pool.query('SELECT status,"lastPartUrlExpiresAt" FROM "SnipersUpload" WHERE id=$1',[f.uploadId])).rows[0];
      assert.equal(row.status,'CANCELLED');
      const o=(await objects(f.resourceId))[0];assert.equal(o.state,'RETAINED');
      assert.ok(Date.parse(o.availableAt!)>row.lastPartUrlExpiresAt.getTime());
      assert.equal((await discard(f.resourceId,operationId)).replayed,true);
      assert.equal(f.storage.calls.length,0);
    });
    await t.test('archived activated final requires explicit discard; deferred cleanup retries preserve immutable proof',async()=>{
      const f=await historicalRetirement(pool,admin,{intent:false}),storage=f.storage;
      const final=(await pool.query(`SELECT id,key,"activatedAt" FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind='FINAL'`,[f.resourceId])).rows[0];
      storage.uploadIds.set(final.key,f.uploadId);
      assert.equal((await objects(f.resourceId)).find(o=>o.id===final.id)!.state,'PROTECTED');
      await discard(f.resourceId);assert.equal((await objects(f.resourceId)).find(o=>o.id===final.id)!.state,'ELIGIBLE');
      await maintainStorageOnce(pool,f.uploadId,final.id);storage.failDelete=true;
      await processCleanupOnce(pool,storage,undefined,final.id);
      let state=(await objects(f.resourceId)).find(o=>o.id===final.id)!;assert.equal(state.state,'UNCERTAIN');assert.equal(state.lastAbsentAt,null);
      await transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()) WHERE id=$1`,[final.id]);
        await tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "storageObjectId"=$1`,[final.id]);
      });
      storage.failDelete=false;await processCleanupOnce(pool,storage,undefined,final.id);
      state=(await objects(f.resourceId)).find(o=>o.id===final.id)!;assert.equal(state.state,'ABSENT');
      assert.equal(storage.objects.has(final.key),false);
      const proof=(await pool.query('SELECT "finalObjectId" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0];assert.equal(proof.finalObjectId,final.id);
      assert.deepEqual((await pool.query('SELECT "activatedAt" FROM "SnipersStorageObject" WHERE id=$1',[final.id])).rows[0].activatedAt,final.activatedAt);
    });
    await t.test('uncertain retired writes are revisited after an observed absence and a late object',async()=>{
      const f=await fresh(pool,admin,{final:true}),final=f.objects.find(o=>o.kind==='FINAL')!;
      await transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='IN_FLIGHT' WHERE id=$1`,[final.id]);
        await tx.query(`UPDATE "SnipersResource" SET status='REJECTED' WHERE id=$1`,[f.resourceId]);
        await tx.query(`UPDATE "SnipersUpload" SET status='FAILED' WHERE id=$1`,[f.uploadId]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='FAILED',"errorCode"='SIZE_MISMATCH',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]);
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',
          "cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE "resourceId"=$1`,[f.resourceId]);
      });
      await discard(f.resourceId);await maintainStorageOnce(pool,f.uploadId,final.id);await processCleanupOnce(pool,f.storage,undefined,final.id);
      assert.equal((await objects(f.resourceId)).find(o=>o.id===final.id)!.state,'ABSENT');
      // Provider completes a previously issued write after the absence observation.
      f.storage.objects.set(final.key,f.storage.payload);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()) WHERE id=$1`,[final.id]));
      assert.equal(await maintainStorageOnce(pool,f.uploadId,final.id),true);
      await processCleanupOnce(pool,f.storage,undefined,final.id);assert.equal(f.storage.objects.has(final.key),false);
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete'&&c.key===final.key).length,2);
    });
    await t.test('cleanup-only cycle handles real queued work without transfer or validation, even with legacy flags on',async()=>{
      const f=await rejected(),mode=workerMode({SNIPERS_PROCESSOR_MODE:'cleanup',SNIPERS_STORAGE_CLEANUP_ENABLED:'true',
        SNIPERS_UPLOAD_PROCESSOR_ENABLED:'true',SNIPERS_FILE_VALIDATION_ENABLED:'true'});
      const objectId=f.objects[0].id;
      const cycle=await runWorkerCycle(mode,{transfer:async()=>{throw Error('Unexpected transfer');},validate:async()=>{throw Error('Unexpected validation');},
        maintain:()=>maintainStorageOnce(pool,f.uploadId,objectId),clean:()=>processCleanupOnce(pool,f.storage,undefined,objectId),stopped:()=>false},true);
      assert.equal(cycle.transferred,false);assert.equal(cycle.validated,false);assert.equal(cycle.maintained,true);
      assert.equal((await objects(f.resourceId)).find(o=>o.id===objectId)!.state,'ABSENT');
      assert.throws(()=>workerMode({SNIPERS_PROCESSOR_MODE:'cleanup'}));assert.throws(()=>workerMode({SNIPERS_PROCESSOR_MODE:'typo'}));
      assert.deepEqual(workerMode({SNIPERS_UPLOAD_PROCESSOR_ENABLED:'true'}),{uploads:true,validation:false,cleanup:false});
      let calls=0;await runWorkerCycle(mode,{transfer:async()=>false,validate:async()=>false,maintain:async()=>{calls++;return true;},clean:async()=>{calls++;return true;},stopped:()=>true},true);assert.equal(calls,0);
    });
    const directory=path.resolve('.local/snipers/storage-management');fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'discard-test-evidence.json'),JSON.stringify({passed:true,backup,simulatedR2:true,productionMutated:false},null,2));
  }finally{await pool.end();}
});
