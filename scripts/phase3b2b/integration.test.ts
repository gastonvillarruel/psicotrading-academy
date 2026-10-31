import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { localPool, requireRunner, verifyDatabase } from '../phase1/guard';
import { changePermission, transaction, type Actor } from '../../src/lib/snipers/permissions';
import { startUpload, getUpload, signUploadPart, completeUpload, cancelUpload } from '../../src/lib/snipers/uploads';
import { processUploadOnce, heartbeatUploadJob } from '../../src/lib/snipers/upload-processor';
import { createUploadGateway } from '../../src/lib/snipers/upload-gateway';
import { createR2Storage, r2TestConfig, type MultipartStorage, type StoredPart } from '../../src/lib/snipers/upload-storage';
import { startUploadSchema, PART_BYTES, uploadReceiptSchema } from '../../src/lib/snipers/upload-contracts';
import { browserDeclaration } from '../../src/lib/snipers/upload-client';
import { fileAuditSchema } from '../../src/lib/snipers/file-contracts';

// Explicit in-memory storage double: tests real SQL/services, not Cloudflare R2.
class StorageDouble implements MultipartStorage {
  multiparts = new Map<string,{key:string;uploadId:string;parts:StoredPart[]}>();
  objects = new Map<string,{sizeBytes:number;uploadId:string}>();
  creates=0; completes=0; aborts=0; createUncertain=false; completeUncertain=false; unavailable=false; onCreate?:()=>Promise<void>;
  async create(key:string,_mime:string,uploadId:string) { this.creates++; if(this.onCreate)await this.onCreate();if(this.createUncertain)throw Error('uncertain create');const id=randomUUID();this.multiparts.set(id,{key,uploadId,parts:[]});return id; }
  async listParts(_key:string,id:string) { if(this.unavailable)throw Error('offline');return this.multiparts.get(id)!.parts; }
  async complete(key:string,id:string,parts:{partNumber:number;etag:string}[]) { this.completes++;const m=this.multiparts.get(id)!;assert.equal(parts.length,m.parts.length);this.objects.set(key,{sizeBytes:m.parts.reduce((n,p)=>n+p.sizeBytes,0),uploadId:m.uploadId});this.multiparts.delete(id);if(this.completeUncertain)throw Error('ack lost'); }
  async head(key:string) { if(this.unavailable)throw Error('offline');return this.objects.get(key)??null; }
  async signPart() { return 'https://storage-double.invalid/part'; }
  async abort(_key:string,id:string) {this.aborts++;if(this.unavailable)throw Error('offline');this.multiparts.delete(id);}
}
const errorCode=(e:unknown)=>(e as {code?:string}).code;
test('3B-2B: carga/procesador, PostgreSQL real y almacenamiento doble explícito',{timeout:120000},async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B2B_LOCAL,'1');const profile=requireRunner();verifyDatabase(profile);const pool=localPool();
  const root:Actor={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  async function user(permission?:'SNIPERS_CONTENT_EDITOR'|'SNIPERS_MEMBERSHIP_MANAGER'|'SNIPERS_ADMIN',role='STUDENT') {
    const actor={userId:randomUUID(),activeSessionId:randomUUID(),singleSession:true};await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())`,[actor.userId,`phase3b2b-${actor.userId}@local.invalid`,role,actor.activeSessionId]);if(permission)await changePermission(pool,root,actor.userId,permission,true);return actor;
  }
  const editor=await user('SNIPERS_CONTENT_EDITOR'),other=await user('SNIPERS_CONTENT_EDITOR'),student=await user(),manager=await user('SNIPERS_MEMBERSHIP_MANAGER'),admin=await user(undefined,'ADMIN');
  const storage=new StorageDouble();const provider=()=>storage;
  const classId=randomUUID();await pool.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Carga 3B-2B','{}',clock_timestamp(),clock_timestamp())`,[classId]);
  const input=(sizeBytes=10,type:'MP3'|'PDF'='PDF')=>({operationId:randomUUID(),classId,name:`recurso-${randomUUID()}`,file:{type,mimeType:type==='PDF'?'application/pdf':'audio/mpeg',sizeBytes},expectedSha256:'a'.repeat(64)});
  async function fresh(size=10){const r=await startUpload(pool,editor,input(size));await processUploadOnce(pool,storage);const u=(await pool.query('SELECT u.*,o.key FROM "SnipersUpload" u JOIN "SnipersStorageObject" o ON o.id=u."temporaryObjectId" WHERE u.id=$1',[r.uploadId])).rows[0];return {...r,u};}
  const manifest=[{partNumber:1,etag:'"part-one"'}];
  function fill(id:string,sizeBytes=10){storage.multiparts.get(id)!.parts=Array.from({length:Math.ceil(sizeBytes/PART_BYTES)},(_,i)=>({partNumber:i+1,etag:`"part-${i+1}"`,sizeBytes:Math.min(PART_BYTES,sizeBytes-i*PART_BYTES)}));return storage.multiparts.get(id)!.parts.map(({partNumber,etag})=>({partNumber,etag}));}
  async function stageComplete(){const r=await fresh();const parts=fill(r.u.multipartUploadId);await completeUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId,parts});return {...r,parts};}
  try {
    await t.test('límites exactos, MIME, campos extra y selección de navegador',()=>{
      for(const [type,max,mime] of [['MP3',262144000,'audio/mpeg'],['PDF',26214400,'application/pdf']] as const){assert.equal(startUploadSchema.safeParse(input(max,type)).success,true);for(const n of [0,-1,max+1,1.5])assert.equal(startUploadSchema.safeParse(input(n,type)).success,false);assert.throws(()=>browserDeclaration({name:`file.${type.toLowerCase()}`,size:max+1,type:mime}));}
      assert.equal(startUploadSchema.safeParse({...input(),file:{type:'PDF',mimeType:'text/html',sizeBytes:10}}).success,false);
      assert.equal(startUploadSchema.safeParse({...input(),objectKey:'attack'}).success,false);
      assert.throws(()=>browserDeclaration({name:'malware.exe',size:10,type:'application/pdf'}));
    });
    await t.test('permiso editorial y sesión efectiva antes de crear; flag antes de sesión',async()=>{
      for(const actor of [student,manager,admin])await assert.rejects(startUpload(pool,actor,input()),e=>errorCode(e)==='FORBIDDEN');
      await assert.rejects(startUpload(pool,{...editor,activeSessionId:randomUUID()},input()),e=>errorCode(e)==='SESSION');
      let sessions=0;const gateway=createUploadGateway(pool,async()=>{sessions++;return null;},()=>({enabled:'false'}),provider);
      await assert.rejects(gateway.start(input()),e=>errorCode(e)==='DISABLED');assert.equal(sessions,0);
    });
    await t.test('inicio concurrente confirma un solo recurso/trabajo/recibo y reautoriza replay',async()=>{
      const v=input();const [a,b]=await Promise.all([startUpload(pool,editor,v),startUpload(pool,editor,v)]);assert.deepEqual(a,b);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersFileJob" WHERE "uploadId"=$1',[a.uploadId])).rows[0].n,1);
      await assert.rejects(startUpload(pool,editor,{...v,name:'otro'}),e=>errorCode(e)==='IDEMPOTENCY_CONFLICT');
      await assert.rejects(startUpload(pool,other,v),e=>errorCode(e)==='IDEMPOTENCY_CONFLICT');
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:a.uploadId},provider);
      await changePermission(pool,root,editor.userId,'SNIPERS_CONTENT_EDITOR',false);
      try{await assert.rejects(startUpload(pool,editor,v),e=>errorCode(e)==='FORBIDDEN');}finally{await changePermission(pool,root,editor.userId,'SNIPERS_CONTENT_EDITOR',true);}
    });
    await t.test('preparación real SQL y aislamiento entre editores para todos los comandos',async()=>{
      const r=await fresh();assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).status,'UPLOADING');
      for(const fn of [()=>getUpload(pool,other,{uploadId:r.uploadId}),()=>signUploadPart(pool,other,{uploadId:r.uploadId,partNumber:1},provider),()=>completeUpload(pool,other,{operationId:randomUUID(),uploadId:r.uploadId,parts:manifest}),()=>cancelUpload(pool,other,{operationId:randomUUID(),uploadId:r.uploadId},provider)])await assert.rejects(fn,e=>errorCode(e)==='NOT_FOUND');
      await signUploadPart(pool,editor,{uploadId:r.uploadId,partNumber:1},provider);
      await assert.rejects(signUploadPart(pool,editor,{uploadId:r.uploadId,partNumber:2},provider),e=>errorCode(e)==='VALIDATION');
      assert.ok((await pool.query('SELECT "lastPartUrlExpiresAt" FROM "SnipersUpload" WHERE id=$1',[r.uploadId])).rows[0].lastPartUrlExpiresAt);
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('partes faltantes se rechazan; tamaño/ETag remoto discrepante bloquea sin completar',async()=>{
      const r=await fresh(PART_BYTES+10);
      await assert.rejects(completeUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId,parts:manifest}),e=>errorCode(e)==='VALIDATION');
      const parts=fill(r.u.multipartUploadId,PART_BYTES+10);storage.multiparts.get(r.u.multipartUploadId)!.parts[0].sizeBytes--;
      await completeUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId,parts});const before=storage.completes;await processUploadOnce(pool,storage);
      const state=await getUpload(pool,editor,{uploadId:r.uploadId});assert.equal(state.errorCode,'PARTS_MISMATCH');assert.equal(storage.completes,before);
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('doble finalización concurrente comparte trabajo y sólo una operación remota; nunca VERIFIED',async()=>{
      const r=await fresh();const parts=fill(r.u.multipartUploadId);const v={operationId:randomUUID(),uploadId:r.uploadId,parts};
      await Promise.all([completeUpload(pool,editor,v),completeUpload(pool,editor,v),completeUpload(pool,editor,{...v,operationId:randomUUID()})]);
      await assert.rejects(completeUpload(pool,editor,{...v,operationId:randomUUID(),parts:manifest}),e=>errorCode(e)==='INVALID_STATE');
      const before=storage.completes;await processUploadOnce(pool,storage);assert.equal(storage.completes,before+1);
      const state=await getUpload(pool,editor,{uploadId:r.uploadId});assert.equal(state.status,'PROCESSING');assert.equal(state.transferComplete,true);assert.equal(state.errorCode,'AWAITING_VALIDATION');
      const resource=(await pool.query('SELECT status,"attachedAt","verifiedAt","finalObjectId" FROM "SnipersResource" WHERE id=$1',[r.resourceId])).rows[0];assert.deepEqual(resource,{status:'PENDING',attachedAt:null,verifiedAt:null,finalObjectId:null});
      assert.equal((await pool.query('SELECT count(*)::int n FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind=\'FINAL\'',[r.resourceId])).rows[0].n,0);
      assert.equal(await processUploadOnce(pool,storage),false);
    });
    await t.test('respuesta de completar perdida se resuelve por HEAD del temporal, sin duplicar escritura',async()=>{
      const r=await stageComplete();storage.completeUncertain=true;
      try{await processUploadOnce(pool,storage);assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).transferComplete,true);}finally{storage.completeUncertain=false;}
    });
    await t.test('cancelación idempotente confirma SQL aunque aborto remoto falle; firmas posteriores denegadas',async()=>{
      const r=await fresh();storage.unavailable=true;const v={operationId:randomUUID(),uploadId:r.uploadId};const cancelled=await cancelUpload(pool,editor,v,provider);assert.equal(cancelled.abortPending,true);
      assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).status,'CANCELLED');
      storage.unavailable=false;assert.equal((await cancelUpload(pool,editor,v,provider)).abortPending,false);
      await assert.rejects(signUploadPart(pool,editor,{uploadId:r.uploadId,partNumber:1},provider),e=>errorCode(e)==='INVALID_STATE');
      const obj=(await pool.query('SELECT "retiredAt","cleanupAfter" FROM "SnipersStorageObject" WHERE "resourceId"=$1',[r.resourceId])).rows[0];assert.ok(obj.cleanupAfter>=obj.retiredAt);
    });
    await t.test('cancelación durante Create cerca una generación y aborta el multipart recibido tarde',async()=>{
      const r=await startUpload(pool,editor,input());storage.onCreate=async()=>{await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);};
      const before=storage.aborts;try{await processUploadOnce(pool,storage);}finally{storage.onCreate=undefined;}
      assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).status,'CANCELLED');assert.equal(storage.aborts,before+1);
    });
    await t.test('Create incierto bloquea sin repetirlo, incluso al volver a ejecutar el procesador',async()=>{
      const r=await startUpload(pool,editor,input());storage.createUncertain=true;const before=storage.creates;
      try{await processUploadOnce(pool,storage);}finally{storage.createUncertain=false;}
      assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).errorCode,'CREATE_UNCERTAIN');assert.equal(await processUploadOnce(pool,storage),false);assert.equal(storage.creates,before+1);
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('reinicio: trabajo con lease vencido se reclama y token viejo no puede heartbeat',async()=>{
      const r=await startUpload(pool,editor,input()),token=randomUUID();let old!: {id:string;generation:number;leaseToken:string};
      await transaction(pool,async tx=>{old=(await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=1,attempts=1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE "uploadId"=$1 RETURNING id,generation,"leaseToken"`,[r.uploadId,token])).rows[0];});
      await delay(140);await processUploadOnce(pool,storage);assert.equal(await heartbeatUploadJob(pool,old),false);
      assert.equal((await pool.query('SELECT generation FROM "SnipersFileJob" WHERE id=$1',[old.id])).rows[0].generation,2);
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('reinicio después de Complete remoto: HEAD recupera el resultado sin otra finalización',async()=>{
      const r=await stageComplete();const job=(await pool.query('SELECT id FROM "SnipersFileJob" WHERE "uploadId"=$1 AND kind=\'PROCESS_UPLOAD\'',[r.uploadId])).rows[0];
      await transaction(pool,async tx=>{await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=1,attempts=1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '100 milliseconds',phase='COMPLETE_MULTIPART' WHERE id=$1`,[job.id,randomUUID()]);await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='IN_FLIGHT' WHERE id=$1`,[r.u.temporaryObjectId]);});
      await storage.complete(r.u.key,r.u.multipartUploadId,r.parts);const before=storage.completes;await delay(140);await processUploadOnce(pool,storage);assert.equal(storage.completes,before);assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).transferComplete,true);
    });
    await t.test('Complete interrumpido sin objeto confirmable bloquea en vez de repetir la escritura',async()=>{
      const r=await stageComplete();
      await transaction(pool,async tx=>{await tx.query(`UPDATE "SnipersFileJob" SET status='RUNNING',generation=1,attempts=1,"leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval '100 milliseconds',phase='COMPLETE_MULTIPART' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[r.uploadId,randomUUID()]);await tx.query(`UPDATE "SnipersStorageObject" SET "writeOperation"='COMPLETE_MULTIPART',"writeState"='IN_FLIGHT' WHERE id=$1`,[r.u.temporaryObjectId]);});
      const before=storage.completes;await delay(140);await processUploadOnce(pool,storage);assert.equal(storage.completes,before);assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).errorCode,'COMPLETE_UNCERTAIN');
      await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('heartbeat renueva lease durante I/O lento sin abrir una transacción remota',async()=>{
      const r=await startUpload(pool,editor,input());let generation=0;
      storage.onCreate=async()=>{const before=(await pool.query('SELECT "leaseUntil",generation FROM "SnipersFileJob" WHERE "uploadId"=$1',[r.uploadId])).rows[0];generation=before.generation;await delay(21000);const after=(await pool.query('SELECT "leaseUntil",generation FROM "SnipersFileJob" WHERE "uploadId"=$1',[r.uploadId])).rows[0];assert.equal(after.generation,generation);assert.ok(after.leaseUntil>before.leaseUntil);};
      try{await processUploadOnce(pool,storage);}finally{storage.onCreate=undefined;}
      assert.equal(generation,1);assert.equal((await getUpload(pool,editor,{uploadId:r.uploadId})).status,'UPLOADING');await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('fallo transitorio de lectura reprograma; tercer intento bloquea sin inventar éxito',async()=>{
      const r=await stageComplete();storage.unavailable=true;
      try{for(let i=0;i<3;i++){await processUploadOnce(pool,storage);if(i<2)await transaction(pool,tx=>tx.query('UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "uploadId"=$1 AND kind=\'PROCESS_UPLOAD\'',[r.uploadId]).then(()=>undefined));}}finally{storage.unavailable=false;}
      const s=await getUpload(pool,editor,{uploadId:r.uploadId});assert.equal(s.blocked,true);assert.equal(s.transferComplete,false);assert.equal(s.errorCode,'STORAGE_UNAVAILABLE');await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:r.uploadId},provider);
    });
    await t.test('timeout real del SDK rechaza HEAD sin respuesta y el procesador libera el lease', {timeout:10000}, async t=>{
      let requests=0,observed:unknown,pendingUploadId:string|undefined;
      const server=createServer((request)=>{requests++;assert.equal(request.method,'HEAD');request.resume();});
      await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
      const handle=NodeHttpHandler.prototype.handle;
      // Override only the duration in this test; exercise the adapter's actual throwOnRequestTimeout setting.
      t.mock.method(NodeHttpHandler.prototype,'handle',function(this:NodeHttpHandler,request:Parameters<typeof handle>[0],options:Parameters<typeof handle>[1]){
        return handle.call(this,request,{...options,requestTimeout:100});
      });
      const sdk=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-timeout',
        SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-timeout-key',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-timeout-secret',
        SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_ENVIRONMENT:'local',DATABASE_URL:profile.DATABASE_URL});
      const watchdog=new AbortController(),timer=setTimeout(()=>watchdog.abort(),3000);
      try{
        // The independent watchdog prevents a broken regression from hanging; AbortError must never pass.
        await assert.rejects(sdk.head('snipers/temporary/timeout-probe',watchdog.signal),error=>{
          assert.equal((error as Error).name,'TimeoutError');assert.equal(errorCode(error),'ETIMEDOUT');return true;
        });
        const r=await stageComplete();pendingUploadId=r.uploadId;
        const monitored:MultipartStorage={...sdk,async head(key,signal){try{return await sdk.head(key,signal);}catch(error){observed=error;throw error;}}};
        assert.equal(await processUploadOnce(pool,monitored,watchdog.signal),true);
        assert.equal((observed as Error).name,'TimeoutError');assert.equal(errorCode(observed),'ETIMEDOUT');
        assert.equal(watchdog.signal.aborted,false);assert.equal(requests,2);
        const job=(await pool.query(`SELECT status,phase,"errorCode","leaseToken","leaseUntil",generation,attempts,
          "availableAt">clock_timestamp() AS scheduled FROM "SnipersFileJob" WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[r.uploadId])).rows[0];
        assert.deepEqual(job,{status:'WAIT_RETRY',phase:'RESERVED',errorCode:'STORAGE_UNAVAILABLE',leaseToken:null,leaseUntil:null,generation:1,attempts:1,scheduled:true});
        const state=await getUpload(pool,editor,{uploadId:r.uploadId});assert.equal(state.status,'COMPLETING');assert.equal(state.transferComplete,false);
      }finally{
        clearTimeout(timer);watchdog.abort();t.mock.restoreAll();server.closeAllConnections();
        await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
        if(pendingUploadId)await cancelUpload(pool,editor,{operationId:randomUUID(),uploadId:pendingUploadId},provider);
      }
    });
    await t.test('SDK real firma partes sin red y sólo acepta configuración de prueba separada',async()=>{
      assert.throws(()=>r2TestConfig({R2_ACCESS_KEY_ID:'production'}));assert.throws(()=>r2TestConfig({SNIPERS_R2_ENVIRONMENT:'production'}));
      const sdk=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-local',SNIPERS_R2_TEST_ACCESS_KEY_ID:'test-key',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'test-secret'});
      const url=new URL(await sdk.signPart('snipers/temporary/test','multipart-test',1,10,new Date(Date.now()+60000)));
      assert.equal(url.hostname,`${'a'.repeat(32)}.r2.cloudflarestorage.com`);assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.includes('content-length'));assert.equal(url.searchParams.get('partNumber'),'1');
    });
    await t.test('recibos nuevos estrictos no contienen nombres, claves, URLs ni credenciales',async()=>{
      const rows=(await pool.query(`SELECT payload FROM "SnipersAuditEvent" WHERE action='FILE_FOUNDATION_CHANGED' AND "entityType"='SnipersResource' AND payload->>'formatVersion'='2'`)).rows;assert.ok(rows.length>0);for(const row of rows)assert.equal(uploadReceiptSchema.safeParse(row.payload).success,true);
      // The historical reader must accept each version through its own strict schema.
      const versions=(await pool.query(`SELECT DISTINCT ON (payload->>'formatVersion') payload FROM "SnipersAuditEvent" WHERE action='FILE_FOUNDATION_CHANGED' ORDER BY payload->>'formatVersion'`)).rows;
      assert.equal(versions.length,2);for(const row of versions)assert.ok(fileAuditSchema.safeParse(row.payload).success||uploadReceiptSchema.safeParse(row.payload).success);
    });
  }finally{await pool.end();}
});
