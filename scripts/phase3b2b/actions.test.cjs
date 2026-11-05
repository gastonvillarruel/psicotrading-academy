/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const {randomUUID}=require('node:crypto');const {encode}=require('next-auth/jwt');
const {localPool,requireRunner,verifyDatabase}=require('../phase1/guard.ts');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');
test('3B-2B: acciones con NextAuth/JWE y SQL reales; sin R2 configurado',async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B2B_LOCAL,'1');const profile=requireRunner();verifyDatabase(profile);const pool=localPool();
  const root={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  let cookie='';const load=Module._load;
  Module._load=function(request,...args){if(request==='server-only')return {};if(request==='next/headers')return {headers:async()=>new Map([['host','127.0.0.1:3100'],['x-forwarded-proto','http']]),cookies:async()=>({getAll:()=>cookie?[{name:'next-auth.session-token',value:cookie}]:[]})};return load.call(this,request,...args);};
  let appPool,db;process.env.SNIPERS_ENABLED='true';
  try{
    const actions=require('../../src/app/actions/snipers-uploads.ts');({pool:appPool,db}=require('../../src/lib/db.ts'));
    const uid=randomUUID(),sid=randomUUID();await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp())`,[uid,`phase3b2b-actions-${uid}@local.invalid`,sid]);
    const fields={operationId:randomUUID(),classId:randomUUID(),name:'prueba',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:10},expectedSha256:'a'.repeat(64)};
    const calls=[['startSnipersUpload',fields],['getSnipersUpload',{uploadId:randomUUID()}],['advanceSnipersUpload',{uploadId:randomUUID()}],['signSnipersUploadPart',{uploadId:randomUUID(),partNumber:1}],['completeSnipersUpload',{operationId:randomUUID(),uploadId:randomUUID(),parts:[{partNumber:1,etag:'part'}]}],['cancelSnipersUpload',{operationId:randomUUID(),uploadId:randomUUID()}]];
    const deny=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);};
    await t.test('cada export rechaza anónimo y flag deshabilitado',async()=>{
      assert.deepEqual(Object.keys(actions).sort(),calls.map(([name])=>name).sort());
      for(const [name,input]of calls)deny(await actions[name](input),'SESSION');
      process.env.SNIPERS_ENABLED='false';for(const [name,input]of calls)deny(await actions[name](input),'DISABLED');process.env.SNIPERS_ENABLED='true';
    });
    cookie=await encode({token:{id:uid,activeSessionId:sid,role:'STUDENT',emailVerified:new Date().toISOString()},secret:process.env.NEXTAUTH_SECRET});
    await t.test('sin permiso editorial rechaza todos los exports antes de consultar R2',async()=>{for(const [name,input]of calls)deny(await actions[name](input),'FORBIDDEN');});
    await changePermission(pool,root,uid,'SNIPERS_CONTENT_EDITOR',true);
    await t.test('R2 ausente da mensaje corregible sin reservar filas ni revelar configuración',async()=>{
      const before=(await pool.query('SELECT count(*)::int n FROM "SnipersUpload"')).rows[0].n;
      const r=await actions.startSnipersUpload(fields);deny(r,'CONFIGURATION');assert.match(r.message,/R2 de prueba/);
      assert.equal((await pool.query('SELECT count(*)::int n FROM "SnipersUpload"')).rows[0].n,before);
    });
    await t.test('sesión reemplazada invalida las acciones',async()=>{await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[uid,randomUUID()]);for(const [name,input]of calls)deny(await actions[name](input),'SESSION');});
  }finally{process.env.SNIPERS_ENABLED='false';Module._load=load;if(db)await db.$disconnect();if(appPool)await appPool.end();await pool.end();}
});
