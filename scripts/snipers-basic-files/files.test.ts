// Focused local acceptance. Only fresh databases in the verified phase-0 instance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { localProfile, verifyDatabase } from '../phase1/guard';
import { readProfile, isolatedEnv, npmBackup, pgEnv, runPg, defaultBin } from '../phase0/local';
import { historicalMigrations, basicFilesMigration, launchPgEnv, privateDirectory, verifyMigrationHistory, type LaunchProfile } from '../snipers-launch/database';
import { assembleMigration, migrationName, sha256 } from '../snipers-launch/prepare';
import { initializeCatalog } from '../phase1/catalog';
import { transaction, changePermission, type Actor } from '../../src/lib/snipers/permissions';
import { createUploadGateway } from '../../src/lib/snipers/upload-gateway';
import { advancePrivateUpload, ADVANCE_BUDGET_MS } from '../../src/lib/snipers/basic-upload-processor';
import { checkBasicFormat } from '../../src/lib/snipers/basic-file-validation';
import { ValidationFailure } from '../../src/lib/snipers/file-validation';
import type { MultipartStorage, DeliveryStorage } from '../../src/lib/snipers/upload-storage';
import type { ValidationStorage } from '../../src/lib/snipers/file-validation';
import * as content from '../../src/lib/snipers/content';
import { requestResourceRetirement } from '../../src/lib/snipers/resource-retirement';
import { verified } from '../phase3b2d/fixtures';

const op = () => randomUUID();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const body = { type:'doc', content:[{type:'paragraph',content:[{type:'text',text:'Local private files'}]}] };
const m4a = () => fs.readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a');
function mp3(size = 384 * 4) {
  const tag = size % 384;
  assert.ok(!tag || tag >= 10);
  const b = Buffer.alloc(size);
  if (tag) { b.write('ID3',0); b[3]=4; b[8]=Math.floor((tag-10)/128); b[9]=(tag-10)%128; }
  for (let i=tag;i<size;i+=384) b.writeUInt32BE(0xfffb9400,i);
  return b;
}
function pdf(size = 400) {
  const header = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
  const xref = 'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\n';
  const offset = size - 150;
  const b = Buffer.alloc(size,32); b.write(header,0);
  b.write(`${xref}startxref\n${offset}\n%%EOF\n`,offset);
  return b;
}

class Storage implements MultipartStorage, ValidationStorage, DeliveryStorage {
  payload = pdf();
  objects = new Map<string,Buffer>(); ids = new Map<string,string>();
  creates=0; puts:string[]=[]; reads:string[]=[]; signatures:string[]=[];
  mimes = new Map<string,string>();
  readHook?: (key:string) => Promise<void>;
  putHook?: (key:string) => Promise<void>;
  ambiguous=false; corrupt=false;
  async create(key:string,mime:string,id:string) { this.creates++; this.ids.set(key,id); this.mimes.set(key,mime); return op(); }
  async listParts() {
    return Array.from({length:Math.ceil(this.payload.length/8388608)},(_,i)=>({partNumber:i+1,etag:`part-${i+1}`,sizeBytes:Math.min(8388608,this.payload.length-i*8388608)}));
  }
  async complete(key:string) { this.objects.set(key,this.payload); }
  async head(key:string) { const b=this.objects.get(key); return b?{sizeBytes:b.length,uploadId:this.ids.get(key)??null}:null; }
  async abort() {}
  async signPart() { return 'https://private.invalid/controlled-part'; }
  async read(key:string,signal:AbortSignal) {
    this.reads.push(key); if(this.readHook) await this.readHook(key); signal.throwIfAborted();
    const b=this.objects.get(key); if(!b) throw Error('not found');
    return Readable.from((async function*(){for(let i=0;i<b.length;i+=65536){signal.throwIfAborted();yield b.subarray(i,i+65536);}})());
  }
  async putNew(key:string,file:string,_size:number,mime:string,id:string,signal:AbortSignal) {
    assert.ok(!this.puts.includes(key),'A key must never be written twice'); this.puts.push(key);
    if(this.putHook) await this.putHook(key); signal.throwIfAborted();
    this.objects.set(key,this.corrupt?Buffer.from('corrupted'):await readFile(file)); this.ids.set(key,id);
    this.mimes.set(key,mime);
    if(this.ambiguous) throw Error('acknowledgement lost');
  }
  async inspectDelivery(key:string,mime:string,size:number,id:string) {
    assert.equal(this.mimes.get(key),mime);
    assert.equal(this.objects.get(key)?.length,size); assert.equal(this.ids.get(key),id);
  }
  async signRead(key:string,now:Date,end:Date) { assert.equal(end.getTime()-now.getTime(),120000); this.signatures.push(key); return `https://private.invalid/${key}`; }
}

test('basic private files: isolated SQL, request steps and server authorization', {timeout:240000}, async t => {
  const local=localProfile(); verifyDatabase(local);
  assert.equal(local.SNIPERS_ENABLED,'false');
  const directory=path.resolve('.local/snipers/basic-files'); privateDirectory(directory);
  const run=op().replaceAll('-','').slice(0,8), database=`snipers_basic_${run}`;
  Object.assign(process.env,isolatedEnv(local),{NEXTAUTH_SECRET:randomBytes(32).toString('hex'),SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_NETWORK_TRACE:path.join(directory,`network-${run}.jsonl`)});
  createRequire(path.resolve('package.json'))(path.resolve('scripts/phase3a/network-guard.cjs'));
  const bootstrapFile=path.resolve('.local/snipers/bootstrap.env'), bootstrap=readProfile(bootstrapFile);
  const identity=JSON.parse(runPg('psql',['-X','-At','-v','ON_ERROR_STOP=1'],pgEnv(bootstrap.DATABASE_URL),defaultBin,
    `SELECT json_build_object('db',current_database(),'role',current_user,'host',inet_server_addr(),'port',inet_server_port(),'data',current_setting('data_directory'));`));
  assert.deepEqual({db:identity.db,role:identity.role,host:identity.host,port:identity.port},{db:'postgres',role:'snipers_bootstrap',host:'127.0.0.1',port:55432});
  assert.equal(path.resolve(identity.data),path.resolve('.local/snipers/postgres'));
  npmBackup(bootstrapFile);
  runPg('psql',['-X','-v','ON_ERROR_STOP=1'],pgEnv(bootstrap.DATABASE_URL),defaultBin,`CREATE DATABASE ${database} OWNER snipers_local;`);
  const url=new URL(local.DATABASE_URL); url.pathname=`/${database}`;
  const profile:LaunchProfile={SNIPERS_ENABLED:'false',SNIPERS_LAUNCH_ENVIRONMENT:'local',SNIPERS_LAUNCH_DATABASE_URL:url.toString(),
    SNIPERS_EXPECT_HOST:'127.0.0.1',SNIPERS_EXPECT_PORT:'55432',SNIPERS_EXPECT_USER:'snipers_local',SNIPERS_EXPECT_DATABASE:database,PG_BIN:defaultBin};
  const file=path.join(directory,`${run}.profile`);
  fs.writeFileSync(file,`SNIPERS_ENVIRONMENT=local\nDATABASE_URL="${url}"\nPG_BIN="${defaultBin}"\n`,{flag:'wx',mode:0o600});
  const sql=(text:string)=>runPg('psql',['-X','-v','ON_ERROR_STOP=1'],launchPgEnv(profile),defaultBin,text);
  const backup=npmBackup(file);
  const base=fs.readFileSync('scripts/phase1/local-artifacts/init-local.sql','utf8').replace(/DO \$local_only\$[\s\S]*?END \$local_only\$;\n/,'');
  assert.ok(!base.includes('LOCAL DEVELOPMENT ONLY: destination rejected'));
  sql(base); sql(assembleMigration());
  const pool=new Pool({connectionString:url.toString(),max:8,connectionTimeoutMillis:5000,options:'-c statement_timeout=15000 -c lock_timeout=5000'});
  const actor:Actor={userId:op(),activeSessionId:op(),singleSession:true};
  const editor:Actor={userId:op(),activeSessionId:op(),singleSession:true};
  const student:Actor={userId:op(),activeSessionId:op(),singleSession:true};
  const outsider:Actor={userId:op(),activeSessionId:op(),singleSession:true};
  const durations:{name:string;ms:number}[]=[];
  const protectedFiles=['.env','.env.snipers.local','.vscode/settings.json',
    'prisma/migrations/20261031000000_snipers_launch/migration.sql','scripts/phase3b2b/worker.ts'];
  const hashes=Object.fromEntries(protectedFiles.map(f=>[f,sha256(fs.readFileSync(f))]));
  try {
    await initializeCatalog(pool);
    for(const who of [actor,editor,student,outsider]) await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp())`,[who.userId,`${who.userId}@local.invalid`,who.activeSessionId]);
    await pool.query(`INSERT INTO "UserPermission" (id,"userId",permission) VALUES ($1,$2,'SNIPERS_ADMIN')`,[op(),actor.userId]);
    for(const who of [editor,outsider]) await changePermission(pool,actor,who.userId,'SNIPERS_CONTENT_EDITOR',true);
    // Produce a genuine old-policy record before applying the correction; analyzer is explicitly simulated.
    const legacy=await verified(pool,actor);
    const old=(await pool.query('SELECT * FROM "SnipersUpload" WHERE id=$1',[legacy.uploadId])).rows[0];
    npmBackup(file);
    await pool.query(`CREATE TABLE _prisma_migrations (id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,
      migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0)`);
    for(const m of [...historicalMigrations(),{name:migrationName,checksum:sha256(assembleMigration())}]) await pool.query(
      'INSERT INTO _prisma_migrations (id,migration_name,checksum,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)',[op(),m.name,m.checksum]);
    const launchFile=path.join(directory,`${run}.launch-profile`);
    fs.writeFileSync(launchFile,Object.entries(profile).map(([k,v])=>`${k}="${v}"`).join('\n'),{flag:'wx',mode:0o600});
    npmBackup(file);
    for(let i=0;i<2;i++) {
      const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--config','scripts/snipers-launch/prisma.config.ts'],{
        env:{...isolatedEnv(local),NEXTAUTH_SECRET:randomBytes(32).toString('hex'),SNIPERS_LAUNCH_PROFILE:launchFile},encoding:'utf8',windowsHide:true,timeout:60000});
      fs.writeFileSync(path.join(directory,`migrate-${run}-${i}.log`),(result.stdout??'')+(result.stderr??''),{flag:'wx',mode:0o600});
      assert.equal(result.status,0,'See private migrate log');
    }
    const client=await pool.connect();try {await verifyMigrationHistory(client,true);}finally{client.release();}

    const gateway=(who=editor,storage=new Storage(),enabled='true')=>createUploadGateway(pool,
      async()=>({user:{id:who.userId,activeSessionId:who.activeSessionId}}),
      ()=>({enabled,singleSession:'true',secret:process.env.NEXTAUTH_SECRET}),()=>storage,
      (who,id)=>advancePrivateUpload(pool,who,id,storage));
    async function stage(payload=pdf(),type:'PDF'|'MP3'|'M4A'='PDF',expectedSha=sha(payload)) {
      const storage=new Storage();storage.payload=payload;const api=gateway(editor,storage);
      const classId=(await content.createClass(pool,editor,{operationId:op(),title:'Local file',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
      const command={operationId:op(),classId,name:'Private file',file:{type,mimeType:type==='PDF'?'application/pdf':type==='M4A'?'audio/mp4':'audio/mpeg',sizeBytes:payload.length},expectedSha256:expectedSha};
      const upload=await api.start(command);
      const advance=async()=>{const start=performance.now();const s=await api.advance({uploadId:upload.uploadId});durations.push({name:`${type}-${s.status}`,ms:performance.now()-start});return s;};
      return {...upload,storage,api,classId,command,advance};
    }
    type Fixture=Awaited<ReturnType<typeof stage>>;
    const query=async(f:Fixture)=>(await pool.query(`SELECT u.*,j.status AS "jobStatus",j.generation,j.phase,j."executionId",j."errorCode",r.status AS "resourceStatus",r."attachedAt",r."finalObjectId"
      FROM "SnipersUpload" u JOIN "SnipersResource" r ON r.id=u."resourceId" JOIN "SnipersFileJob" j ON j."uploadId"=u.id AND j.kind='PROCESS_UPLOAD' WHERE u.id=$1`,[f.uploadId])).rows[0];
    async function complete(f:Fixture) {
      await f.advance();
      const parts=(await f.storage.listParts()).map(({partNumber,etag})=>({partNumber,etag}));
      const command={operationId:op(),uploadId:f.uploadId,parts};
      await f.api.complete(command);await f.api.complete(command);
      await f.advance(); assert.equal((await query(f)).status,'PROCESSING');
    }
    async function finish(f:Fixture) {for(let i=0;i<3;i++)await f.advance();assert.equal((await query(f)).resourceStatus,'VERIFIED');}
    const denied=(p:Promise<unknown>,code:string)=>assert.rejects(p,e=>(e as {code?:string}).code===code);
    const version=async(id:string)=>(await content.getEditorialClass(pool,editor,id)).version;

    await t.test('migration preserves old policy, recognizes the corrective history and rejects corrupt history',async()=>{
      assert.deepEqual((await pool.query('SELECT * FROM "SnipersUpload" WHERE id=$1',[legacy.uploadId])).rows[0],old);
      const record=(await pool.query('SELECT * FROM _prisma_migrations WHERE migration_name=$1',[basicFilesMigration])).rows[0];assert.ok(record.finished_at);
      const tx=await pool.connect();try {
        await tx.query('BEGIN');await tx.query('UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2',['corrupt',basicFilesMigration]);
        await assert.rejects(verifyMigrationHistory(tx,true));await tx.query('ROLLBACK');
        await tx.query('BEGIN');await tx.query('DELETE FROM _prisma_migrations WHERE migration_name=$1',[migrationName]);
        await assert.rejects(verifyMigrationHistory(tx,false));await tx.query('ROLLBACK');
      }finally{tx.release();}
      await transaction(pool,tx=>tx.query('SELECT snipers_file_check_resource($1)',[legacy.resourceId]));
    });
    for(const type of ['PDF','MP3','M4A'] as const) await t.test(`${type}: private multipart, three resumable validation requests, attach, publish and delivery`,async()=>{
      const f=await stage(type==='PDF'?pdf():type==='M4A'?m4a():mp3(),type);assert.deepEqual(await f.api.start(f.command),{operationId:f.command.operationId,kind:'UPLOAD_START',resourceId:f.resourceId,uploadId:f.uploadId});
      await complete(f);await denied(content.linkResource(pool,editor,{operationId:op(),classId:f.classId,expectedVersion:1,resourceId:f.resourceId,transition:'ATTACH'}),'INVALID_STATE');
      await f.advance();const first=await query(f);assert.equal(first.phase,'PUT_FINAL');assert.equal(first.validationPolicyVersion,2);assert.equal(first.antivirusCheckedAt,null);assert.equal(first.signatureVersion,null);
      assert.equal(first.resourceStatus,'PENDING');assert.equal(first.executionId,null);
      await f.advance();const second=await query(f);assert.equal(second.phase,'VERIFY_FINAL');assert.equal(second.generation,first.generation);assert.equal(second.resourceStatus,'PENDING');
      await f.advance();const final=await query(f);assert.equal(final.generation,first.generation);assert.equal(final.resourceStatus,'VERIFIED');assert.equal(final.attachedAt,null);
      assert.equal(f.storage.puts.length,1);await f.advance();assert.equal(f.storage.puts.length,1);
      await content.linkResource(pool,editor,{operationId:op(),classId:f.classId,expectedVersion:await version(f.classId),resourceId:f.resourceId,transition:'ATTACH'});
      await content.transitionContent(pool,editor,{operationId:op(),entity:'CLASS',id:f.classId,expectedVersion:await version(f.classId),transition:'PUBLISH'});
      for(const mode of type!=='PDF'?['PLAY','DOWNLOAD']:['DOWNLOAD']) {
        await content.signResource(pool,actor,{resourceId:f.resourceId,mode},()=>f.storage);
        assert.deepEqual(f.storage.objects.get(f.storage.signatures.at(-1)!),f.storage.payload);
      }
      await denied(content.signResource(pool,student,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage),'FORBIDDEN');
      if(type==='M4A') {
        await denied(content.signResource(pool,student,{resourceId:f.resourceId,mode:'PLAY'},()=>f.storage),'FORBIDDEN');
        const plan=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code LIMIT 1')).rows[0].id, membership=op();
        await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,clock_timestamp())',[membership,student.userId,plan]);
        await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','Local M4A test',$4)`,[op(),membership,plan,actor.userId]);
        for(const mode of ['PLAY','DOWNLOAD'] as const) await content.signResource(pool,student,{resourceId:f.resourceId,mode},()=>f.storage);
        assert.equal((await content.getPublishedClass(pool,student,f.classId)).resources[0].type,'M4A');
        await pool.query(`UPDATE "SnipersMembership" SET status='SUSPENDED' WHERE id=$1`,[membership]);
        await denied(content.signResource(pool,student,{resourceId:f.resourceId,mode:'PLAY'},()=>f.storage),'FORBIDDEN');
        await denied(content.signResource(pool,student,{resourceId:f.resourceId,mode:'DOWNLOAD'},()=>f.storage),'FORBIDDEN');
      }
    });
    await t.test('M4A: corrupt content and unsupported codec fail permanently before final PUT',async()=>{
      for(const bytes of [Buffer.alloc(200),Buffer.from(m4a())]) {
        if(bytes[0]!==0)bytes[0]=0;
        const offset=bytes.indexOf('mp4a');if(offset>=0)bytes.write('alac',offset);
        const f=await stage(bytes,'M4A');await complete(f);await f.advance();
        const state=await query(f);assert.equal(state.resourceStatus,'REJECTED');assert.equal(state.jobStatus,'FAILED');assert.equal(f.storage.puts.length,0);
        assert.ok(['INVALID_M4A','UNSUPPORTED_M4A'].includes(state.errorCode));
      }
    });
    await t.test('M4A: declaration mismatch and size limits fail in contracts and SQL',async()=>{
      const f=await stage(m4a(),'M4A');
      for(const file of [{type:'M4A',mimeType:'audio/mpeg',sizeBytes:100},{type:'M4A',mimeType:'audio/mp4',sizeBytes:262144001},
        {type:'MP3',mimeType:'audio/mp4',sizeBytes:100}]) {
        await denied(f.api.start({...f.command,operationId:op(),file}),'VALIDATION');
        await assert.rejects(pool.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Invalid',$3,$4,$5,clock_timestamp())`,[op(),f.classId,file.type,file.mimeType,file.sizeBytes]),e=>(e as {code:string}).code==='23514');
      }
    });
    await t.test('M4A: permanent retirement preserves main availability and authorization guards',async()=>{
      const f=await stage(m4a(),'M4A');await complete(f);await finish(f);
      const link=async(transition:'ATTACH'|'DETACH')=>content.linkResource(pool,editor,{operationId:op(),classId:f.classId,
        expectedVersion:await version(f.classId),resourceId:f.resourceId,transition});
      await link('ATTACH');await content.transitionContent(pool,editor,{operationId:op(),entity:'CLASS',id:f.classId,
        expectedVersion:await version(f.classId),transition:'PUBLISH'});
      await content.signResource(pool,actor,{resourceId:f.resourceId,mode:'PLAY'},()=>f.storage);
      const cleanup=()=>{throw Error('Retention must prevent cleanup initialization');};
      await denied(requestResourceRetirement(pool,actor,{operationId:op(),resourceId:f.resourceId},cleanup),'INVALID_STATE');
      await link('DETACH');
      await denied(requestResourceRetirement(pool,editor,{operationId:op(),resourceId:f.resourceId},cleanup),'FORBIDDEN');
      const result=await requestResourceRetirement(pool,actor,{operationId:op(),resourceId:f.resourceId},cleanup);
      assert.equal(result.state,'PENDING');assert.equal(result.canContinue,false);
      const signatures=f.storage.signatures.length;
      for(const mode of ['PLAY','DOWNLOAD'] as const)await denied(content.signResource(pool,actor,{resourceId:f.resourceId,mode},()=>f.storage),'INVALID_STATE');
      await denied(link('ATTACH'),'INVALID_STATE');assert.equal(f.storage.signatures.length,signatures);
      assert.deepEqual((await content.getPublishedClass(pool,actor,f.classId)).resources,[]);
    });
    await t.test('server permission, ownership, feature flag, session and untrusted approval fields',async()=>{
      const f=await stage();
      await denied(gateway(student,f.storage).start(f.command),'FORBIDDEN');
      for(const api of [gateway(student,f.storage),gateway(outsider,f.storage),gateway(editor,f.storage,'false')]) await assert.rejects(api.advance({uploadId:f.uploadId}));
      await denied(f.api.advance({uploadId:f.uploadId,approved:true,validationPolicyVersion:2}),'VALIDATION');
      assert.equal(f.storage.creates,0);
      await denied(gateway({...editor,activeSessionId:op()},f.storage).advance({uploadId:f.uploadId}),'SESSION');
      await complete(f);await f.advance();
      await changePermission(pool,actor,editor.userId,'SNIPERS_CONTENT_EDITOR',false);
      await denied(f.advance(),'FORBIDDEN');assert.equal(f.storage.puts.length,0);
      await changePermission(pool,actor,editor.userId,'SNIPERS_CONTENT_EDITOR',true);
      await f.advance();await f.advance();assert.equal((await query(f)).resourceStatus,'VERIFIED');
    });
    for(const fault of ['hash','size','format'] as const) await t.test(`source ${fault} never becomes valid`,async()=>{
      const f=await stage(pdf(),'PDF',fault==='hash'?'a'.repeat(64):sha(pdf()));await complete(f);
      const key=(await pool.query('SELECT key FROM "SnipersStorageObject" WHERE id=(SELECT "temporaryObjectId" FROM "SnipersUpload" WHERE id=$1)',[f.uploadId])).rows[0].key;
      if(fault==='size')f.storage.objects.set(key,pdf().subarray(1));
      if(fault==='format') {const b=Buffer.alloc(pdf().length);f.storage.objects.set(key,b);
        // A declared hash for non-PDF bytes must still fail the server's format check.
        const other=await stage(b);await complete(other);await other.advance();assert.equal((await query(other)).errorCode,'INVALID_PDF');
      }
      await f.advance();assert.equal((await query(f)).resourceStatus,'REJECTED');assert.equal(f.storage.puts.length,0);
    });
    await t.test('concurrent advances do not share an execution or duplicate a write',async()=>{
      const f=await stage();await complete(f);await f.advance();
      let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
      f.storage.putHook=async()=>{entered();await gate;};
      const first=f.advance();await ready;await f.advance();assert.equal(f.storage.puts.length,1);release();await first;await f.advance();
      assert.equal((await query(f)).resourceStatus,'VERIFIED');assert.equal(f.storage.puts.length,1);
    });
    await t.test('lost PUT acknowledgement is verified in a later request, never rewritten',async()=>{
      const f=await stage();await complete(f);await f.advance();f.storage.ambiguous=true;await f.advance();await f.advance();
      assert.equal((await query(f)).resourceStatus,'VERIFIED');assert.equal(f.storage.puts.length,1);
    });
    await t.test('interrupted request resumes from R2 under a new generation',async()=>{
      const f=await stage();await complete(f);const abort=new AbortController();
      f.storage.readHook=async()=>{abort.abort();};
      await advancePrivateUpload(pool,editor,f.uploadId,f.storage,abort.signal);
      const before=await query(f);assert.equal(before.jobStatus,'WAIT_RETRY');assert.equal(before.resourceStatus,'PENDING');
      await transaction(pool,tx=>tx.query('UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "uploadId"=$1 AND kind=\'PROCESS_UPLOAD\'',[f.uploadId]));
      f.storage.readHook=undefined;await finish(f);assert.equal((await query(f)).generation,before.generation+1);
    });
    await t.test('transient source and final-read failures never activate; next generation can retry',async()=>{
      for(const phase of ['DOWNLOAD','VERIFY_FINAL']) {
        const f=await stage();await complete(f);
        if(phase==='VERIFY_FINAL'){await f.advance();await f.advance();}
        f.storage.readHook=async()=>{throw Error('temporary transport failure');};await f.advance();
        assert.equal((await query(f)).jobStatus,'WAIT_RETRY');assert.equal((await query(f)).finalObjectId,null);
        await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "availableAt"=clock_timestamp() WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
        f.storage.readHook=undefined;await finish(f);
      }
    });
    await t.test('a process lost with an active execution is reclaimed only after its lease expires',async()=>{
      const f=await stage();await complete(f);await f.advance();const before=await query(f);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "executionId"=$2,"executionDeadlineAt"=clock_timestamp()+interval '45 seconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId,op()]));
      await f.advance();assert.equal(f.storage.puts.length,0);
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '10 milliseconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
      await new Promise(r=>setTimeout(r,25));await finish(f);assert.equal((await query(f)).generation,before.generation+1);
    });
    await t.test('expired lease abandons its destination; late old bytes cannot activate',async()=>{
      const f=await stage();await complete(f);await f.advance();await f.advance();const oldState=await query(f),oldKey=f.storage.puts[0];
      await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '20 milliseconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
      await new Promise(r=>setTimeout(r,40));await finish(f);
      const current=await query(f);assert.equal(current.generation,oldState.generation+1);assert.equal(f.storage.puts.length,2);assert.notEqual(f.storage.puts[1],oldKey);
      const abandoned=(await pool.query('SELECT "retiredAt","activatedAt" FROM "SnipersStorageObject" WHERE key=$1',[oldKey])).rows[0];assert.ok(abandoned.retiredAt);assert.equal(abandoned.activatedAt,null);
    });
    await t.test('cancellation during PUT fences late results',async()=>{
      const f=await stage();await complete(f);await f.advance();
      f.storage.putHook=async()=>{await f.api.cancel({operationId:op(),uploadId:f.uploadId});};await f.advance();
      assert.equal((await query(f)).status,'CANCELLED');assert.equal((await query(f)).finalObjectId,null);
    });
    await t.test('corrupt definitive bytes cannot activate',async()=>{
      const f=await stage();await complete(f);await f.advance();f.storage.corrupt=true;await f.advance();await f.advance();
      assert.equal((await query(f)).resourceStatus,'REJECTED');assert.equal((await query(f)).finalObjectId,null);
    });
    await t.test('SQL rejects premature VERIFIED, unknown policy and fake antivirus evidence',async()=>{
      const f=await stage();await complete(f);await f.advance();
      const rejects=async(statement:string)=>assert.rejects(transaction(pool,async tx=>{await tx.query(statement,[f.uploadId]);await tx.query('SET CONSTRAINTS ALL IMMEDIATE');}),e=>(e as {code?:string}).code==='23514');
      await rejects(`UPDATE "SnipersResource" SET status='VERIFIED' WHERE id=(SELECT "resourceId" FROM "SnipersUpload" WHERE id=$1)`);
      for(const update of ['"validationPolicyVersion"=3','"antivirusCheckedAt"=clock_timestamp()','"validationPolicyVersion"=1','"formatCheckedAt"=NULL']) {
        // The last barrier must reject a fully assembled result with missing/incorrect proof.
        const db={connect:async()=>{const tx=await pool.connect();return {query:async(text:string,args?:unknown[])=>{
          if(text.includes(`UPDATE "SnipersUpload" SET status='SUCCEEDED'`)) await tx.query(`UPDATE "SnipersUpload" SET ${update} WHERE id=$1`,[f.uploadId]);
          return tx.query(text,args);
        },release:()=>tx.release()};}} as unknown as Pool;
        if((await query(f)).phase==='PUT_FINAL')await f.advance();
        await assert.rejects(advancePrivateUpload(db,editor,f.uploadId,f.storage),e=>(e as {code?:string}).code==='23514');
        // The failed activation rolls back; recover the held execution by expiring its lease.
        await transaction(pool,tx=>tx.query(`UPDATE "SnipersFileJob" SET "leaseUntil"=clock_timestamp()+interval '5 milliseconds' WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]));
        await new Promise(r=>setTimeout(r,15));await f.advance();await f.advance();
      }
      await f.advance();assert.equal((await query(f)).resourceStatus,'VERIFIED');
    });
    for(const type of ['MP3','PDF'] as const) await t.test(`${type} maximum size completes in bounded local requests`,async()=>{
      const f=await stage(type==='MP3'?mp3(262144000):pdf(26214400),type);await complete(f);await finish(f);
      assert.ok(durations.every(d=>d.ms<ADVANCE_BUDGET_MS));
    });
    await t.test('recognizable structure: ID3, truncation and invalid PDF pointers',async()=>{
      const dir=await mkdtemp(path.join(os.tmpdir(),'snipers-format-test-'));
      try {
        for(const [type,bytes,valid] of [
          ['MP3',mp3(),true],['MP3',mp3(384*4+128),true],['MP3',mp3().subarray(0,-1),false],
          ['MP3',Buffer.from('ID3'),false],['MP3',Buffer.concat([mp3(),Buffer.alloc(128)]),false],
          ['PDF',pdf(),true],['PDF',pdf().subarray(0,100),false],['PDF',Buffer.from('%PDF-1.7\nstartxref\n99999\n%%EOF'),false],
        ] as const) {
          const file=path.join(dir,op());await writeFile(file,bytes);
          const result=checkBasicFormat(file,type,new AbortController().signal);
          if(valid)await result;else await assert.rejects(result,e=>e instanceof ValidationFailure);
        }
      }finally{await rm(dir,{recursive:true,force:true});}
    });
    await t.test('real public actions reject unauthenticated/unauthorized requests',()=>{
      npmBackup(file);
      const env:NodeJS.ProcessEnv={...isolatedEnv(local),DATABASE_URL:url.toString(),NEXTAUTH_SECRET:randomBytes(32).toString('hex'),ENABLE_SINGLE_SESSION:'true',
          SNIPERS_BASIC_ACTIONS_PROFILE:file,SNIPERS_BASIC_ROOT:actor.userId,SNIPERS_BASIC_OTHER_UPLOAD:legacy.uploadId,
          SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_NETWORK_TRACE:path.join(directory,`actions-network-${run}.jsonl`),
          NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
      // A nested Node test runner otherwise exits successfully without executing tests.
      delete env.NODE_TEST_CONTEXT;
      const result=spawnSync(process.execPath,['--import','tsx','--test','scripts/snipers-basic-files/actions.test.cjs'],{
        env,encoding:'utf8',windowsHide:true,timeout:60000});
      fs.writeFileSync(path.join(directory,`actions-${run}.log`),(result.stdout??'')+(result.stderr??''),{flag:'wx',mode:0o600});
      assert.equal(result.status,0,'See private actions log');
      assert.match(result.stdout,/ok 1 - upload actions:/);
    });
    for(const f of protectedFiles)assert.equal(sha256(fs.readFileSync(f)),hashes[f],`Protected file changed: ${f}`);
    fs.writeFileSync(path.join(directory,`evidence-${run}.json`),JSON.stringify({database,backup,durations,persistentFlag:local.SNIPERS_ENABLED,realR2Validated:false,hostingLimitsValidated:false,protectedFilesUnchanged:true},null,2),{flag:'wx',mode:0o600});
  } finally { await pool.end(); }
});
