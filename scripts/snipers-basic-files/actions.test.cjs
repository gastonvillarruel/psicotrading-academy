/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {readProfile,localUrl}=require('../phase0/local.ts');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');

test('upload actions: real NextAuth/JWE and SQL, isolated database and no R2 credentials',async()=>{
  verifyDatabase(localProfile());
  const file=process.env.SNIPERS_BASIC_ACTIONS_PROFILE;
  assert.ok(file&&path.resolve(file).startsWith(path.resolve('.local/snipers/basic-files')+path.sep));
  const p=readProfile(file),url=localUrl(p.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.username,'snipers_local');assert.match(url.pathname,/^\/snipers_basic_[a-f0-9]{8}$/);
  assert.equal(process.env.DATABASE_URL,p.DATABASE_URL);
  const pool=new Pool({connectionString:p.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  const actor={userId:randomUUID(),activeSessionId:randomUUID(),singleSession:true};
  const root={userId:process.env.SNIPERS_BASIC_ROOT,activeSessionId:null,singleSession:false};
  let cookie='',appPool,db;const original=Module._load;
  Module._load=function(request,...args){
    if(request==='server-only')return {};
    if(request==='next/headers')return {headers:async()=>new Map([['host','127.0.0.1:3100'],['x-forwarded-proto','http']]),cookies:async()=>({getAll:()=>cookie?[{name:'next-auth.session-token',value:cookie}]:[]})};
    return original.call(this,request,...args);
  };
  try {
    const actual=(await pool.query('SELECT current_database() AS db,current_user AS role')).rows[0];
    assert.equal(actual.db,url.pathname.slice(1));assert.equal(actual.role,'snipers_local');
    await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp())`,[actor.userId,`${actor.userId}@local.invalid`,actor.activeSessionId]);
    process.env.SNIPERS_ENABLED='true';
    const actions=require('../../src/app/actions/snipers-uploads.ts');({pool:appPool,db}=require('../../src/lib/db.ts'));
    const id=randomUUID(),fields={operationId:randomUUID(),classId:randomUUID(),name:'Local file',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:400},expectedSha256:'a'.repeat(64)};
    const calls=[['startSnipersUpload',fields],['getSnipersUpload',{uploadId:id}],['advanceSnipersUpload',{uploadId:id}],
      ['signSnipersUploadPart',{uploadId:id,partNumber:1}],['completeSnipersUpload',{operationId:randomUUID(),uploadId:id,parts:[{partNumber:1,etag:'part'}]}],['cancelSnipersUpload',{operationId:randomUUID(),uploadId:id}]];
    assert.deepEqual(Object.keys(actions).sort(),calls.map(([name])=>name).sort());
    const deny=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);assert.ok(!JSON.stringify(r).includes('snipers/final/'));};
    for(const [name,input]of calls)deny(await actions[name](input),'SESSION');
    process.env.SNIPERS_ENABLED='false';for(const [name,input]of calls)deny(await actions[name](input),'DISABLED');process.env.SNIPERS_ENABLED='true';
    cookie=await encode({token:{id:actor.userId,activeSessionId:actor.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret:process.env.NEXTAUTH_SECRET});
    for(const [name,input]of calls)deny(await actions[name](input),'FORBIDDEN');
    await changePermission(pool,root,actor.userId,'SNIPERS_CONTENT_EDITOR',true);
    deny(await actions.advanceSnipersUpload({uploadId:process.env.SNIPERS_BASIC_OTHER_UPLOAD}),'NOT_FOUND');
    deny(await actions.advanceSnipersUpload({uploadId:id,approved:true}),'VALIDATION');
    deny(await actions.startSnipersUpload(fields),'CONFIGURATION');
    await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[actor.userId,randomUUID()]);
    for(const [name,input]of calls)deny(await actions[name](input),'SESSION');
  }finally{
    process.env.SNIPERS_ENABLED='false';Module._load=original;
    if(db)await db.$disconnect();if(appPool)await appPool.end();await pool.end();
  }
});
