import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {readProfile,isolatedEnv,npmBackup} from '../phase0/local';
import {CleanupDouble,testActor,op} from './fixtures';
import {createUploadGateway} from '../../src/lib/snipers/upload-gateway';
import {advancePrivateUpload} from '../../src/lib/snipers/basic-upload-processor';
import {createClass,getEditorialClass,linkResource,transitionContent,signResource} from '../../src/lib/snipers/content';
import {discardResource} from '../../src/lib/snipers/resource-discard';
import {processPendingDeletions} from '../../src/lib/snipers/storage-deletions';
import {transaction} from '../../src/lib/snipers/permissions';
import {claimUploadJob} from '../../src/lib/snipers/upload-processor';
import {digest} from '../../src/lib/snipers/preview';
import {fileDeclaration,type PrivateFileType} from '../../src/lib/snipers/file-contracts';

const body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Single object test'}]}]};
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function pdf(size=400){
  const b=Buffer.alloc(size,32),at=size-150;
  b.write('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
  b.write(`xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`,at);return b;
}
function mp3(size=1536){
  const b=Buffer.alloc(size),tag=size%384;
  if(tag){b.write('ID3');b[3]=4;b[8]=Math.floor((tag-10)/128);b[9]=(tag-10)%128;}
  for(let i=tag;i<size;i+=384)b.writeUInt32BE(0xfffb9400,i);return b;
}
class Storage extends CleanupDouble{
  creates=0;completes=0;copies=0;reads=0;failRead=false;lostComplete=false;
  readHook?:()=>Promise<void>;
  override async create(key:string,mime:string,id:string){this.creates++;return super.create(key,mime,id);}
  override async listParts(){return Array.from({length:Math.ceil(this.payload.length/8388608)},(_,i)=>({partNumber:i+1,etag:`part-${i+1}`,sizeBytes:Math.min(8388608,this.payload.length-i*8388608)}));}
  override async complete(key:string){
    assert.equal(this.objects.has(key),false);this.completes++;this.objects.set(key,this.payload);
    for(const [id,k]of this.multipart)if(k===key)this.multipart.delete(id);
    if(this.lostComplete)throw Error('Lost complete acknowledgement');
  }
  override async putNew():Promise<void>{this.copies++;throw Error('Copies forbidden in new flow');}
  override async read(key:string){this.reads++;await this.readHook?.();if(this.failRead)throw Error('R2 unavailable');return super.read(key);}
  override async signPart(){return 'https://private.invalid/part';}
}

test('single-object uploads: stage 1 local database prerequisite, simulated R2',{timeout:180000},async t=>{
  const local=localProfile();verifyDatabase(local);
  const directory=path.resolve('.local/snipers/integration-validation/single-object');fs.mkdirSync(directory,{recursive:true});
  const prior=JSON.parse(fs.readFileSync('.local/snipers/integration-validation/deletion-stage1/test-evidence.json','utf8'));
  assert.equal(prior.passed,true);assert.match(prior.database,/^snipers_deletion_[a-f0-9]{8}$/);
  const profile=readProfile(prior.profileFile),url=new URL(profile.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,`/${prior.database}`);
  npmBackup(prior.profileFile);
  Object.assign(process.env,isolatedEnv({...local,...profile}),{SNIPERS_PHASE3A_LOCAL:'1'});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const pool=new Pool({connectionString:profile.DATABASE_URL,max:8,connectionTimeoutMillis:5000,options:'-c statement_timeout=15000 -c lock_timeout=5000'});
  const admin=await testActor(pool,'SNIPERS_ADMIN'),outsider=await testActor(pool,'SNIPERS_CONTENT_EDITOR'),student=await testActor(pool);
  const apiFor=(storage:Storage,actor=admin)=>createUploadGateway(pool,async()=>({user:{id:actor.userId,activeSessionId:actor.activeSessionId}}),
    ()=>({enabled:'true',singleSession:'true',secret:'local-single-object-secret-with-at-least-32-characters'}),()=>storage,(who,id)=>advancePrivateUpload(pool,who,id,storage),true);
  const stage=async(payload=pdf(),type:PrivateFileType='PDF',expectedHash=sha(payload),classId?:string)=>{
    const storage=new Storage();storage.payload=payload;
    classId??=(await createClass(pool,admin,{operationId:op(),title:'Single object',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
    const api=apiFor(storage),command={operationId:op(),classId,name:`Single ${type}`,file:{type,mimeType:type==='PDF'?'application/pdf':type==='MP3'?'audio/mpeg':'audio/mp4',sizeBytes:payload.length},expectedSha256:expectedHash};
    const started=await api.start(command);
    return {...started,classId,api,storage,command,advance:()=>api.advance({uploadId:started.uploadId})};
  };
  type Fixture=Awaited<ReturnType<typeof stage>>;
  const row=async(f:{uploadId:string})=>(await pool.query(`SELECT u.*,r.status AS "resourceStatus",r."finalObjectId",r."attachedAt",j."errorCode",j.phase
    FROM "SnipersUpload" u JOIN "SnipersResource" r ON r.id=u."resourceId" JOIN "SnipersFileJob" j ON j."uploadId"=u.id AND j.kind='PROCESS_UPLOAD' WHERE u.id=$1`,[f.uploadId])).rows[0];
  const complete=async(f:Fixture)=>{
    await f.advance();const parts=(await f.storage.listParts()).map(({partNumber,etag})=>({partNumber,etag}));
    await f.api.complete({operationId:op(),uploadId:f.uploadId,parts});await f.advance();
    assert.equal((await row(f)).status,'PROCESSING');
  };
  const finish=async(f:Fixture)=>{await complete(f);await f.advance();assert.equal((await row(f)).status,'SUCCEEDED');};
  const cleanupJobs=async(resourceId:string)=>(await pool.query(`SELECT * FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind='CLEAN_OBJECT'`,[resourceId])).rows;
  try{
    for(const type of ['PDF','MP3','M4A'] as const)await t.test(`${type}: exactly one physical object, one producer and one validation GET; authorized delivery`,async()=>{
      const f=await stage(type==='PDF'?pdf():type==='MP3'?mp3():fs.readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a'),type);
      await finish(f);await f.advance();
      assert.equal(f.storage.creates,1);assert.equal(f.storage.completes,1);assert.equal(f.storage.copies,0);assert.equal(f.storage.reads,1);assert.equal(f.storage.objects.size,1);
      const objects=(await pool.query('SELECT * FROM "SnipersStorageObject" WHERE "resourceId"=$1',[f.resourceId])).rows;
      assert.equal(objects.length,1);assert.equal(objects[0].kind,'FINAL');assert.equal(objects[0].retiredAt,null);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind<>'CLEAN_OBJECT'`,[f.resourceId])).rows[0].n,1);
      assert.equal(await claimUploadJob(pool,false,f.uploadId),null);
      let cl=await getEditorialClass(pool,admin,f.classId);
      await linkResource(pool,admin,{operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:cl.version,transition:'ATTACH'});
      cl=await getEditorialClass(pool,admin,f.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'PUBLISH'});
      assert.ok((await signResource(pool,admin,{resourceId:f.resourceId,mode:type==='PDF'?'DOWNLOAD':'PLAY'},()=>f.storage)).url);
      await assert.rejects(signResource(pool,student,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage),{code:'FORBIDDEN'});
      cl=await getEditorialClass(pool,admin,f.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'WITHDRAW'});
      assert.equal(f.storage.objects.size,1);await assert.rejects(signResource(pool,admin,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage),{code:'NOT_FOUND'});
      if(type==='PDF')await discardResource(pool,admin,{operationId:op(),resourceId:f.resourceId},()=>f.storage);
      else {cl=await getEditorialClass(pool,admin,f.classId);await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:cl.version,transition:'DELETE'},()=>f.storage);}
      assert.equal(f.storage.objects.size,0);
    });
    for(const [type,payload,code]of [['PDF',Buffer.from('invalid PDF'),'INVALID_PDF'],['MP3',Buffer.from('invalid MP3'),'INVALID_MP3'],['M4A',Buffer.from('invalid M4A'),'INVALID_M4A']] as const)
      await t.test(`${type}: invalid bytes cannot become available; cleanup persists`,async()=>{
        const f=await stage(payload,type);await complete(f);await f.advance();const u=await row(f);
        assert.equal(u.status,'FAILED');assert.equal(u.finalObjectId,null);assert.equal(u.errorCode,code);assert.equal(f.storage.copies,0);assert.equal((await cleanupJobs(f.resourceId)).length,1);
      });
    await t.test('integrity, declaration limits, ownership and strict input remain enforced',async()=>{
      const f=await stage(pdf(),'PDF','a'.repeat(64));await complete(f);await f.advance();assert.equal((await row(f)).errorCode,'SHA256_MISMATCH');
      await assert.rejects(apiFor(f.storage,outsider).advance({uploadId:f.uploadId}),{code:'NOT_FOUND'});
      for(const type of ['PDF','MP3','M4A'] as const){const max=type==='PDF'?26214400:262144000,mimeType=type==='PDF'?'application/pdf':type==='MP3'?'audio/mpeg':'audio/mp4';
        assert.equal(fileDeclaration.safeParse({type,mimeType,sizeBytes:max}).success,true);
        await assert.rejects(f.api.start({...f.command,operationId:op(),file:{type,mimeType,sizeBytes:max+1}}),{code:'VALIDATION'});
      }
      await assert.rejects(f.api.start({...f.command,operationId:op(),singleObject:false}),{code:'VALIDATION'});
    });
    for(const [type,payload]of [['MP3',mp3(262144000)],['PDF',pdf(26214400)]] as const)await t.test(`${type}: maximum admitted size uses one object`,async()=>{
      const f=await stage(payload,type);await finish(f);assert.equal(f.storage.objects.size,1);assert.equal(f.storage.reads,1);assert.equal(f.storage.copies,0);
    });
    await t.test('parallel advances do not duplicate writes; deletion during validation prevents activation',async()=>{
      const f=await stage(),results=await Promise.allSettled([f.advance(),f.advance()]);
      assert.ok(results.some(r=>r.status==='fulfilled'));
      for(const r of results)if(r.status==='rejected')assert.ok(['40001','40P01','55P03'].includes(r.reason.code));
      assert.equal(f.storage.creates,1);
      await f.api.complete({operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'part-1'}]});await f.advance();
      let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);
      f.storage.readHook=async()=>{enter();await gate;};const pending=f.advance();await entered;
      await discardResource(pool,admin,{operationId:op(),resourceId:f.resourceId});release();await pending;
      assert.equal((await row(f)).status,'CANCELLED');assert.equal((await row(f)).finalObjectId,null);assert.equal((await cleanupJobs(f.resourceId)).length,1);
    });
    await t.test('ambiguous completion/read failures fail closed and leave physical cleanup pending',async()=>{
      for(const phase of ['complete','read']){
        const f=await stage();await f.advance();await f.api.complete({operationId:op(),uploadId:f.uploadId,parts:[{partNumber:1,etag:'part-1'}]});
        if(phase==='complete')f.storage.lostComplete=true;else f.storage.failRead=true;
        await f.advance();if(phase==='read')await f.advance();
        assert.equal((await row(f)).status,'FAILED');assert.equal(f.storage.completes,1);assert.equal((await cleanupJobs(f.resourceId)).length,1);
        await f.advance();assert.equal(f.storage.completes,1);assert.equal(f.storage.copies,0);
      }
    });
    await t.test('abandoned completed upload expires and cleans without a browser or permanent worker',async()=>{
      const storage=new Storage();storage.payload=pdf();const classId=(await createClass(pool,admin,{operationId:op(),title:'Abandoned',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
      const resourceId=op(),uploadId=op(),operationId=op();
      await transaction(pool,async tx=>{
        await tx.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Abandoned','PDF','application/pdf',$3,clock_timestamp())`,[resourceId,classId,storage.payload.length]);
        await tx.query(`INSERT INTO "SnipersUpload" (id,"resourceId","creatorId","expectedSha256","singleObject","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,true,clock_timestamp()+interval '2 seconds',clock_timestamp())`,[uploadId,resourceId,admin.userId,sha(storage.payload)]);
        await tx.query(`INSERT INTO "SnipersFileJob" (id,"resourceId","uploadId",kind,"updatedAt") VALUES ($1,$2,$3,'PROCESS_UPLOAD',clock_timestamp())`,[op(),resourceId,uploadId]);
        const result={kind:'UPLOAD_START',operationId,resourceId,uploadId};
        await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[operationId,admin.userId,resourceId,JSON.stringify({formatVersion:2,commandHash:digest(result),result})]);
      });
      const api=apiFor(storage);await api.advance({uploadId});await api.complete({operationId:op(),uploadId,parts:[{partNumber:1,etag:'part-1'}]});await api.advance({uploadId});assert.equal(storage.objects.size,1);
      await new Promise(r=>setTimeout(r,2100));await processPendingDeletions(pool,()=>storage);
      assert.equal((await row({uploadId})).status,'EXPIRED');assert.equal((await cleanupJobs(resourceId)).length,1);
      await processPendingDeletions(pool,()=>storage,{resourceIds:[resourceId]});assert.equal(storage.objects.size,0);
    });
    await t.test('historical selected object still signs with its unchanged key',async()=>{
      const legacy=(await pool.query(`SELECT r.id,r."objectKey",u."singleObject" FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id WHERE r."classId"=$1`,[prior.legacyClassId])).rows[0];
      assert.equal(legacy.singleObject,false);const storage=new Storage();
      const result=await signResource(pool,prior.admin,{resourceId:legacy.id,mode:'DOWNLOAD'},()=>storage);
      assert.ok(result.url.includes(encodeURIComponent(legacy.objectKey)));
    });
    fs.writeFileSync(path.join(directory,'test-evidence.json'),JSON.stringify({passed:true,database:prior.database,profileFile:prior.profileFile,simulatedR2:true,productionMutated:false},null,2));
  }finally{await pool.end();}
});
