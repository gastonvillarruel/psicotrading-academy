/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {randomBytes}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {isolatedEnv,npmBackup,profilePath}=require('../phase0/local.ts');
const {testActor,op,fresh,retire}=require('./fixtures.ts');

test('storage public actions: NextAuth/JWE, direct admin authorization and fail-closed configuration',async()=>{
  const p=localProfile();verifyDatabase(p);npmBackup(profilePath);
  Object.assign(process.env,isolatedEnv(p),{NEXTAUTH_SECRET:randomBytes(32).toString('hex'),ENABLE_SINGLE_SESSION:'true',SNIPERS_PHASE3A_LOCAL:'1'});
  require('../phase3a/network-guard.cjs');
  const pool=new Pool({connectionString:p.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  let cookie='',appPool,db;const original=Module._load;
  Module._load=function(request,...args){
    if(request==='server-only')return {};
    if(request==='next/headers')return {headers:async()=>new Map([['host','127.0.0.1:3100'],['x-forwarded-proto','http']]),cookies:async()=>({getAll:()=>cookie?[{name:'next-auth.session-token',value:cookie}]:[]})};
    return original.call(this,request,...args);
  };
  try{
    process.env.SNIPERS_ENABLED='true';
    const actions=require('../../src/app/actions/snipers-storage.ts');({pool:appPool,db}=require('../../src/lib/db.ts'));
    const calls=[['getSnipersStorageObjects',{resourceId:op()}],['cleanSnipersStorageObject',{operationId:op(),objectId:op()}],
      ['getSnipersResourceRetirement',{resourceId:op()}],['requestSnipersResourceRetirement',{operationId:op(),resourceId:op()}]];
    assert.deepEqual(Object.keys(actions).sort(),calls.map(([name])=>name).sort());
    const deny=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);assert.doesNotMatch(JSON.stringify(r),/snipers\/final|X-Amz|leaseToken/);};
    for(const [name,input]of calls)deny(await actions[name](input),'SESSION');
    process.env.SNIPERS_ENABLED='false';for(const [name,input]of calls)deny(await actions[name](input),'DISABLED');process.env.SNIPERS_ENABLED='true';
    for(const permission of [undefined,'SNIPERS_CONTENT_EDITOR','SNIPERS_MEMBERSHIP_MANAGER']){
      const who=await testActor(pool,permission);
      cookie=await encode({token:{id:who.userId,activeSessionId:who.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret:process.env.NEXTAUTH_SECRET});
      for(const [name,input]of calls)deny(await actions[name](input),'FORBIDDEN');
    }
    const admin=await testActor(pool,'SNIPERS_ADMIN');
    cookie=await encode({token:{id:admin.userId,activeSessionId:admin.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret:process.env.NEXTAUTH_SECRET});
    deny(await actions.getSnipersStorageObjects({resourceId:op()}),'NOT_FOUND');
    deny(await actions.cleanSnipersStorageObject({operationId:op(),objectId:op(),key:'not-accepted'}),'VALIDATION');
    const retained=await fresh(pool,admin);await retire(pool,retained,false);
    const invalid=await actions.cleanSnipersStorageObject({operationId:op(),objectId:retained.objects[0].id});
    deny(invalid,'INVALID_STATE');assert.match(invalid.message,/no es elegible para limpieza/);assert.doesNotMatch(invalid.message,/plan|membres/);
    await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[admin.userId,op()]);
    for(const [name,input]of calls)deny(await actions[name](input),'SESSION');
  }finally{
    Module._load=original;if(db)await db.$disconnect();if(appPool)await appPool.end();await pool.end();
  }
});
