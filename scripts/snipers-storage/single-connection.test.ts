import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {readProfile,isolatedEnv} from '../phase0/local';
import {verified} from '../phase3b2d/fixtures';
import {CleanupDouble,testActor,op} from './fixtures';
import {historicalRetirement} from './retirement-fixtures';
import {discardResource} from '../../src/lib/snipers/resource-discard';
import {processPendingDeletions} from '../../src/lib/snipers/storage-deletions';
import {inspectCleanupEligibility} from '../../src/lib/snipers/storage-cleanup';
import {transaction} from '../../src/lib/snipers/permissions';
import {getEditorialClass,linkResource,transitionContent} from '../../src/lib/snipers/content';

// Run from the repository root after restoring its existing local schema into a
// dedicated empty snipers_cleanup_* database. No migrations or remote services.
test('cleanup reuses one PostgreSQL connection',{timeout:120000},async t=>{
  const local=localProfile();verifyDatabase(local);
  const profile=readProfile(path.resolve('.local/snipers/single-pool-validation/profile.env'));
  const url=new URL(profile.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');
  assert.equal(url.username,'snipers_local');assert.match(url.pathname,/^\/snipers_cleanup_[a-f0-9]{8}$/);
  Object.assign(process.env,isolatedEnv({...local,...profile}),{SNIPERS_PHASE3A_LOCAL:'1'});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const options={connectionString:profile.DATABASE_URL,max:1,connectionTimeoutMillis:500,
    options:'-c statement_timeout=5000 -c lock_timeout=1000'};
  const pool=new Pool(options),contender=new Pool(options);
  const admin=await testActor(pool,'SNIPERS_ADMIN');
  const jobs=async(id:string)=>(await pool.query(`SELECT j.status,j.attempts,j."errorCode",j."leaseUntil",o."lastAbsentAt"
    FROM "SnipersFileJob" j JOIN "SnipersStorageObject" o ON o.id=j."storageObjectId"
    WHERE j.kind='CLEAN_OBJECT' AND j."resourceId"=$1 ORDER BY j.id`,[id])).rows;
  const prepare=async()=>{
    const storage=new CleanupDouble(),f=await verified(pool,admin,'PDF',storage);
    for(const o of (await pool.query('SELECT key FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows)
      storage.uploadIds.set(o.key,f.uploadId);
    storage.calls=[];return {...f,storage};
  };
  const discard=async(f:{resourceId:string})=>discardResource(pool,admin,{operationId:op(),resourceId:f.resourceId});
  const released=async(p=pool)=>{
    assert.equal(p.options.max,1);assert.equal(p.totalCount,1);
    assert.equal(p.idleCount,1);assert.equal(p.waitingCount,0);
    assert.equal((await p.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory'
      AND classid=0 AND objid=1397639505 AND objsubid=1`)).rows[0].n,0);
  };
  try{
    await t.test('automatic maintenance and READY jobs finish with max=1',async()=>{
      const f=await prepare();await discard(f);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='READY'));
      const result=await processPendingDeletions(pool,()=>f.storage);
      assert.equal(result.busy,false);assert.equal(result.processed,2);
      assert.equal(f.storage.objects.size,0);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.lastAbsentAt));
      await released();
    });
    await t.test('R2 failure persists WAIT_RETRY and a later visit completes it',async()=>{
      const f=await prepare();await discard(f);f.storage.failHead=true;
      await processPendingDeletions(pool,()=>f.storage);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='WAIT_RETRY'&&j.attempts===1&&j.errorCode==='STORAGE_UNAVAILABLE'&&!j.lastAbsentAt&&!j.leaseUntil));
      assert.equal(f.storage.calls.some(c=>c.kind==='delete'),false);await released();
      f.storage.failHead=false;
      await transaction(pool,async tx=>{
        await tx.query('UPDATE "SnipersStorageObject" SET "nextProbeAt"=greatest("cleanupAfter",clock_timestamp()) WHERE "resourceId"=$1',[f.resourceId]);
        await tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "resourceId"=$1 AND kind='CLEAN_OBJECT'`,[f.resourceId]);
      });
      await processPendingDeletions(pool,()=>f.storage);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.attempts===2&&j.lastAbsentAt));
      await released();
    });
    await t.test('scoped visits release the session when the adapter throws or the queue is empty',async()=>{
      const f=await prepare();await discard(f);
      await assert.rejects(processPendingDeletions(pool,()=>{throw Error('adapter unavailable');},{resourceIds:[f.resourceId]}),/adapter unavailable/);
      await released();assert.ok((await jobs(f.resourceId)).every(j=>j.status==='READY'&&j.attempts===0));
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
      assert.deepEqual(await processPendingDeletions(pool,()=>{throw Error('must not initialize');},{resourceIds:[f.resourceId]}),{busy:false,processed:0});
      await released();
    });
    await t.test('a failed SQL transaction rolls back and releases the reserved session',async()=>{
      const f=await prepare();await discard(f);
      const client=await pool.connect(),query=client.query.bind(client);let fail=true;
      client.query=(async(sql:string,values?:unknown[])=>{
        if(fail&&sql.startsWith('SELECT u.id FROM "SnipersUpload"')){
          fail=false;throw Object.assign(Error('controlled SQL failure'),{code:'XX000'});
        }
        return query(sql,values);
      }) as typeof client.query;
      client.release();
      try{await assert.rejects(processPendingDeletions(pool,()=>f.storage),/controlled SQL failure/);}
      finally{client.query=query;}
      await released();assert.ok((await jobs(f.resourceId)).every(j=>j.status==='READY'&&j.attempts===0));
      await processPendingDeletions(pool,()=>f.storage);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'));await released();
    });
    await t.test('a concurrent independent pool returns busy without touching storage',async()=>{
      const f=await prepare();await discard(f);
      let enter!:()=>void,release!:()=>void,paused=false;
      const entered=new Promise<void>(r=>{enter=r;}),gate=new Promise<void>(r=>{release=r;});
      f.storage.before=async()=>{if(!paused){paused=true;enter();await gate;}};
      const first=processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId],limit:1});await entered;
      try{
        assert.deepEqual(await processPendingDeletions(contender,()=>{throw Error('busy adapter must not initialize');}),{busy:true,processed:0});
        assert.equal(contender.idleCount,1);assert.equal(contender.waitingCount,0);
      }finally{release();await first;}
      await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
      assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,2);
      await released();await released(contender);
    });
    await t.test('concurrent visits through the same single-connection pool serialize',async()=>{
      const f=await prepare();await discard(f);let active=0,maximum=0;
      f.storage.before=async()=>{active++;maximum=Math.max(maximum,active);await delay(5);active--;};
      await Promise.all([
        processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId],limit:1}),
        processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId],limit:1}),
      ]);
      assert.equal(maximum,1);assert.equal(f.storage.calls.filter(c=>c.kind==='delete').length,2);
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'&&j.attempts===1));
      await released();
    });
    await t.test('heartbeat transactions cannot interleave with cleanup transactions',async()=>{
      const f=await prepare();await discard(f);
      f.storage.before=async kind=>{if(kind==='head')await delay(35);};
      const client=await pool.connect(),query=client.query.bind(client);
      let inTransaction=false,overlap=false,heartbeats=0;
      client.query=(async(sql:string,values?:unknown[])=>{
        if(sql.startsWith('BEGIN')){if(inTransaction)overlap=true;inTransaction=true;}
        try{
          if(sql.startsWith('UPDATE "SnipersFileJob" SET "leaseUntil"=')){heartbeats++;await query('SELECT pg_sleep(0.04)');}
          return await query(sql,values);
        }finally{if(sql==='COMMIT'||sql==='ROLLBACK')inTransaction=false;}
      }) as typeof client.query;
      client.release();
      const originalTimeout=globalThis.setTimeout;
      const timer=t.mock.method(globalThis,'setTimeout',((callback:(...args:any[])=>void,ms?:number,...args:any[])=>
        originalTimeout(callback,ms===20000?10:ms,...args)) as typeof setTimeout);
      try{
        await processPendingDeletions(pool,()=>f.storage,{resourceIds:[f.resourceId]});
        assert.ok(heartbeats>0);assert.equal(overlap,false);assert.equal(inTransaction,false);
      }finally{timer.mock.restore();client.query=query;}
      assert.ok((await jobs(f.resourceId)).every(j=>j.status==='SUCCEEDED'));await released();
    });
    await t.test('published finals and a retired final without authorized intent remain protected',async()=>{
      const live=await prepare();
      await linkResource(pool,admin,{operationId:op(),classId:live.classId,resourceId:live.resourceId,expectedVersion:(await getEditorialClass(pool,admin,live.classId)).version,transition:'ATTACH'});
      await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:live.classId,expectedVersion:(await getEditorialClass(pool,admin,live.classId)).version,transition:'PUBLISH'});
      await transaction(pool,async tx=>{
        const u=(await tx.query('SELECT * FROM "SnipersUpload" WHERE id=$1',[live.uploadId])).rows[0];
        const r=(await tx.query('SELECT "finalObjectId" FROM "SnipersResource" WHERE id=$1',[live.resourceId])).rows[0];
        assert.equal(await inspectCleanupEligibility(tx,u,r.finalObjectId),'PROTECTED_FINAL');
      });
      const existing=live.storage.objects.size;await processPendingDeletions(pool,()=>live.storage);
      assert.equal(live.storage.objects.size,existing);assert.equal(live.storage.calls.some(c=>c.kind==='delete'),false);
      const retired=await historicalRetirement(pool,admin,{intent:false});
      await transaction(pool,tx=>tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"availableAt","updatedAt")
        VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp(),clock_timestamp())`,[op(),retired.resourceId,retired.finalObjectId]));
      await processPendingDeletions(pool,()=>retired.storage,{resourceIds:[retired.resourceId]});
      assert.ok((await jobs(retired.resourceId)).some(j=>j.status==='BLOCKED'&&j.errorCode==='PROTECTED_FINAL'));
      assert.equal(retired.storage.calls.length,0);assert.ok(retired.storage.objects.has(retired.finalKey));
      await released();
    });
    fs.writeFileSync(path.resolve('.local/snipers/single-pool-validation/test-evidence.json'),JSON.stringify({passed:true,maxConnectionsPerPool:1,postgresqlLocal:true,simulatedR2:true,productionMutated:false},null,2));
  }finally{await pool.end();await contender.end();}
  assert.equal(pool.totalCount,0);assert.equal(contender.totalCount,0);
});
