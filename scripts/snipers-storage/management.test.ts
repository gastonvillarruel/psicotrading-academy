import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv,npmBackup,profilePath} from '../phase0/local';
import {transaction} from '../../src/lib/snipers/permissions';
import {listStorageResources,getStorageObjects,cleanStorageObject} from '../../src/lib/snipers/storage-management';
import {createStorageManagementGateway} from '../../src/lib/snipers/storage-management-gateway';
import {storageRequestAuditSchema} from '../../src/lib/snipers/storage-management-contracts';
import {claimCleanupJob,maintainStorageOnce} from '../../src/lib/snipers/storage-cleanup';
import {linkResource,getEditorialClass,transitionContent} from '../../src/lib/snipers/content';
import {verified} from '../phase3b2d/fixtures';
import {fresh,retire,testActor,op,CleanupDouble} from './fixtures';

test('Snipers storage: targeted PostgreSQL + simulated R2 acceptance',{timeout:180000},async t=>{
  const p=localProfile();verifyDatabase(p);assert.equal(p.SNIPERS_ENABLED,'false');
  const directory=path.resolve('.local/snipers/storage-management');fs.mkdirSync(directory,{recursive:true});
  const backup=npmBackup(profilePath);
  Object.assign(process.env,isolatedEnv(p),{NEXTAUTH_SECRET:randomBytes(32).toString('hex'),SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_NETWORK_TRACE:path.join(directory,'test-network.jsonl')});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const pool=new Pool({connectionString:p.DATABASE_URL,max:8,connectionTimeoutMillis:5000,options:'-c statement_timeout=15000 -c lock_timeout=5000'}),admin=await testActor(pool,'SNIPERS_ADMIN');
  const object=async(f:{resourceId:string},id?:string)=>(await getStorageObjects(pool,admin,{resourceId:f.resourceId})).find(o=>!id||o.id===id)!;
  const clean=(f:{storage:CleanupDouble},objectId:string,operationId=op())=>cleanStorageObject(pool,admin,{operationId,objectId},()=>f.storage);
  const denied=(work:Promise<unknown>,code:string)=>assert.rejects(work,(e:unknown)=>(e as {code?:string}).code===code);
  try{
    await t.test('admin-only gateway, flag, session and direct service calls; no storage initialization',async()=>{
      let initialized=0;
      const gateway=(who:typeof admin|null,enabled='true')=>createStorageManagementGateway(pool,async()=>who?{user:{id:who.userId,activeSessionId:who.activeSessionId}}:null,
        ()=>({enabled,singleSession:'true',secret:process.env.NEXTAUTH_SECRET}),()=>{initialized++;return new CleanupDouble();});
      for(const permission of [undefined,'SNIPERS_CONTENT_EDITOR','SNIPERS_MEMBERSHIP_MANAGER'] as const){
        const who=await testActor(pool,permission),api=gateway(who);
        await denied(api.list({}),'FORBIDDEN');await denied(api.objects({resourceId:op()}),'FORBIDDEN');
        await denied(api.clean({operationId:op(),objectId:op()}),'FORBIDDEN');
        await denied(listStorageResources(pool,who,{}),'FORBIDDEN');
      }
      await denied(gateway(null).list({}),'SESSION');await denied(gateway(admin,'false').list({}),'DISABLED');
      await denied(gateway({...admin,activeSessionId:op()}).list({}),'SESSION');
      await denied(gateway(admin).clean({operationId:op(),objectId:op(),key:'forbidden'}),'VALIDATION');assert.equal(initialized,0);
    });
    await t.test('activated final protected when detached, attached, class archived and resource archived',async()=>{
      const storage=new CleanupDouble(),f={...await verified(pool,admin,'PDF',storage),storage};
      const final=(await pool.query(`SELECT id FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind='FINAL'`,[f.resourceId])).rows[0].id;
      const protect=async()=>{assert.equal((await object(f,final)).state,'PROTECTED');await denied(clean(f,final),'INVALID_STATE');assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,0);};
      await protect();let cl=await getEditorialClass(pool,admin,f.classId);
      await linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:cl.version,transition:'ATTACH'});await protect();
      cl=await getEditorialClass(pool,admin,f.classId);await linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:cl.version,transition:'DETACH'});await protect();
      cl=await getEditorialClass(pool,admin,f.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'ARCHIVE'});await protect();
      await transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp() WHERE id=$1`,[f.resourceId]);
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',"cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE id=$1`,[final]);
      });await protect();
    });
    await t.test('retention, pending producers and missing provenance reject before destructive I/O',async()=>{
      const active=await fresh(pool,admin);assert.equal((await object(active)).state,'IN_USE');await denied(clean(active,active.objects[0].id),'INVALID_STATE');
      const retained=await fresh(pool,admin);await retire(pool,retained,false);
      assert.equal((await object(retained)).state,'RETAINED');assert.ok((await object(retained)).availableAt);await denied(clean(retained,retained.objects[0].id),'INVALID_STATE');
      const legacy=await fresh(pool,admin,{provenance:false});await retire(pool,legacy);
      assert.match((await object(legacy)).reason,/origen/);await denied(clean(legacy,legacy.objects[0].id),'INVALID_STATE');
      for(const f of [active,retained,legacy])assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,0);
    });
    await t.test('exact object only, absence persisted, replay and strict actor audit',async()=>{
      const f=await fresh(pool,admin,{final:true});await retire(pool,f);
      const target=f.objects.find(o=>o.kind==='FINAL')!,other=f.objects.find(o=>o.kind==='TEMPORARY')!;
      const operationId=op();assert.equal((await object(f,target.id)).canClean,true);
      assert.equal((await clean(f,target.id,operationId)).state,'ABSENT');
      assert.equal(f.storage.objects.has(target.key),false);assert.equal(f.storage.objects.has(other.key),true);
      assert.ok(f.storage.calls.every(c=>c.key===target.key));
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "SnipersFileJob" WHERE kind='CLEAN_OBJECT' AND "resourceId"=$1`,[f.resourceId])).rows[0].n,1);
      const before=f.storage.calls.length;assert.equal((await clean(f,target.id,operationId)).state,'ABSENT');assert.equal(f.storage.calls.length,before);
      await denied(clean(f,other.id,operationId),'IDEMPOTENCY_CONFLICT');
      const event=(await pool.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0];
      assert.equal(event.actorUserId,admin.userId);assert.equal(storageRequestAuditSchema.parse(event.payload).result.objectId,target.id);
      assert.doesNotMatch(JSON.stringify(event.payload),/https?:|snipers\/|leaseToken|multipartUploadId/);
      const technical=(await pool.query(`SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE "entityId"=$1 AND payload->>'formatVersion'='3'`,[f.resourceId])).rows[0];assert.ok(technical.n>=2);
    });
    await t.test('concurrent replay shares one claim; another command cannot bypass live lease',async()=>{
      const f=await fresh(pool,admin);await retire(pool,f);const id=f.objects[0].id,operationId=op();
      let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{entered=r;});
      f.storage.before=async kind=>{if(kind==='head'){entered();await gate;}};
      const first=clean(f,id,operationId);await ready;
      assert.equal((await object(f)).state,'RUNNING');assert.equal((await clean(f,id,operationId)).state,'RUNNING');
      await denied(clean(f,id),'INVALID_STATE');release();assert.equal((await first).state,'ABSENT');
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,1);
    });
    await t.test('lost DELETE response and failed HEAD never report success or immediately repeat',async()=>{
      for(const mode of ['delete','head']){
        const f=await fresh(pool,admin);await retire(pool,f);if(mode==='delete')f.storage.failDelete=true;else f.storage.failHead=true;
        const id=f.objects[0].id,operationId=op(),result=await clean(f,id,operationId);
        assert.equal(result.state,'UNCERTAIN');assert.equal(result.lastAbsentAt,null);assert.equal(result.canClean,false);
        const before=f.storage.calls.length;await clean(f,id,operationId);assert.equal(f.storage.calls.length,before);
        await denied(clean(f,id),'INVALID_STATE');
      }
    });
    await t.test('interrupted request resumes from its receipt; transient failures retry only when due',async()=>{
      const f=await fresh(pool,admin);await retire(pool,f);const id=f.objects[0].id,operationId=op();
      await assert.rejects(cleanStorageObject(pool,admin,{operationId,objectId:id},()=>{throw Error('Interrupted before scheduling');}));
      assert.equal((await clean(f,id,operationId)).state,'ABSENT');
      const g=await fresh(pool,admin);await retire(pool,g);const target=g.objects[0].id,old=op();g.storage.failDelete=true;
      assert.equal((await clean(g,target,old)).state,'UNCERTAIN');g.storage.failDelete=false;
      await transaction(pool,async tx=>{
        await tx.query('UPDATE "SnipersStorageObject" SET "nextProbeAt"="cleanupAfter" WHERE id=$1',[target]);
        await tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "storageObjectId"=$1 AND kind='CLEAN_OBJECT'`,[target]);
      });
      const before=g.storage.calls.length;assert.equal((await clean(g,target,old)).state,'ELIGIBLE');assert.equal(g.storage.calls.length,before);
      assert.equal((await clean(g,target)).state,'ABSENT');
    });
    await t.test('remote timeout is bounded and leaves a persisted uncertain result',async()=>{
      const f=await fresh(pool,admin);await retire(pool,f);
      f.storage.before=async()=>new Promise<void>(()=>{});
      const start=Date.now(),result=await clean(f,f.objects[0].id);
      assert.equal(result.state,'UNCERTAIN');assert.equal(result.lastAbsentAt,null);assert.ok(Date.now()-start<14000);
      assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
    });
    await t.test('the 30-second visit budget stops a sequence of individually valid requests',async()=>{
      const f=await fresh(pool,admin);await retire(pool,f);f.storage.before=async()=>{await delay(9000);};
      const start=Date.now(),result=await clean(f,f.objects[0].id),elapsed=Date.now()-start;
      assert.ok(elapsed>=29000&&elapsed<34000);assert.equal(result.state,'UNCERTAIN');assert.equal(result.lastAbsentAt,null);
      assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
    });
    await t.test('identity mismatch blocks and expired lease is recovered with a new generation',async()=>{
      const f=await fresh(pool,admin);await retire(pool,f);f.storage.identityMismatch=true;
      assert.equal((await clean(f,f.objects[0].id)).state,'BLOCKED');assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
      const g=await fresh(pool,admin);await retire(pool,g);const id=g.objects[0].id;
      await maintainStorageOnce(pool,g.uploadId,id);const claimed=await claimCleanupJob(pool,id);assert.ok(claimed);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE id=$1`,[claimed.id]));await delay(200);
      assert.equal((await clean(g,id)).state,'ABSENT');
      assert.equal((await pool.query('SELECT generation FROM "SnipersFileJob" WHERE id=$1',[claimed.id])).rows[0].generation,claimed.generation+1);
    });
    await t.test('statistics match independent SQL, pagination is stable and DTOs omit remote identities',async()=>{
      for(let i=0;i<26;i++)await fresh(pool,admin,{name:`Paginación local ${i}`});
      const first=await listStorageResources(pool,admin,{}),second=await listStorageResources(pool,admin,{offset:25});
      assert.equal(first.items.length,25);assert.equal(first.hasMore,true);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,first.items.length+second.items.length);
      const expected=(await pool.query(`SELECT count(*)::text AS count,coalesce(sum("sizeBytes"),0)::text AS bytes FROM "SnipersResource"`)).rows[0];
      assert.equal(first.summary.resources,expected.count);assert.equal(first.summary.logicalBytes,expected.bytes);assert.deepEqual(first.summary,second.summary);
      const objects=(await pool.query(`SELECT count(*)::text AS count,count(*) FILTER(WHERE "verifiedSizeBytes" IS NULL)::text AS unknown,coalesce(sum("verifiedSizeBytes"),0)::text AS bytes FROM "SnipersStorageObject"`)).rows[0];
      assert.equal(first.summary.objects,objects.count);assert.equal(first.summary.unknownSizeObjects,objects.unknown);assert.equal(first.summary.verifiedBytes,objects.bytes);
      const empty=await fresh(pool,admin); // A new upload can legitimately have no objects yet.
      const resource=await pool.query(`SELECT "classId" FROM "SnipersResource" WHERE id=$1`,[empty.resourceId]);
      const {startUpload}=await import('../../src/lib/snipers/uploads');
      const pending=await startUpload(pool,admin,{operationId:op(),classId:resource.rows[0].classId,name:'Sin objeto todavía',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:400},expectedSha256:'a'.repeat(64)});
      assert.deepEqual(await getStorageObjects(pool,admin,{resourceId:pending.resourceId}),[]);
      const page=await listStorageResources(pool,admin,{});assert.ok(BigInt(page.summary.withoutObjects)>BigInt(0));
      assert.doesNotMatch(JSON.stringify(page),/snipers\/temporary|snipers\/final|objectKey|leaseToken|checksum|https?:/);
      await denied(listStorageResources(pool,admin,{offset:-1}),'VALIDATION');
    });
    fs.writeFileSync(path.join(directory,'test-evidence.json'),JSON.stringify({passed:true,backup,localDatabase:'snipers_dev',simulatedR2:true,productionMutated:false},null,2));
  }finally{await pool.end();}
});
