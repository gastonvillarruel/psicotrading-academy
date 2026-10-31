import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { requireRunner, verifyDatabase, localPool } from '../phase1/guard';
import { transaction, type Actor } from '../../src/lib/snipers/permissions';
import { startUpload, completeUpload, cancelUpload } from '../../src/lib/snipers/uploads';
import { claimUploadJob, processUploadOnce, heartbeatUploadJob } from '../../src/lib/snipers/upload-processor';
import { processValidationOnce } from '../../src/lib/snipers/file-processor';
import { ValidationFailure, type FileAnalyzer, type ValidationStorage } from '../../src/lib/snipers/file-validation';
import type { MultipartStorage } from '../../src/lib/snipers/upload-storage';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('%PDF-1.7\ncontrolled bytes: no real format/antivirus claim\n%%EOF');
// Transport and analyzer doubles are explicit. All leases, generations, constraints and commits are real SQL.
class StorageDouble implements MultipartStorage, ValidationStorage {
  objects = new Map<string,{ bytes:Buffer; uploadId:string }>();
  multipart = new Map<string,{key:string;uploadId:string}>();
  puts: string[] = []; reads: string[] = [];
  payload = bytes; mode = 'clean'; onPut?: () => Promise<void>; onRead?: (key:string) => Promise<void>;
  async create(key:string,_mime:string,uploadId:string) { const id=randomUUID(); this.multipart.set(id,{key,uploadId}); return id; }
  async listParts() { return [{partNumber:1,etag:'"fixture"',sizeBytes:this.payload.length}]; }
  async complete(key:string,id:string) { this.objects.set(key,{bytes:this.payload,uploadId:this.multipart.get(id)!.uploadId}); }
  async head(key:string) { const o=this.objects.get(key); return o ? {sizeBytes:o.bytes.length,uploadId:o.uploadId} : null; }
  async signPart():Promise<string> { throw Error('unused'); }
  async abort() {}
  async read(key:string,signal:AbortSignal) {
    signal.throwIfAborted(); this.reads.push(key); if(this.onRead)await this.onRead(key);
    const object=this.objects.get(key); if(!object)throw Error('missing');
    if(this.mode==='incomplete' && key.includes('/temporary/')) return Readable.from((async function*(){yield object.bytes;throw Error('truncated transport');})());
    return Readable.from([object.bytes]);
  }
  async putNew(key:string,file:string,_size:number,_mime:string,uploadId:string,signal:AbortSignal) {
    signal.throwIfAborted(); assert.equal(this.objects.has(key),false,'Must never overwrite'); this.puts.push(key);
    if(this.onPut)await this.onPut();
    if(this.mode==='failed-put')throw Error('no acknowledgement');
    this.objects.set(key,{bytes:this.mode==='corrupt-final' ? Buffer.from('corrupt') : await readFile(file),uploadId});
    if(this.mode==='ambiguous-put')throw Error('response lost');
  }
}

test('3B-2C: PostgreSQL real, almacenamiento y analizadores controlados', {timeout:180000}, async t => {
  assert.equal(process.env.SNIPERS_PHASE3B2C_LOCAL,'1');
  const p=requireRunner(); verifyDatabase(p); const pool=localPool();
  const actor:Actor={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  const classId=randomUUID();
  await pool.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'3B-2C local','{}',clock_timestamp(),clock_timestamp())`,[classId]);
  const proof=()=>({signatureVersion:'controlled-daily-1',signaturePublishedAt:new Date(Date.now()-3600000)});
  const clean:FileAnalyzer={async analyze(){return proof();}};
  async function stage(declaredSha=sha(bytes),type:'MP3'|'PDF'='PDF') {
    const storage=new StorageDouble();
    const r=await startUpload(pool,actor,{operationId:randomUUID(),classId,name:'3B-2C fixture',expectedSha256:declaredSha,
      file:{type,mimeType:type==='PDF'?'application/pdf':'audio/mpeg',sizeBytes:bytes.length}});
    await processUploadOnce(pool,storage,undefined,r.uploadId);
    await completeUpload(pool,actor,{operationId:randomUUID(),uploadId:r.uploadId,parts:[{partNumber:1,etag:'"fixture"'}]});
    await processUploadOnce(pool,storage,undefined,r.uploadId);
    const u=(await pool.query('SELECT u.*,o.key FROM "SnipersUpload" u JOIN "SnipersStorageObject" o ON o.id=u."temporaryObjectId" WHERE u.id=$1',[r.uploadId])).rows[0];
    assert.equal(u.status,'PROCESSING');
    return {...r,u,storage};
  }
  type Fixture=Awaited<ReturnType<typeof stage>>;
  const run=(f:Fixture,analyzer=clean,signal?:AbortSignal)=>processValidationOnce(pool,f.storage,analyzer,signal,f.uploadId);
  const state=async(f:Fixture)=>(await pool.query(`SELECT r.status,r."attachedAt",r."verifiedAt",r."finalObjectId",r.checksum,
    u.status AS "uploadStatus",u."validationGeneration",j.status AS "jobStatus",j."errorCode",j.generation,j."leaseToken",j."leaseUntil"
    FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id JOIN "SnipersFileJob" j ON j."uploadId"=u.id AND j.kind='PROCESS_UPLOAD' WHERE r.id=$1`,[f.resourceId])).rows[0];
  const cancel=(f:Fixture)=>cancelUpload(pool,actor,{operationId:randomUUID(),uploadId:f.uploadId},()=>f.storage);
  try {
    await t.test('éxito: GET temporal + GET final completos, evidencia coherente, attachedAt NULL e idempotencia',async()=>{
      const f=await stage(); await run(f); const s=await state(f);
      assert.equal(s.status,'VERIFIED');assert.equal(s.uploadStatus,'SUCCEEDED');assert.equal(s.jobStatus,'SUCCEEDED');
      assert.equal(s.attachedAt,null);assert.ok(s.verifiedAt);assert.equal(s.checksum,sha(bytes));assert.equal(s.validationGeneration,s.generation);
      assert.equal(f.storage.puts.length,1);assert.equal(f.storage.reads.length,2);assert.equal(await run(f),false);
      const objects=(await pool.query('SELECT * FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows;
      const final=objects.find(o=>o.kind==='FINAL')!,temporary=objects.find(o=>o.kind==='TEMPORARY')!;
      assert.equal(final.writeState,'BYTES_VERIFIED');assert.equal(final.id,s.finalObjectId);assert.equal(final.verifiedSha256,sha(bytes));
      assert.ok(temporary.retiredAt);assert.ok(temporary.cleanupAfter-temporary.retiredAt>=86400000);
      const before=f.storage.puts.length;await processValidationOnce(pool,f.storage,clean,undefined,f.uploadId);assert.equal(f.storage.puts.length,before);
    });
    for(const issue of ['sha','short','exceeded'] as const) await t.test(`rechazo de bytes: ${issue}`,async()=>{
      const f=await stage(issue==='sha'?'a'.repeat(64):sha(bytes));
      if(issue!=='sha')f.storage.objects.get(f.u.key)!.bytes=issue==='short'?bytes.subarray(1):Buffer.concat([bytes,Buffer.from('x')]);
      let analyzed=false;await run(f,{async analyze(){analyzed=true;return proof();}});const s=await state(f);
      assert.equal(s.status,'REJECTED');assert.equal(s.uploadStatus,'FAILED');assert.equal(s.jobStatus,'FAILED');assert.equal(s.attachedAt,null);
      assert.equal(analyzed,false);assert.equal(f.storage.puts.length,0);assert.equal(s.leaseToken,null);
      const objects=(await pool.query('SELECT "retiredAt","cleanupAfter" FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows;
      assert.ok(objects.every(o=>o.cleanupAfter-o.retiredAt>=7*86400000));
    });
    for(const failure of ['INVALID_MP3','INVALID_PDF','PDF_ENCRYPTED_OR_INVALID','MALWARE_OR_SCAN_LIMIT','SIGNATURES_STALE','ANTIVIRUS_INCOMPLETE','ANALYSIS_TIMEOUT']) {
      await t.test(`analizador falla cerrado: ${failure}`,async()=>{
        const f=await stage(sha(bytes),failure==='INVALID_MP3'?'MP3':'PDF');
        await run(f,{async analyze(){throw new ValidationFailure(failure);}});const s=await state(f);
        assert.ok(['REJECTED','PENDING'].includes(s.status));assert.equal(s.verifiedAt,null);assert.equal(s.finalObjectId,null);assert.equal(s.attachedAt,null);
        assert.equal(s.errorCode,failure);assert.equal(f.storage.puts.length,0);if(s.uploadStatus==='PROCESSING')await cancel(f);
      });
    }
    await t.test('no confiar en prueba de firmas caducadas que devuelve un adaptador',async()=>{
      const f=await stage();await run(f,{async analyze(){return {...proof(),signaturePublishedAt:new Date(Date.now()-73*3600000)};}});
      assert.equal((await state(f)).errorCode,'SIGNATURES_STALE');assert.equal(f.storage.puts.length,0);await cancel(f);
    });
    await t.test('fuente incompleta y error remoto no producen pruebas ni FINAL; reintento durable',async()=>{
      const f=await stage();f.storage.mode='incomplete';await run(f);const s=await state(f);
      assert.equal(s.jobStatus,'WAIT_RETRY');assert.equal(s.verifiedAt,null);assert.equal(s.validationGeneration,null);assert.equal(f.storage.puts.length,0);await cancel(f);
    });
    await t.test('cancelación durante análisis invalida el resultado tardío',async()=>{
      const f=await stage();await run(f,{async analyze(){await cancel(f);return proof();}});
      const s=await state(f);assert.equal(s.uploadStatus,'CANCELLED');assert.equal(s.verifiedAt,null);assert.equal(f.storage.puts.length,0);
    });
    await t.test('apagado durante análisis no promueve y libera el lease',async()=>{
      const f=await stage(),controller=new AbortController();
      await run(f,{async analyze(){controller.abort();throw new ValidationFailure('ANALYSIS_ABORTED');}},controller.signal);
      const s=await state(f);assert.equal(s.verifiedAt,null);assert.equal(s.leaseToken,null);assert.equal(s.jobStatus,'WAIT_RETRY');
      assert.equal(s.errorCode,'VALIDATION_INTERRUPTED');assert.equal(f.storage.puts.length,0);await cancel(f);
    });
    await t.test('reinicio con lease vencido: nueva generación y token anterior inutilizable',async()=>{
      const f=await stage(),old=(await claimUploadJob(pool,true,f.uploadId))!;
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE id=$1`,[old.id]));
      await delay(140);await run(f);const s=await state(f);
      assert.equal(s.status,'VERIFIED');assert.equal(s.generation,old.generation+1);assert.equal(await heartbeatUploadJob(pool,old),false);
    });
    await t.test('reinicio con candidato retirado hace ocho días no extiende su retención vencida',async()=>{
      const f=await stage(),old=(await claimUploadJob(pool,true,f.uploadId))!,objectId=randomUUID();
      await transaction(pool,async tx=>{
        await tx.query(`INSERT INTO "SnipersStorageObject" (id,"resourceId",key,kind,"producerJobId","producerGeneration","writeOperation","writeState","updatedAt")
          VALUES ($1,$2,$3,'FINAL',$4,$5,'PUT_FINAL','IN_FLIGHT',clock_timestamp())`,[objectId,f.resourceId,`snipers/final/${f.resourceId}/${old.generation}/${objectId}`,old.id,old.generation]);
        // Simulated elapsed time at the first retirement; immutable fields are never rewritten.
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp()-interval '8 days',
          "cleanupAfter"=statement_timestamp()-interval '1 day',"nextProbeAt"=statement_timestamp()-interval '1 day' WHERE id=$1`,[objectId]);
        await tx.query(`UPDATE "SnipersFileJob" SET status='WAIT_RETRY',phase='PUT_FINAL',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=$1`,[old.id]);
      });
      const before=(await pool.query('SELECT "retiredAt","cleanupAfter","nextProbeAt" FROM "SnipersStorageObject" WHERE id=$1',[objectId])).rows[0];
      await run(f);assert.equal((await state(f)).status,'VERIFIED');
      const after=(await pool.query('SELECT "retiredAt","cleanupAfter","nextProbeAt" FROM "SnipersStorageObject" WHERE id=$1',[objectId])).rows[0];
      assert.deepEqual(after,before);assert.equal(f.storage.puts.length,1);
    });
    await t.test('generación obsoleta durante PUT: abandona candidato y nunca sobrescribe; sólo la nueva acredita',async()=>{
      const f=await stage();let replaced=false;
      f.storage.onPut=async()=>{
        if(replaced)return;replaced=true;
        await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
        await delay(140);await run(f);
      };
      await run(f);const s=await state(f);assert.equal(s.status,'VERIFIED');assert.equal(f.storage.puts.length,2);
      assert.notEqual(f.storage.puts[0],f.storage.puts[1]);
      const objects=(await pool.query(`SELECT key,"retiredAt","activatedAt" FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind='FINAL' ORDER BY "producerGeneration"`,[f.resourceId])).rows;
      assert.ok(objects[0].retiredAt);assert.equal(objects[0].activatedAt,null);assert.ok(objects[1].activatedAt);
    });
    for(const mode of ['failed-put','corrupt-final','ambiguous-put']) await t.test(`promoción: ${mode}`,async()=>{
      const f=await stage();f.storage.mode=mode;await run(f);const s=await state(f);
      assert.equal(f.storage.puts.length,1);
      if(mode==='ambiguous-put')assert.equal(s.status,'VERIFIED');
      else {assert.equal(s.verifiedAt,null);assert.equal(s.jobStatus,'BLOCKED');assert.equal(await run(f),false);assert.equal(f.storage.puts.length,1);await cancel(f);}
    });
    await t.test('cancelación después de PUT remoto conserva inventario retirado y no acredita bytes',async()=>{
      const f=await stage();f.storage.onPut=async()=>{await cancel(f);};await run(f);
      const s=await state(f);assert.equal(s.uploadStatus,'CANCELLED');assert.equal(s.verifiedAt,null);assert.equal(f.storage.puts.length,1);
      const objects=(await pool.query('SELECT "retiredAt","activatedAt" FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows;
      assert.ok(objects.every(o=>o.retiredAt && o.activatedAt===null));
    });
    await t.test('cancelación durante GET FINAL impide confirmar la lectura correcta posterior',async()=>{
      const f=await stage();
      f.storage.onRead=async key=>{if(key.includes('/final/'))await cancel(f);};
      await run(f);const s=await state(f);
      assert.equal(s.uploadStatus,'CANCELLED');assert.equal(s.verifiedAt,null);assert.equal(s.finalObjectId,null);assert.equal(s.attachedAt,null);
      const object=(await pool.query(`SELECT "bytesVerifiedAt","activatedAt","retiredAt" FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind='FINAL'`,[f.resourceId])).rows[0];
      assert.equal(object.bytesVerifiedAt,null);assert.equal(object.activatedAt,null);assert.ok(object.retiredAt);
    });
    await t.test('lease vencido durante GET FINAL no acredita; el reinicio usa otra clave y generación',async()=>{
      const f=await stage();let expired=false;
      f.storage.onRead=async key=>{
        if(!key.includes('/final/') || expired)return;expired=true;
        await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '100 milliseconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
        await delay(140);
      };
      await run(f);const old=await state(f);
      assert.equal(old.status,'PENDING');assert.equal(old.verifiedAt,null);assert.equal(old.finalObjectId,null);
      await run(f);const current=await state(f);
      assert.equal(current.status,'VERIFIED');assert.equal(current.generation,old.generation+1);assert.equal(current.attachedAt,null);
      assert.equal(f.storage.puts.length,2);assert.notEqual(f.storage.puts[0],f.storage.puts[1]);
      const objects=(await pool.query(`SELECT "bytesVerifiedAt","activatedAt","retiredAt" FROM "SnipersStorageObject" WHERE "resourceId"=$1 AND kind='FINAL' ORDER BY "producerGeneration"`,[f.resourceId])).rows;
      assert.equal(objects[0].bytesVerifiedAt,null);assert.equal(objects[0].activatedAt,null);assert.ok(objects[0].retiredAt);assert.ok(objects[1].activatedAt);
    });
    await t.test('SQL impide activar un recurso sin prueba final y sin todos los controles',async()=>{
      const f=await stage();
      await assert.rejects(transaction(pool,async tx=>{
        await tx.query(`UPDATE "SnipersResource" SET status='VERIFIED',"verifiedAt"=clock_timestamp(),checksum=$2 WHERE id=$1`,[f.resourceId,sha(bytes)]);
      }),error=>(error as {code:string}).code==='23514');
      assert.equal((await state(f)).status,'PENDING');await cancel(f);
    });
  } finally {await pool.end();}
});
