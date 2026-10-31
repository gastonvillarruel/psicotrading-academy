/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const {encode}=require('next-auth/jwt');
const {requireRunner,verifyDatabase,localPool}=require('../phase1/guard.ts');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');
const {verified,op}=require('./fixtures.ts');

test('3B-2D: acciones con NextAuth/JWE real, flag y autorización propia',async t=>{
  const p=requireRunner();verifyDatabase(p);const pool=localPool();
  const root={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  let cookie='',appPool,db;const load=Module._load;
  Module._load=function(request,...args){if(request==='server-only')return {};if(request==='next/headers')return {headers:async()=>new Map([['host','127.0.0.1:3100'],['x-forwarded-proto','http']]),cookies:async()=>({getAll:()=>cookie?[{name:'next-auth.session-token',value:cookie}]:[]})};return load.call(this,request,...args);};
  process.env.SNIPERS_ENABLED='true';
  try{
    const actions=require('../../src/app/actions/snipers-content.ts');({pool:appPool,db}=require('../../src/lib/db.ts'));
    const f=await verified(pool,root),uid=op(),sid=op();await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp())`,[uid,`phase3b2d-action-${uid}@local.invalid`,sid]);
    const command={operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:1,transition:'ATTACH'},delivery={resourceId:f.resourceId,mode:'DOWNLOAD'};
    const calls=[['linkSnipersResource',command],['signSnipersResource',delivery]];
    const deny=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);assert.ok(!JSON.stringify(r).includes('snipers/final/'));};
    await t.test('anónimo y flag deshabilitado',async()=>{for(const [name,input]of calls)deny(await actions[name](input),'SESSION');process.env.SNIPERS_ENABLED='false';for(const [name,input]of calls)deny(await actions[name](input),'DISABLED');process.env.SNIPERS_ENABLED='true';});
    cookie=await encode({token:{id:uid,activeSessionId:sid,role:'STUDENT',emailVerified:new Date().toISOString()},secret:p.NEXTAUTH_SECRET});
    await t.test('alumno sin cobertura y gestor sin edición',async()=>{for(const [name,input]of calls)deny(await actions[name](input),'FORBIDDEN');await changePermission(pool,root,uid,'SNIPERS_MEMBERSHIP_MANAGER',true);deny(await actions.linkSnipersResource(command),'FORBIDDEN');deny(await actions.signSnipersResource(delivery),'NOT_FOUND');});
    await t.test('editor vincula con recibo real; estado no publicado impide firma',async()=>{await changePermission(pool,root,uid,'SNIPERS_CONTENT_EDITOR',true);const r=await actions.linkSnipersResource(command);assert.equal(r.ok,true);assert.equal((await actions.linkSnipersResource(command)).data.replayed,true);deny(await actions.signSnipersResource(delivery),'NOT_FOUND');});
    await t.test('validación y sesión sustituida',async()=>{deny(await actions.signSnipersResource({...delivery,key:'injected'}),'VALIDATION');await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[uid,op()]);for(const [name,input]of calls)deny(await actions[name](input),'SESSION');});
  }finally{process.env.SNIPERS_ENABLED='false';Module._load=load;if(db)await db.$disconnect();if(appPool)await appPool.end();await pool.end();}
});
