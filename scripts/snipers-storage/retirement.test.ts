import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv,npmBackup,profilePath} from '../phase0/local';
import {transaction} from '../../src/lib/snipers/permissions';
import {requestResourceRetirement,getResourceRetirement} from '../../src/lib/snipers/resource-retirement';
import {getStorageObjects,cleanStorageObject} from '../../src/lib/snipers/storage-management';
import {createStorageManagementGateway} from '../../src/lib/snipers/storage-management-gateway';
import {getEditorialClass,linkResource,createClass,signResource,transitionContent} from '../../src/lib/snipers/content';
import {maintainStorageOnce,claimCleanupJob} from '../../src/lib/snipers/storage-cleanup';
import {resourceRetirementAuditSchema} from '../../src/lib/snipers/resource-retirement-contracts';
import {verified,body} from '../phase3b2d/fixtures';
import {testActor,op,CleanupDouble,fresh} from './fixtures';
import {historicalRetirement} from './retirement-fixtures';

test('explicit permanent resource retirement: local PostgreSQL + simulated R2',{timeout:120000},async t=>{
  const p=localProfile();verifyDatabase(p);const backup=npmBackup(profilePath);
  const directory=path.resolve('.local/snipers/work-resource-retirement/.local/snipers/validation');fs.mkdirSync(directory,{recursive:true});
  Object.assign(process.env,isolatedEnv(p),{NEXTAUTH_SECRET:randomBytes(32).toString('hex'),SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_NETWORK_TRACE:path.join(directory,'network.jsonl')});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const pool=new Pool({connectionString:p.DATABASE_URL,max:8,connectionTimeoutMillis:5000,options:'-c statement_timeout=15000 -c lock_timeout=5000'});
  const admin=await testActor(pool,'SNIPERS_ADMIN');
  const deny=(work:Promise<unknown>,code:string)=>assert.rejects(work,(e:unknown)=>(e as {code?:string}).code===code);
  const retire=(f:{resourceId:string;storage:CleanupDouble},operationId=op())=>requestResourceRetirement(pool,admin,{operationId,resourceId:f.resourceId},()=>f.storage);
  const view=(f:{resourceId:string})=>getResourceRetirement(pool,admin,{resourceId:f.resourceId});
  const fixture=async()=>{const storage=new CleanupDouble();return {...await verified(pool,admin,'PDF',storage),storage};};
  const link=async(f:{classId:string;resourceId:string},transition:'ATTACH'|'DETACH')=>linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,transition,expectedVersion:(await getEditorialClass(pool,admin,f.classId)).version});
  try{
    await t.test('direct services and session gateway require SNIPERS_ADMIN; reject client identities',async()=>{
      const f=await fixture();let initialized=0;
      for(const permission of [undefined,'SNIPERS_CONTENT_EDITOR','SNIPERS_MEMBERSHIP_MANAGER'] as const){
        const who=await testActor(pool,permission),gateway=createStorageManagementGateway(pool,async()=>({user:{id:who.userId,activeSessionId:who.activeSessionId}}),()=>({enabled:'true',singleSession:'true',secret:process.env.NEXTAUTH_SECRET}),()=>{initialized++;return f.storage;});
        await deny(gateway.retirement({resourceId:f.resourceId}),'FORBIDDEN');await deny(gateway.retire({operationId:op(),resourceId:f.resourceId}),'FORBIDDEN');
        await deny(requestResourceRetirement(pool,who,{operationId:op(),resourceId:f.resourceId},()=>f.storage),'FORBIDDEN');
      }
      await deny(requestResourceRetirement(pool,admin,{operationId:op(),resourceId:f.resourceId,key:'forbidden'},()=>f.storage),'VALIDATION');
      assert.equal(initialized,0);assert.equal((await view(f)).state,'AVAILABLE');
    });
    await t.test('attached resources protected in draft/published/archived; cross-class references refused',async()=>{
      const f=await fixture();await link(f,'ATTACH');
      const check=async()=>{assert.equal((await view(f)).state,'PROTECTED');await deny(retire(f),'INVALID_STATE');};
      await check();let cl=await getEditorialClass(pool,admin,f.classId);
      await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'PUBLISH'});await check();
      cl=await getEditorialClass(pool,admin,f.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'ARCHIVE'});await check();
      const other=(await createClass(pool,admin,{operationId:op(),title:'Otra clase local',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
      await deny(linkResource(pool,admin,{operationId:op(),classId:other,resourceId:f.resourceId,expectedVersion:1,transition:'ATTACH'}),'NOT_FOUND');
      assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
    });
    await t.test('explicit intent is irreversible, audited and retained; unlink/retire remain separate',async()=>{
      const f=await fixture();await link(f,'ATTACH');await link(f,'DETACH');
      const operationId=op(),result=await retire(f,operationId);assert.equal(result.state,'PENDING');assert.equal(result.requested,true);assert.equal(result.canContinue,false);
      const event=(await pool.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0];
      assert.equal(event.actorUserId,admin.userId);assert.equal(resourceRetirementAuditSchema.parse(event.payload).result.resourceId,f.resourceId);
      const saved=(await pool.query(`SELECT r.status,r."finalObjectId",o."activatedAt",o."retiredAt",o."cleanupAfter",r.checksum FROM "SnipersResource" r JOIN "SnipersStorageObject" o ON o.id=r."finalObjectId" WHERE r.id=$1`,[f.resourceId])).rows[0];
      assert.equal(saved.status,'ARCHIVED');assert.ok(saved.activatedAt&&saved.checksum);assert.ok(saved.cleanupAfter.getTime()-saved.retiredAt.getTime()>=7*86400000);
      assert.deepEqual(await retire(f,operationId),result);await deny(link(f,'ATTACH'),'INVALID_STATE');
      assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);
      const g=await fixture();await deny(requestResourceRetirement(pool,admin,{operationId,resourceId:g.resourceId},()=>g.storage),'IDEMPOTENCY_CONFLICT');
      await deny(cleanStorageObject(pool,admin,{operationId:op(),objectId:saved.finalObjectId},()=>f.storage),'INVALID_STATE');
    });
    await t.test('no new deliveries after retirement; other resources remain available',async()=>{
      const f=await fixture(),g=await fixture();
      for(const item of [f,g]){await link(item,'ATTACH');const cl=await getEditorialClass(pool,admin,item.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:item.classId,expectedVersion:cl.version,transition:'PUBLISH'});}
      await signResource(pool,admin,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage);await link(f,'DETACH');await retire(f);
      const issued=f.storage.signed.length;await deny(signResource(pool,admin,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage),'INVALID_STATE');assert.equal(f.storage.signed.length,issued);
      await signResource(pool,admin,{resourceId:g.resourceId,mode:'DOWNLOAD'},()=>g.storage);assert.equal(g.storage.signed.length,1);
    });
    await t.test('archived without explicit intent stays protected; eligible intent uses exact existing protocol',async()=>{
      const legacy=await historicalRetirement(pool,admin,{intent:false});assert.equal((await view(legacy)).state,'PROTECTED');
      await pool.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[op(),admin.userId,legacy.resourceId,
        JSON.stringify({formatVersion:5,result:{kind:'RESOURCE_RETIREMENT_REQUEST',finalObjectId:legacy.finalObjectId}})]);
      assert.equal(await maintainStorageOnce(pool,legacy.uploadId,legacy.finalObjectId),false);
      await deny(cleanStorageObject(pool,admin,{operationId:op(),objectId:legacy.finalObjectId},()=>legacy.storage),'INVALID_STATE');
      const f=await historicalRetirement(pool,admin,{type:'MP3'}),g=await fixture();
      assert.equal((await view(f)).canContinue,true);
      const temporary=(await getStorageObjects(pool,admin,{resourceId:f.resourceId})).find(o=>o.kind==='TEMPORARY')!;
      assert.equal(temporary.canClean,true);
      const keys=new Set(f.storage.objects.keys()),firstOperation=op();await retire(f,firstOperation);
      assert.ok(f.storage.calls.every(c=>keys.has(c.key)));assert.equal(new Set(f.storage.calls.map(c=>c.key)).size,1);
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,1);assert.notEqual((await view(f)).state,'DELETED');
      await retire(f,firstOperation);assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,1);
      const result=await retire(f);assert.equal(result.state,'DELETED');assert.equal((await getStorageObjects(pool,admin,{resourceId:f.resourceId})).every(o=>o.state==='ABSENT'),true);
      assert.equal(f.storage.objects.size,0);assert.ok(g.storage.objects.size>0);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM "SnipersAuditEvent" WHERE "entityId"=$1 AND payload->>'formatVersion'='3' AND payload->'result'->>'kind'='CLEANUP_QUIESCENT'`,[f.resourceId])).rows[0].n,2);
    });
    await t.test('retirement vs attachment serializes, repeated/concurrent visits share the lease',async()=>{
      const f=await fixture(),results=await Promise.allSettled([retire(f),link(f,'ATTACH')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const row=(await pool.query('SELECT status,"attachedAt" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0];assert.ok(row.status==='ARCHIVED'?!row.attachedAt:!!row.attachedAt);
      const g=await historicalRetirement(pool,admin);let release!:()=>void,entered!:()=>void;
      const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{entered=r;});
      g.storage.before=async kind=>{if(kind==='head'){entered();await gate;}};
      const operationId=op(),first=retire(g,operationId);await ready;
      assert.equal((await view(g)).state,'RUNNING');await retire(g,operationId);release();await first;
      assert.equal(g.storage.calls.filter(c=>c.kind==='delete').length,1);
    });
    await t.test('pending transfer rejects retirement; exact cleanup respects live leases',async()=>{
      const active=await fresh(pool,admin);await deny(retire(active),'INVALID_STATE');assert.equal(active.storage.calls.some(c=>c.kind==='delete'),false);
      const f=await historicalRetirement(pool,admin);const objects=await getStorageObjects(pool,admin,{resourceId:f.resourceId}),id=objects.find(o=>o.kind==='FINAL')!.id;
      await maintainStorageOnce(pool,f.uploadId,id);const claim=await claimCleanupJob(pool,id);assert.ok(claim);
      assert.equal((await getStorageObjects(pool,admin,{resourceId:f.resourceId})).find(o=>o.id===id)!.canClean,false);
      // Work on one final exactly; the live lease is never stolen by admin action.
      await deny(cleanStorageObject(pool,admin,{operationId:op(),objectId:id},()=>f.storage),'INVALID_STATE');
    });
    await t.test('failed/timeout final cleanup is uncertain, then retries with absence persisted',async()=>{
      for(const timeout of [false,true]){
        const f=await historicalRetirement(pool,admin),id=f.finalObjectId;
        if(timeout)f.storage.before=async()=>new Promise<void>(()=>{});else f.storage.failDelete=true;
        const start=Date.now(),r=await cleanStorageObject(pool,admin,{operationId:op(),objectId:id},()=>f.storage);
        assert.equal(r.state,'UNCERTAIN');assert.equal(r.lastAbsentAt,null);assert.notEqual((await view(f)).state,'DELETED');assert.ok(Date.now()-start<14000);
        f.storage.before=undefined;f.storage.failDelete=false;
        await transaction(pool,async tx=>{
          await tx.query('UPDATE "SnipersStorageObject" SET "nextProbeAt"="cleanupAfter" WHERE id=$1',[id]);
          await tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "storageObjectId"=$1 AND kind='CLEAN_OBJECT'`,[id]);
        });
        assert.equal((await cleanStorageObject(pool,admin,{operationId:op(),objectId:id},()=>f.storage)).state,'ABSENT');
      }
    });
    fs.writeFileSync(path.join(directory,'tests.json'),JSON.stringify({passed:true,backup,realR2:false,productionMutated:false},null,2));
  }finally{await pool.end();}
});
