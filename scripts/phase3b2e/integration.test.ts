import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {requireRunner,verifyDatabase,localPool} from '../phase1/guard';
import {transaction,type Actor} from '../../src/lib/snipers/permissions';
import {startUpload,completeUpload,cancelUpload} from '../../src/lib/snipers/uploads';
import {processUploadOnce} from '../../src/lib/snipers/upload-processor';
import {processValidationOnce} from '../../src/lib/snipers/file-processor';
import {maintainStorageOnce,processCleanupOnce,claimCleanupJob,heartbeatCleanupJob} from '../../src/lib/snipers/storage-cleanup';
import {cleanupAuditSchema} from '../../src/lib/snipers/file-contracts';
import {StorageDouble,body,op} from '../phase3b2d/fixtures';
import {createClass,linkResource,transitionContent,getEditorialClass} from '../../src/lib/snipers/content';
import type {CleanupStorage,MultipartCursor} from '../../src/lib/snipers/upload-storage';
import {digest} from '../../src/lib/snipers/preview';

class Storage extends StorageDouble implements CleanupStorage {
  calls:{kind:string;key:string;id?:string}[]=[];
  createUncertain=false;failHead=false;failDelete=false;pageSize=1;repeatedCursor=false;
  before?: (kind:string,key:string,signal:AbortSignal)=>Promise<void>;
  async create(key:string,mime:string,uploadId:string){const id=await super.create(key,mime,uploadId);if(this.createUncertain)throw Error('response lost');return id;}
  async abort(key='',id='',signal:AbortSignal=new AbortController().signal){
    this.calls.push({kind:'abort',key,id});await this.before?.('abort',key,signal);signal.throwIfAborted();
    if(this.multipart.get(id)===key)this.multipart.delete(id);
  }
  async listMultipart(key:string,cursor:MultipartCursor|null,signal:AbortSignal){
    this.calls.push({kind:'list',key});await this.before?.('list',key,signal);signal.throwIfAborted();
    const all=[...this.multipart].filter(([,k])=>k.startsWith(key)).map(([multipartId,key])=>({key,multipartId})).sort((a,b)=>a.multipartId.localeCompare(b.multipartId));
    const remaining=cursor?all.filter(u=>u.multipartId.localeCompare(cursor.uploadIdMarker)>0):all;
    const uploads=remaining.slice(0,this.pageSize),last=uploads.at(-1);
    return {uploads,next:this.repeatedCursor?{keyMarker:key,uploadIdMarker:'repeated'}:uploads.length<remaining.length&&last?{keyMarker:last.key,uploadIdMarker:last.multipartId}:null};
  }
  async deleteObject(key:string,signal:AbortSignal){
    this.calls.push({kind:'delete',key});await this.before?.('delete',key,signal);signal.throwIfAborted();this.objects.delete(key);
    if(this.failDelete)throw Error('response lost');
  }
  async head(key:string,signal?:AbortSignal){
    this.calls.push({kind:'head',key});if(signal){await this.before?.('head',key,signal);signal.throwIfAborted();}
    if(this.failHead)throw Error('HEAD unavailable');return super.head(key);
  }
}

test('3B-2E: integridad, carreras y recuperación PostgreSQL real / R2 controlado',{timeout:240000},async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B2E_LOCAL,'1');verifyDatabase(requireRunner());const pool=localPool();
  const actor:Actor={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  const classId=(await createClass(pool,actor,{operationId:op(),title:`3B-2E ${op()}`,body,classDate:new Date().toISOString(),categoryId:null})).result.id;
  const input=(s:Storage)=>({operationId:op(),classId,name:'Private cleanup fixture',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:s.payload.length},expectedSha256:createHash('sha256').update(s.payload).digest('hex')});
  async function fresh(uncertain=false){const storage=new Storage();storage.createUncertain=uncertain;
    const r=await startUpload(pool,actor,input(storage));await processUploadOnce(pool,storage,undefined,r.uploadId);return {...r,storage};}
  type Fixture={resourceId:string;uploadId:string;storage:Storage};
  const objects=async(f:Fixture)=>(await pool.query('SELECT * FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY id',[f.resourceId])).rows;
  const job=async(id:string)=>(await pool.query('SELECT * FROM "SnipersFileJob" WHERE kind=\'CLEAN_OBJECT\' AND "storageObjectId"=$1',[id])).rows[0];
  const state=async(f:Fixture)=>(await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1',[f.uploadId])).rows[0].status;
  async function seal(f:Fixture){await completeUpload(pool,actor,{operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'fixture'}]});}
  async function processing(f:Fixture){await seal(f);await processUploadOnce(pool,f.storage,undefined,f.uploadId);assert.equal(await state(f),'PROCESSING');}
  async function agedTerminal(f:Fixture){
    await transaction(pool,async tx=>{
      await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=clock_timestamp() WHERE id=$1`,[f.resourceId]);
      await tx.query(`UPDATE "SnipersUpload" SET status='CANCELLED' WHERE id=$1`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "uploadId"=$1 AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED')`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',"cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE "resourceId"=$1 AND "retiredAt" IS NULL`,[f.resourceId]);
    });
    await maintainStorageOnce(pool,f.uploadId);f.storage.calls=[];return (await objects(f))[0];
  }
  async function expired(sealed:boolean|'uploading'=false,future=false){
    const storage=new Storage(),v=input(storage),resourceId=op(),uploadId=op(),prepare=op(),objectId=op();
    const key=`snipers/temporary/${resourceId}/1/${objectId}`,multipartId=op();
    await transaction(pool,async tx=>{
      await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,$3,'PDF','application/pdf',$4,clock_timestamp())`,[resourceId,classId,v.name,storage.payload.length]);
      await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","createdAt","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp()-interval '2 days',CASE WHEN $5 THEN clock_timestamp()+interval '750 milliseconds' ELSE clock_timestamp()-interval '1 day' END,clock_timestamp())`,[uploadId,resourceId,actor.userId,v.expectedSha256,future]);
      await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PREPARE_UPLOAD',clock_timestamp())`,[prepare,resourceId,uploadId]);
      const payload={formatVersion:2,commandHash:digest({kind:'UPLOAD_START',input:v}),result:{operationId:v.operationId,kind:'UPLOAD_START',resourceId,uploadId}};
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[v.operationId,actor.userId,resourceId,JSON.stringify(payload)]);
      if(sealed){
        await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=1,attempts=1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '60 seconds' WHERE id=$1`,[prepare,op()]);
        await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt") VALUES ($1,$2,$3,'TEMPORARY',$4,1,'CREATE_MULTIPART','ACKNOWLEDGED',clock_timestamp())`,[objectId,resourceId,key,prepare]);
        await tx.query(`UPDATE "SnipersUpload" SET status='UPLOADING',"temporaryObjectId"=$2,"multipartUploadId"=$3 WHERE id=$1`,[uploadId,objectId,multipartId]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='SUCCEEDED',"completedGeneration"=1,"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`,[prepare]);
        if(sealed===true){
          await tx.query(`UPDATE "SnipersUpload" SET status='COMPLETING',"completionManifest"='[{"partNumber":1,"etag":"fixture"}]',"manifestHash"=$2 WHERE id=$1`,[uploadId,digest([{partNumber:1,etag:'fixture'}])]);
          await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PROCESS_UPLOAD',clock_timestamp())`,[op(),resourceId,uploadId]);
        }
      }
    });
    if(sealed){storage.multipart.set(multipartId,key);storage.uploadIds.set(key,uploadId);}
    return {resourceId,uploadId,storage};
  }
  async function readyRetry(id:string){await transaction(pool,async tx=>{
    await tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"="cleanupAfter" WHERE id=$1`,[id]);
    await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"completedGeneration"=NULL,"availableAt"=clock_timestamp() WHERE "storageObjectId"=$1`,[id]);
  });}
  try{
    await t.test('v3 estricto rechaza secretos, campos extra y errores arbitrarios',()=>{
      const result={operationId:op(),resourceId:op(),uploadId:op(),objectId:null,jobId:null,generation:0,phase:'RESERVED',kind:'UPLOAD_EXPIRED',errorCode:null};
      const payload={formatVersion:3,commandHash:'a'.repeat(64),result};assert.ok(cleanupAuditSchema.safeParse(payload).success);
      for(const key of ['url','leaseToken','multipartUploadId','secret'])assert.equal(cleanupAuditSchema.safeParse({...payload,[key]:'forbidden'}).success,false);
      assert.equal(cleanupAuditSchema.safeParse({...payload,result:{...result,errorCode:'ARBITRARY'}}).success,false);
    });
    await t.test('expiración concurrente PREPARING: una transición y un evento, sin crear objetos',async()=>{
      const f=await expired();await Promise.all([maintainStorageOnce(pool,f.uploadId),maintainStorageOnce(pool,f.uploadId)]);
      assert.equal(await state(f),'EXPIRED');assert.equal((await objects(f)).length,0);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM "SnipersAuditEvent" WHERE "entityId"=$1 AND payload->>'formatVersion'='3'`,[f.resourceId])).rows[0].n,1);
    });
    await t.test('carga sellada vencida completa desde multipart y conserva PROCESSING sin limpieza',async()=>{
      const f=await expired(true);assert.equal(await maintainStorageOnce(pool,f.uploadId),false);
      await processUploadOnce(pool,f.storage,undefined,f.uploadId);assert.equal(await state(f),'PROCESSING');
      assert.equal(await maintainStorageOnce(pool,f.uploadId),false);assert.equal((await objects(f))[0].retiredAt,null);
    });
    await t.test('UPLOADING vencida se cierra con siete días y sin I/O destructivo anticipado',async()=>{
      const f=await expired('uploading');assert.equal(await maintainStorageOnce(pool,f.uploadId),true);assert.equal(await state(f),'EXPIRED');
      const o=(await objects(f))[0];assert.ok(o.cleanupAfter-o.retiredAt>=7*86400000);
      assert.equal(await processCleanupOnce(pool,f.storage,undefined,o.id),false);assert.equal(f.storage.calls.length,0);
    });
    await t.test('sellado frente a expiración: espera de bloqueo PostgreSQL y revalidación conservan COMPLETING',async()=>{
      const f=await expired('uploading',true);let entered!:()=>void,release!:()=>void;
      const ready=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});const tag=`cleanup-race-${op()}`;
      const sealing={connect:async()=>{const tx=await pool.connect();return {query:async(sql:string,args?:unknown[])=>{const r=await tx.query(sql,args);if(sql.includes("SET status='COMPLETING'")){entered();await gate;}return r;},release:()=>tx.release()};}} as unknown as Pool;
      const cleaning={connect:async()=>{const tx=await pool.connect();await tx.query("SELECT set_config('application_name',$1,false)",[tag]);return tx;}} as unknown as Pool;
      const complete=completeUpload(sealing,actor,{operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'fixture'}]});
      await ready;await delay(800);const expire=maintainStorageOnce(cleaning,f.uploadId);
      try{
        let waiting=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[tag])).rowCount){waiting=true;break;}await delay(10);}
        assert.equal(waiting,true,'Dos conexiones reales compiten por el agregado');
      }finally{release();await complete;await expire;}
      assert.equal(await state(f),'COMPLETING');assert.equal((await objects(f))[0].retiredAt,null);
    });
    await t.test('COMPLETING incierto y PROCESSING bloqueado no se cancelan por mantenimiento',async()=>{
      const f=await fresh();await seal(f);
      await transaction(pool,async tx=>{await tx.query(`UPDATE "SnipersFileJob" SET status='BLOCKED',"errorCode"='COMPLETE_UNCERTAIN' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]);});
      assert.equal(await maintainStorageOnce(pool,f.uploadId),false);assert.equal(await state(f),'COMPLETING');
      const g=await fresh();await processing(g);assert.equal(await maintainStorageOnce(pool,g.uploadId),false);assert.equal(await state(g),'PROCESSING');
    });
    await t.test('retención vigente y fuente activa: cero llamadas destructivas',async()=>{
      const f=await fresh();await cancelUpload(pool,actor,{operationId:op(),uploadId:f.uploadId},()=>f.storage);f.storage.calls=[];
      await maintainStorageOnce(pool,f.uploadId);const o=(await objects(f))[0];assert.equal(await processCleanupOnce(pool,f.storage,undefined,o.id),false);assert.equal(f.storage.calls.length,0);
      const active=await fresh();assert.equal(await maintainStorageOnce(pool,active.uploadId),false);assert.equal((await objects(active))[0].retiredAt,null);
    });
    await t.test('Create sin identidad persistida: aborto exacto, paginación y prefijos vecinos intactos',async()=>{
      const f=await fresh(true),o=await agedTerminal(f);
      f.storage.multipart.set('a-neighbor',`${o.key}-neighbor`);f.storage.multipart.set('b-extra',o.key);f.storage.multipart.set('z-neighbor',`${o.key}/child`);
      await Promise.all([maintainStorageOnce(pool,f.uploadId),maintainStorageOnce(pool,f.uploadId)]);
      assert.equal((await pool.query('SELECT count(*)::int n FROM "SnipersFileJob" WHERE "storageObjectId"=$1',[o.id])).rows[0].n,1);
      assert.equal(await processCleanupOnce(pool,f.storage,undefined,o.id),true);
      assert.equal((await job(o.id)).status,'SUCCEEDED');assert.equal((await objects(f))[0].cleanupState,'QUIESCENT');
      assert.ok(f.storage.multipart.has('a-neighbor'));assert.ok(f.storage.multipart.has('z-neighbor'));
      assert.ok(f.storage.calls.filter(c=>c.kind==='list').length>=3);
      assert.ok(f.storage.calls.filter(c=>['abort','delete'].includes(c.kind)).every(c=>c.key===o.key));
    });
    await t.test('identidad remota contradictoria bloquea antes de aborto o DELETE',async()=>{
      const f=await fresh(),o=await agedTerminal(f);f.storage.objects.set(o.key,f.storage.payload);f.storage.uploadIds.set(o.key,op());
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal((await job(o.id)).status,'BLOCKED');
      assert.equal((await job(o.id)).errorCode,'INVALID_OBJECT_IDENTITY');assert.equal(f.storage.calls.some(c=>['abort','delete'].includes(c.kind)),false);
      assert.equal(f.storage.objects.has(o.key),true);
    });
    await t.test('dos claims reales y reinicio con lease vencido: sólo generación nueva confirma',async()=>{
      const f=await fresh(),o=await agedTerminal(f),claims=await Promise.all([claimCleanupJob(pool,o.id),claimCleanupJob(pool,o.id)]);
      assert.equal(claims.filter(Boolean).length,1);const old=claims.find(Boolean)!;
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE id=$1`,[old.id]));
      await delay(150);assert.equal(await heartbeatCleanupJob(pool,old),false);
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal((await job(o.id)).generation,old.generation+1);assert.equal((await job(o.id)).status,'SUCCEEDED');
    });
    for(const error of ['delete','head','pagination'] as const)await t.test(`resultado ambiguo ${error}: no acredita ausencia y reinicio concilia`,async()=>{
      const f=await fresh(),o=await agedTerminal(f);f.storage.failDelete=error==='delete';f.storage.failHead=error==='head';f.storage.repeatedCursor=error==='pagination';
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.notEqual((await job(o.id)).status,'SUCCEEDED');assert.equal((await objects(f))[0].lastAbsentAt,null);
      f.storage.failDelete=false;f.storage.failHead=false;f.storage.repeatedCursor=false;await readyRetry(o.id);
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal((await job(o.id)).status,'SUCCEEDED');
    });
    await t.test('pérdida de lease entre listado y aborto: no emite llamadas destructivas nuevas',async()=>{
      const f=await fresh(true),o=await agedTerminal(f);let once=false;
      f.storage.before=async kind=>{if(kind==='list'&&!once){once=true;await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "storageObjectId"=$1`,[o.id]));}};
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal(f.storage.calls.some(c=>['abort','delete'].includes(c.kind)),false);assert.equal((await objects(f))[0].lastAbsentAt,null);
    });
    await t.test('retención terminal no admite extensión fuera de política y un token cancelado no renueva',async()=>{
      const f=await fresh(),o=await agedTerminal(f);
      // Terminal cancellation permits no extension beyond policy: the cleaner cannot revive it.
      await assert.rejects(transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "cleanupAfter"="retiredAt"+interval '8 days' WHERE id=$1`,[o.id])),e=>(e as {code:string}).code==='23514');
      const claim=await claimCleanupJob(pool,o.id);assert.ok(claim);assert.equal(await heartbeatCleanupJob(pool,claim),true);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`,[claim.id]));
      assert.equal(await heartbeatCleanupJob(pool,claim),false);assert.equal(f.storage.calls.length,0);
    });
    for(const late of ['create','complete'] as const)await t.test(`escritura ${late} tardía: sondeo semanal sólo IN_FLIGHT`,async()=>{
      const f=await fresh(true),o=await agedTerminal(f);await processCleanupOnce(pool,f.storage,undefined,o.id);
      assert.equal((await job(o.id)).status,'SUCCEEDED');
      if(late==='create')f.storage.multipart.set(op(),o.key);else f.storage.objects.set(o.key,f.storage.payload);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=clock_timestamp() WHERE id=$1`,[o.id]));
      await maintainStorageOnce(pool,f.uploadId);await processCleanupOnce(pool,f.storage,undefined,o.id);
      assert.equal((await job(o.id)).generation,2);assert.equal(f.storage.objects.has(o.key),false);assert.equal([...f.storage.multipart.values()].includes(o.key),false);
    });
    await t.test('candidato FINAL incierto nunca seleccionado: borrado y recuperación de PUT tardío',async()=>{
      const f=await fresh();await processing(f);
      f.storage.putNew=async()=>{throw Error('PUT response lost');};
      await processValidationOnce(pool,f.storage,{async analyze(){return {signatureVersion:'controlled-daily-1',signaturePublishedAt:new Date(Date.now()-3600000)};}},undefined,f.uploadId);
      await agedTerminal(f);await maintainStorageOnce(pool,f.uploadId);
      const o=(await objects(f)).find(o=>o.kind==='FINAL');assert.ok(o);assert.equal(o.writeState,'UNCERTAIN');assert.equal(o.activatedAt,null);
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal((await job(o.id)).status,'SUCCEEDED');
      f.storage.objects.set(o.key,f.storage.payload);f.storage.uploadIds.set(o.key,f.uploadId);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=clock_timestamp() WHERE id=$1`,[o.id]));
      await maintainStorageOnce(pool,f.uploadId);await processCleanupOnce(pool,f.storage,undefined,o.id);
      assert.equal(f.storage.objects.has(o.key),false);assert.equal((await job(o.id)).generation,2);
    });
    await t.test('escritura confirmada: ausencia única suficiente, sin reprogramación semanal',async()=>{
      const f=await fresh(),o=await agedTerminal(f);await processCleanupOnce(pool,f.storage,undefined,o.id);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "nextProbeAt"=clock_timestamp() WHERE id=$1`,[o.id]));
      assert.equal(await maintainStorageOnce(pool,f.uploadId),false);assert.equal((await job(o.id)).generation,1);
    });
    await t.test('DELETE iniciado no permite reactivación ni reutilización de clave',async()=>{
      const f=await fresh(),o=await agedTerminal(f);let checked=false;
      f.storage.before=async kind=>{if(kind!=='delete')return;checked=true;
        await assert.rejects(transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=NULL,"cleanupAfter"=NULL,"nextProbeAt"=NULL WHERE id=$1`,[o.id])),e=>(e as {code:string}).code==='23514');
        await assert.rejects(transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET key=$2 WHERE id=$1`,[o.id,`snipers/temporary/${op()}`])),e=>(e as {code:string}).code==='23514');
        await assert.rejects(transaction(pool,tx=>tx.query(`UPDATE "SnipersStorageObject" SET "activatedAt"=clock_timestamp() WHERE id=$1`,[o.id])),e=>(e as {code:string}).code==='23514');
      };
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal(checked,true);assert.equal((await job(o.id)).status,'SUCCEEDED');
    });
    await t.test('heartbeat durante varias solicitudes lentas conserva generación y renueva lease',async()=>{
      const f=await fresh(),o=await agedTerminal(f);let initial:Date|undefined;
      f.storage.before=async kind=>{if(kind==='list'||kind==='delete'){initial??=(await job(o.id)).leaseUntil;await delay(7200);}if(kind==='head'&&initial)assert.ok((await job(o.id)).leaseUntil>initial);};
      await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal((await job(o.id)).status,'SUCCEEDED');
      // Three sub-10s calls cross the real 20s heartbeat; final audit and generation must remain valid.
      assert.equal((await job(o.id)).generation,1);assert.ok(initial);
    });
    await t.test('SIGTERM simulado durante DELETE no acredita éxito aunque el remoto termine tarde',async()=>{
      const f=await fresh(),o=await agedTerminal(f),shutdown=new AbortController();
      f.storage.before=async(kind,key)=>{if(kind==='delete'){shutdown.abort();await delay(20);f.storage.objects.set(key,f.storage.payload);}};
      await processCleanupOnce(pool,f.storage,shutdown.signal,o.id);assert.equal((await job(o.id)).status,'WAIT_RETRY');assert.equal((await objects(f))[0].lastAbsentAt,null);
      await delay(30);f.storage.before=undefined;await readyRetry(o.id);await processCleanupOnce(pool,f.storage,undefined,o.id);assert.equal(f.storage.objects.has(o.key),false);
    });
    await t.test('solicitud que ignora abort queda acotada a 10s y vuelve a ejecutar transferencia',async()=>{
      const f=await fresh(),o=await agedTerminal(f);f.storage.before=async kind=>{if(kind==='delete')await new Promise<void>(()=>{});};
      const before=Date.now();await processCleanupOnce(pool,f.storage,undefined,o.id);assert.ok(Date.now()-before<14000);assert.equal((await job(o.id)).status,'WAIT_RETRY');
      const g=await fresh();assert.equal(await state(g),'UPLOADING');
    });
    await t.test('presupuesto total de 30s corta múltiples solicitudes válidas sin acreditar ausencia',async()=>{
      const f=await fresh(),o=await agedTerminal(f);
      f.storage.before=async(kind,_key,signal)=>{if(['list','delete','head'].includes(kind))await delay(9000,undefined,{signal});};
      const before=Date.now();await processCleanupOnce(pool,f.storage,undefined,o.id);const elapsed=Date.now()-before;
      assert.ok(elapsed>=29000&&elapsed<34000);assert.equal((await job(o.id)).status,'WAIT_RETRY');
      assert.equal((await job(o.id)).errorCode,'VISIT_INTERRUPTED');assert.equal((await objects(f))[0].lastAbsentAt,null);
    });
    await t.test('definitivo VERIFIED: desvinculado, vinculado, clase archivada y recurso archivado nunca se borran',async()=>{
      const f=await fresh();await processing(f);await processValidationOnce(pool,f.storage,{async analyze(){return {signatureVersion:'controlled-daily-1',signaturePublishedAt:new Date(Date.now()-3600000)};}},undefined,f.uploadId);
      const final=(await objects(f)).find(o=>o.kind==='FINAL');assert.ok(final?.activatedAt);
      const guard=async()=>{f.storage.calls=[];assert.equal(await processCleanupOnce(pool,f.storage,undefined,final.id),false);assert.equal(f.storage.calls.length,0);};
      await guard();const cl=await getEditorialClass(pool,actor,classId);
      await linkResource(pool,actor,{operationId:op(),classId,expectedVersion:cl.version,resourceId:f.resourceId,transition:'ATTACH'});await guard();
      const cl2=await getEditorialClass(pool,actor,classId);await transitionContent(pool,actor,{operationId:op(),entity:'CLASS',id:classId,expectedVersion:cl2.version,transition:'ARCHIVE'});await guard();
      await transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"attachedAt"=NULL,"archivedAt"=clock_timestamp() WHERE id=$1`,[f.resourceId]);
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',"cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE id=$1`,[final.id]);
        // Even a mistakenly queued cleanup job must block without issuing remote calls.
        await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","storageObjectId",kind,"updatedAt") VALUES ($1,$2,$3,'CLEAN_OBJECT',clock_timestamp())`,[op(),f.resourceId,final.id]);
      });
      await guard();assert.equal((await job(final.id)).errorCode,'PROTECTED_FINAL');
    });
    await t.test('eventos v3 coherentes, inmutables y sin identidades remotas ni secretos',async()=>{
      const events=(await pool.query(`SELECT * FROM "SnipersAuditEvent" WHERE payload->>'formatVersion'='3' AND action='FILE_FOUNDATION_CHANGED'`)).rows;assert.ok(events.length>10);
      for(const e of events){const p=cleanupAuditSchema.parse(e.payload);assert.equal(e.actorUserId,null);assert.equal(e.entityId,p.result.resourceId);assert.equal(e.id,p.result.operationId);assert.equal(p.commandHash,digest(p.result));}
      assert.doesNotMatch(JSON.stringify(events),/https?:|multipartUploadId|leaseToken|secret/i);
      await assert.rejects(pool.query(`DELETE FROM "SnipersAuditEvent" WHERE id=$1`,[events[0].id]),e=>(e as {code:string}).code==='23514');
    });
  }finally{await pool.end();}
});
