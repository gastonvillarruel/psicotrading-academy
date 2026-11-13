import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv,readProfile,pgEnv,runPg,defaultBin,npmBackup} from '../phase0/local';
import {assembleMigration} from '../snipers-launch/prepare';
import {basicFilesMigration,deletionStage1Migration,m4aMigration,singleObjectMigration} from '../snipers-launch/database';
import {testActor,op,fresh,retire,CleanupDouble} from './fixtures';
import {verified} from '../phase3b2d/fixtures';
import {transaction} from '../../src/lib/snipers/permissions';
import {discardResource} from '../../src/lib/snipers/resource-discard';
import {processPendingDeletions} from '../../src/lib/snipers/storage-deletions';
import {createDeletionCronHandler} from '../../src/lib/snipers/storage-deletion-cron';

import {maintainStorageOnce} from '../../src/lib/snipers/storage-cleanup';
import {claimUploadJob,fencedUploadJob,processUploadOnce,LostLease} from '../../src/lib/snipers/upload-processor';
import {completeUpload,startUpload} from '../../src/lib/snipers/uploads';
import {getEditorialClass,listEditorialClasses,linkResource,transitionContent,signResource} from '../../src/lib/snipers/content';
import {resourceDiscardAuditSchema,resourceDiscardAuditV6Schema} from '../../src/lib/snipers/storage-management-contracts';
import {resourceRetirementAuditSchema} from '../../src/lib/snipers/resource-retirement-contracts';
import {hasResourceRetirement} from '../../src/lib/snipers/resource-retirement-proof';
import {historicalRetirement} from './retirement-fixtures';
import {digest} from '../../src/lib/snipers/preview';

test('stage 1 deletion: isolated PostgreSQL, simulated R2, no upload redesign',{timeout:180000},async t=>{
  const local=localProfile();verifyDatabase(local);
  // Product modules are imported from this worktree. Reuse only the verified
  // local database harness; SQL/fixtures read relative to cwd must be identical.
  const sourceRoot=path.resolve(__dirname,'../..');
  for(const name of [basicFilesMigration,m4aMigration,deletionStage1Migration,singleObjectMigration]){
    const file=`prisma/migrations/${name}/migration.sql`;
    assert.equal(fs.readFileSync(path.join(sourceRoot,file),'utf8').replaceAll('\r\n','\n'),fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'));
  }
  Object.assign(process.env,isolatedEnv(local),{SNIPERS_PHASE3A_LOCAL:'1'});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const bootstrapFile=path.resolve('.local/snipers/bootstrap.env'),bootstrap=readProfile(bootstrapFile);
  const identity=JSON.parse(runPg('psql',['-X','-At','-v','ON_ERROR_STOP=1'],pgEnv(bootstrap.DATABASE_URL),defaultBin,
    `SELECT json_build_object('db',current_database(),'role',current_user,'host',inet_server_addr(),'port',inet_server_port(),'data',current_setting('data_directory'));`));
  assert.deepEqual({db:identity.db,role:identity.role,host:identity.host,port:identity.port},{db:'postgres',role:'snipers_bootstrap',host:'127.0.0.1',port:55432});
  assert.equal(path.resolve(identity.data),path.resolve('.local/snipers/postgres'));
  npmBackup(bootstrapFile);
  const directory=path.resolve('.local/snipers/integration-validation/deletion-stage1'),database=`snipers_deletion_${op().replaceAll('-','').slice(0,8)}`;
  fs.mkdirSync(directory,{recursive:true});
  runPg('psql',['-X','-v','ON_ERROR_STOP=1'],pgEnv(bootstrap.DATABASE_URL),defaultBin,`CREATE DATABASE ${database} OWNER snipers_local;`);
  const url=new URL(local.DATABASE_URL);url.pathname=`/${database}`;
  const profileFile=path.join(directory,`${database}.env`);
  fs.writeFileSync(profileFile,`SNIPERS_ENVIRONMENT=local\nDATABASE_URL="${url}"\nPG_BIN="${defaultBin}"\n`,{flag:'wx',mode:0o600});
  npmBackup(profileFile);
  const sql=(s:string)=>runPg('psql',['-X','-v','ON_ERROR_STOP=1'],pgEnv(url.toString()),defaultBin,s);
  sql(fs.readFileSync('scripts/phase1/local-artifacts/init-local.sql','utf8').replace(/DO \$local_only\$[\s\S]*?END \$local_only\$;/,''));
  sql(assembleMigration());
  const pool=new Pool({connectionString:url.toString(),max:8,connectionTimeoutMillis:5000,options:'-c statement_timeout=15000 -c lock_timeout=5000'});
  const admin=await testActor(pool,'SNIPERS_ADMIN'),editor=await testActor(pool,'SNIPERS_CONTENT_EDITOR');
  const legacyStorage=new CleanupDouble(),legacy={...await verified(pool,admin,'PDF',legacyStorage),storage:legacyStorage};
  const proof=async(resourceId:string)=>(await pool.query('SELECT "objectKey","finalObjectId",checksum,"verifiedAt" FROM "SnipersResource" WHERE id=$1',[resourceId])).rows[0];
  const legacyProof=await proof(legacy.resourceId);
  npmBackup(profileFile);
  for(const name of [basicFilesMigration,m4aMigration,deletionStage1Migration,singleObjectMigration])sql(fs.readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
  const prepare=async(classId?:string,storage=new CleanupDouble())=>{
    const f=await verified(pool,admin,'PDF',storage,classId);
    for(const o of (await pool.query('SELECT key FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows)storage.uploadIds.set(o.key,f.uploadId);
    return {...f,storage};
  };
  const attach=async(f:{classId:string;resourceId:string})=>linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,
    expectedVersion:(await getEditorialClass(pool,admin,f.classId)).version,transition:'ATTACH'});
  const transition=async(classId:string,value:string,storage?:CleanupDouble,operationId=op())=>transitionContent(pool,admin,{operationId,entity:'CLASS',id:classId,
    expectedVersion:(await getEditorialClass(pool,admin,classId)).version,transition:value},storage?()=>storage:undefined);
  const jobs=async(resourceId:string)=>(await pool.query(`SELECT j.*,o."lastAbsentAt" FROM "SnipersFileJob" j LEFT JOIN "SnipersStorageObject" o ON o.id=j."storageObjectId" WHERE j."resourceId"=$1 AND j.kind='CLEAN_OBJECT'`,[resourceId])).rows;
  const due=async(resourceId:string)=>transaction(pool,async tx=>{
    await tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()) WHERE "resourceId"=$1`,[resourceId]);
    await tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "resourceId"=$1 AND kind='CLEAN_OBJECT' AND status='WAIT_RETRY'`,[resourceId]);
  });
  try{
    await t.test('migration preserves historical proof; publishing and hiding keep private objects',async()=>{
      assert.deepEqual(await proof(legacy.resourceId),legacyProof);
      await attach(legacy);await transition(legacy.classId,'PUBLISH');
      assert.ok((await signResource(pool,admin,{resourceId:legacy.resourceId,mode:'DOWNLOAD'},()=>legacy.storage)).url);
      const count=legacy.storage.objects.size;
      await transition(legacy.classId,'WITHDRAW');assert.equal(legacy.storage.objects.size,count);
      await assert.rejects(signResource(pool,admin,{resourceId:legacy.resourceId,mode:'DOWNLOAD'},()=>legacy.storage),{code:'NOT_FOUND'});
      await transition(legacy.classId,'PUBLISH');
      await processPendingDeletions(pool,()=>legacy.storage,{resourceIds:[legacy.resourceId]});
      assert.ok(legacy.storage.objects.has(legacyProof.objectKey));
    });
    await t.test('linked file: one operation unlinks, stops delivery, persists and executes deletion',async()=>{
      const f=await prepare();await attach(f);await transition(f.classId,'PUBLISH');
      const before=await proof(f.resourceId),operationId=op();
      await assert.rejects(discardResource(pool,editor,{resourceId:f.resourceId,operationId}),{code:'FORBIDDEN'});
      await assert.rejects(discardResource(pool,admin,{resourceId:f.resourceId,operationId,key:'injected'}),{code:'VALIDATION'});
      assert.equal((await discardResource(pool,admin,{resourceId:f.resourceId,operationId},()=>f.storage)).state,'DISCARDED');
      assert.deepEqual(await proof(f.resourceId),before);
      const row=(await pool.query('SELECT * FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0];
      assert.equal(row.attachedAt,null);assert.equal(row.status,'ARCHIVED');assert.ok(row.deletionRequestedAt);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.lastAbsentAt));
      assert.equal(f.storage.objects.size,0);
      await assert.rejects(signResource(pool,admin,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage));
      assert.equal((await discardResource(pool,admin,{resourceId:f.resourceId,operationId})).replayed,true);
    });
    await t.test('R2 failure and permission errors remain retries, never absence; next execution completes',async()=>{
      const f=await prepare();f.storage.failHead=true;
      await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()},()=>f.storage);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='WAIT_RETRY'&&!j.lastAbsentAt));
      f.storage.failHead=false;await due(f.resourceId);
      const head=f.storage.head.bind(f.storage);f.storage.head=async()=>{throw Object.assign(Error('denied'),{name:'AccessDenied'});};
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='WAIT_RETRY'&&j.errorCode==='STORAGE_CONFIGURATION'&&!j.lastAbsentAt));
      f.storage.head=head;await due(f.resourceId);
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.lastAbsentAt));
      const lost=await prepare();lost.storage.failDelete=true;
      await discardResource(pool,admin,{resourceId:lost.resourceId,operationId:op()},()=>lost.storage);
      assert.ok((await jobs(lost.resourceId)).every(j=>j.status==='WAIT_RETRY'&&!j.lastAbsentAt));
      lost.storage.failDelete=false;await due(lost.resourceId);await processPendingDeletions(pool,()=>lost.storage,{resourceIds:[lost.resourceId]});
      assert.ok((await jobs(lost.resourceId)).every(j=>j.status==='SUCCEEDED'));
    });
    await t.test('delete class atomically withdraws, unlinks and queues its files; no restore or new upload',async()=>{
      const f=await prepare(),other=await prepare(f.classId,f.storage);await attach(f);await attach(other);await transition(f.classId,'PUBLISH');
      const pending=await startUpload(pool,admin,{operationId:op(),classId:f.classId,name:'Unfinished',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:f.storage.payload.length},expectedSha256:'a'.repeat(64)});
      await processUploadOnce(pool,f.storage,undefined,pending.uploadId);
      const cl=await getEditorialClass(pool,admin,f.classId),command={operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'DELETE'};
      await assert.rejects(transitionContent(pool,editor,command),{code:'FORBIDDEN'});
      const result=await transitionContent(pool,admin,command,()=>f.storage);assert.equal(result.replayed,false);
      assert.equal((await transitionContent(pool,admin,command)).replayed,true);
      await assert.rejects(getEditorialClass(pool,admin,f.classId),{code:'NOT_FOUND'});
      assert.ok(!(await listEditorialClasses(pool,admin,{limit:100})).items.some(c=>c.id===f.classId));
      for(const value of ['RESTORE','PUBLISH'])await assert.rejects(transitionContent(pool,admin,{...command,operationId:op(),expectedVersion:result.result.version,transition:value}),{code:'NOT_FOUND'});
      await assert.rejects(startUpload(pool,admin,{operationId:op(),classId:f.classId,name:'late',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:40},expectedSha256:'a'.repeat(64)}));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersResource" WHERE "classId"=$1 AND "attachedAt" IS NOT NULL',[f.classId])).rows[0].n,0);
      assert.equal((await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1',[pending.uploadId])).rows[0].status,'CANCELLED');
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId,other.resourceId,pending.resourceId]});assert.equal(f.storage.objects.size,0);assert.equal(f.storage.multipart.size,0);
      assert.ok(legacy.storage.objects.has(legacyProof.objectKey));
    });
    await t.test('live producer is invalidated immediately; signed and remote write windows remain protected',async()=>{
      const f=await fresh(pool,admin);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersUpload" SET "lastPartUrlExpiresAt"=clock_timestamp()+interval '10 minutes' WHERE id=$1`,[f.uploadId]));
      await completeUpload(pool,admin,{operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'fixture'}]});
      const claim=await claimUploadJob(pool,false,f.uploadId);assert.ok(claim);
      const before=(await pool.query('SELECT "lastPartUrlExpiresAt" FROM "SnipersUpload" WHERE id=$1',[f.uploadId])).rows[0];
      await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()},()=>f.storage);
      assert.equal((await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1',[f.uploadId])).rows[0].status,'CANCELLED');
      await assert.rejects(fencedUploadJob(pool,claim,async()=>{}),LostLease);
      assert.ok((await jobs(f.resourceId)).every(j=>j.availableAt>before.lastPartUrlExpiresAt));
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,0);
      await transaction(pool,async tx=>{await assert.rejects(tx.query('UPDATE "SnipersStorageObject" SET "cleanupAfter"="retiredAt" WHERE "resourceId"=$1',[f.resourceId]),{code:'23514'});});
    });
    await t.test('parallel processors serialize; blocked identity/provenance and other references stay protected',async()=>{
      const f=await prepare();await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()});
      let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let paused=false;
      f.storage.before=async()=>{if(!paused){paused=true;enter();await gate;}};
      const first=processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});await entered;
      try{assert.equal((await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]})).busy,true);}finally{release();}
      await first;assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,2);
      const foreign=await fresh(pool,admin,{provenance:false});await discardResource(pool,admin,{resourceId:foreign.resourceId,operationId:op()},()=>foreign.storage);
      assert.equal(foreign.storage.calls.length,0);assert.ok((await jobs(foreign.resourceId)).every(j=>j.status==='BLOCKED'));
      const reference=await prepare(),other=await prepare();
      await assert.rejects(linkResource(pool,admin,{operationId:op(),classId:other.classId,resourceId:reference.resourceId,expectedVersion:1,transition:'ATTACH'}),{code:'NOT_FOUND'});
      assert.equal(reference.storage.calls.some(c=>c.kind==='delete'),false);
    });
    await t.test('uncertain old write is revisited if bytes arrive after a confirmed absence',async()=>{
      const f=await fresh(pool,admin,{final:true}),final=f.objects.find(o=>o.kind==='FINAL')!;
      await transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersStorageObject" SET "writeState"='IN_FLIGHT' WHERE id=$1`,[final.id]);
        await tx.query(`UPDATE "SnipersResource" SET status='REJECTED' WHERE id=$1`,[f.resourceId]);
        await tx.query(`UPDATE "SnipersUpload" SET status='FAILED' WHERE id=$1`,[f.uploadId]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='FAILED',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]);
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp(),"cleanupAfter"=statement_timestamp()+interval '7 days',"nextProbeAt"=statement_timestamp()+interval '7 days' WHERE "resourceId"=$1`,[f.resourceId]);
      });
      await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()},()=>f.storage);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.lastAbsentAt));
      f.storage.objects.set(final.key,f.storage.payload);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()) WHERE id=$1`,[final.id]));
      assert.equal(await maintainStorageOnce(pool,f.uploadId,final.id),true);
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
      assert.equal(f.storage.objects.has(final.key),false);
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete'&&c.key===final.key).length,2);
    });
    await t.test('cron authenticates, gates activation, rejects HEAD and processes a bounded real queue',async()=>{
      const secret=randomBytes(32).toString('hex');let enabled='false',initialized=0;
      const f=await prepare();await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()});
      assert.equal((await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId],limit:1})).processed,1);
      assert.equal((await jobs(f.resourceId)).filter(j=>j.status==='READY').length,1);
      const handler=createDeletionCronHandler(pool,()=>{initialized++;return f.storage;},()=>({secret,enabled,snipers:'true'}));
      const request=(auth='',method='GET')=>new Request('http://localhost/api/snipers/storage-cleanup',{method,headers:{authorization:auth}});
      assert.equal((await handler(request())).status,401);assert.equal((await handler(request(`Bearer ${secret}`,'HEAD'))).status,405);
      assert.equal((await handler(request(`Bearer ${secret}`))).status,200);assert.equal(initialized,0);
      enabled='true';assert.equal((await handler(request(`Bearer ${secret}`))).status,200);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'));
      assert.ok((await jobs(f.resourceId)).length<=20);
      assert.ok(legacy.storage.objects.has(legacyProof.objectKey));
    });
    await t.test('automatic cleanup excludes historical queued and unqueued objects; explicit deletions still run',async()=>{
      const queued=await fresh(pool,admin),unqueued=await fresh(pool,admin),current=await prepare();
      await retire(pool,queued);await retire(pool,unqueued);
      await maintainStorageOnce(pool,queued.uploadId);
      await discardResource(pool,admin,{resourceId:current.resourceId,operationId:op()});
      const storage=new CleanupDouble();
      for(const f of [queued,unqueued,current]){
        for(const [key,value]of f.storage.objects)storage.objects.set(key,value);
        for(const [key,value]of f.storage.uploadIds)storage.uploadIds.set(key,value);
        for(const [key,value]of f.storage.multipart)storage.multipart.set(key,value);
      }
      const historicalKeys=[...queued.storage.objects.keys(),...unqueued.storage.objects.keys()];
      await processPendingDeletions(pool,()=>storage);
      assert.ok(historicalKeys.every(key=>storage.objects.has(key)));
      assert.ok(storage.calls.every(call=>!historicalKeys.includes(call.key)));
      assert.ok((await jobs(queued.resourceId)).every(j=>j.status==='READY'));
      assert.equal((await jobs(unqueued.resourceId)).length,0);
      assert.ok((await jobs(current.resourceId)).every(j=>j.status==='SUCCEEDED'));
    });
    await t.test('strict v5/v6 readers distinguish retirement from discard; new writes bind final and date',async()=>{
      const f=await prepare(),operationId=op();
      await discardResource(pool,admin,{resourceId:f.resourceId,operationId});
      const receipt=(await pool.query('SELECT payload FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0].payload;
      const v6=resourceDiscardAuditV6Schema.parse(receipt);
      const final=(await pool.query('SELECT id,"retiredAt" FROM "SnipersStorageObject" WHERE id=$1',[v6.result.finalObjectId])).rows[0];
      assert.equal(v6.result.requestedAt,final.retiredAt.toISOString());
      const oldId=op(),oldResult={kind:'ADMIN_RESOURCE_DISCARD',operationId:oldId,resourceId:f.resourceId,classId:f.classId,changed:true};
      const v5={formatVersion:5,commandHash:digest({kind:oldResult.kind,operationId:oldId,resourceId:f.resourceId}),result:oldResult};
      assert.equal(resourceDiscardAuditSchema.safeParse(v5).success,true);
      assert.equal(resourceRetirementAuditSchema.safeParse(v5).success,false);
      const retirement={formatVersion:5,commandHash:v5.commandHash,result:{kind:'RESOURCE_RETIREMENT_REQUEST',operationId:op(),resourceId:f.resourceId,
        finalObjectId:final.id,requestedAt:final.retiredAt.toISOString(),cleanupObjectId:null,cleanupOperationId:null}};
      assert.equal(resourceRetirementAuditSchema.safeParse(retirement).success,true);
      assert.equal(resourceDiscardAuditSchema.safeParse(retirement).success,false);
      assert.equal(resourceDiscardAuditSchema.safeParse({...receipt,formatVersion:7}).success,false);
      assert.equal(resourceDiscardAuditV6Schema.safeParse({...receipt,result:{...receipt.result,requestedAt:null}}).success,false);
      await pool.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[oldId,admin.userId,f.resourceId,JSON.stringify(v5)]);
      assert.equal((await discardResource(pool,admin,{resourceId:f.resourceId,operationId:oldId})).replayed,true);
      assert.equal((await discardResource(pool,admin,{resourceId:f.resourceId,operationId})).replayed,true);
      const other=await testActor(pool,'SNIPERS_ADMIN');
      await assert.rejects(discardResource(pool,other,{resourceId:f.resourceId,operationId:oldId}),{code:'IDEMPOTENCY_CONFLICT'});
    });
    for(const version of [5,6])await t.test(`production v${version} historical intent stays outside Cron until a new explicit deletion`,async()=>{
      const f=await historicalRetirement(pool,admin,{intent:version===5});
      if(version===6){
        const o=(await pool.query('SELECT "retiredAt" FROM "SnipersStorageObject" WHERE id=$1',[f.finalObjectId])).rows[0],operationId=op();
        const result={kind:'ADMIN_RESOURCE_DISCARD',operationId,resourceId:f.resourceId,classId:f.classId,changed:true,finalObjectId:f.finalObjectId,requestedAt:o.retiredAt.toISOString()};
        const payload=resourceDiscardAuditV6Schema.parse({formatVersion:6,commandHash:digest({kind:result.kind,operationId,resourceId:f.resourceId}),result});
        await pool.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[operationId,admin.userId,f.resourceId,JSON.stringify(payload)]);
        assert.equal((await discardResource(pool,admin,{resourceId:f.resourceId,operationId})).replayed,true);
      }
      assert.equal(await transaction(pool,tx=>hasResourceRetirement(tx,f.resourceId,f.finalObjectId)),true);
      await maintainStorageOnce(pool,f.uploadId,f.finalObjectId);
      await processPendingDeletions(pool,()=>f.storage);
      assert.ok(f.storage.objects.has(f.finalKey));assert.equal(f.storage.calls.some(c=>c.kind==='delete'&&c.key===f.finalKey),false);
      assert.equal((await pool.query('SELECT "deletionRequestedAt" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0].deletionRequestedAt,null);
      await discardResource(pool,admin,{resourceId:f.resourceId,operationId:op()},()=>f.storage);
      assert.equal(f.storage.objects.has(f.finalKey),false);
    });
    await t.test('a v6 receipt for another final/date or without actor never releases protection',async()=>{
      const f=await historicalRetirement(pool,admin,{intent:false});
      const retired=(await pool.query('SELECT "retiredAt" FROM "SnipersStorageObject" WHERE id=$1',[f.finalObjectId])).rows[0].retiredAt.toISOString();
      for(const variant of ['object','date','hash','actor']){
        const operationId=op(),result={kind:'ADMIN_RESOURCE_DISCARD',operationId,resourceId:f.resourceId,classId:f.classId,changed:true,
          finalObjectId:variant==='object'?op():f.finalObjectId,requestedAt:variant==='date'?new Date().toISOString():retired};
        const payload={formatVersion:6,commandHash:variant==='hash'?'0'.repeat(64):digest({kind:result.kind,operationId,resourceId:f.resourceId}),result};
        await pool.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[operationId,variant==='actor'?null:admin.userId,f.resourceId,JSON.stringify(payload)]);
        assert.equal(await transaction(pool,tx=>hasResourceRetirement(tx,f.resourceId,f.finalObjectId)),false);
      }
      await processPendingDeletions(pool,()=>f.storage);
      assert.ok(f.storage.objects.has(f.finalKey));assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
    });
    fs.writeFileSync(path.join(directory,'test-evidence.json'),JSON.stringify({passed:true,database,profileFile,sourceRoot,productionMutated:false,simulatedR2:true,legacyClassId:legacy.classId,admin},null,2));
  }finally{await pool.end();}
});
