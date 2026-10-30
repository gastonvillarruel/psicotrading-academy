/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const Module=require('node:module');const {randomUUID}=require('node:crypto');
const {encode}=require('next-auth/jwt');
const {requireRunner,verifyDatabase,localPool}=require('../phase1/guard.ts');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');
test('3B-1: acciones HTTP de servidor con NextAuth/JWE y PostgreSQL reales',{timeout:120000},async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B1_LOCAL,'1');const p=requireRunner();verifyDatabase(p);const local=localPool();
  const root={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  let cookie='';const load=Module._load;Module._load=function(request,...args){if(request==='server-only')return {};if(request==='next/headers')return {headers:async()=>new Map([['host','127.0.0.1:3100'],['x-forwarded-proto','http']]),cookies:async()=>({getAll:()=>cookie?[{name:'next-auth.session-token',value:cookie}]:[]})};return load.call(this,request,...args);};
  process.env.SNIPERS_ENABLED='true';let appPool,db;
  try{
    const actions=require('../../src/app/actions/snipers-content.ts');({pool:appPool,db}=require('../../src/lib/db.ts'));
    const {snipers}=require('../../src/lib/snipers/server.ts');
    async function user(role='STUDENT',permission){const u={userId:randomUUID(),activeSessionId:randomUUID(),role};await local.query('INSERT INTO "User" (id,email,name,role,"activeSessionId","emailVerified","updatedAt") VALUES ($1,$2,\'Fixture acciones 3B\',$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[u.userId,`phase3b1-actions-${u.userId}@local.invalid`,role,u.activeSessionId]);if(permission)await changePermission(local,root,u.userId,permission,true);return u;}
    const editor=await user('STUDENT','SNIPERS_CONTENT_EDITOR');const manager=await user('STUDENT','SNIPERS_MEMBERSHIP_MANAGER');const student=await user();const admin=await user('ADMIN');const supervisor=await user('STUDENT','SNIPERS_ADMIN');
    async function session(who,secret=process.env.NEXTAUTH_SECRET,maxAge){cookie=who?await encode({token:{id:who.userId,activeSessionId:who.activeSessionId,role:who.role,emailVerified:new Date().toISOString()},secret,...(maxAge?{maxAge}:{})}):'';}
    async function as(who,name,input){await session(who);return actions[name](input);}
    const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.data;};const deny=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);};
    const body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Clase acciones'}]}]};
    const classFields={title:'Clase acciones',body,classDate:new Date().toISOString(),categoryId:null};
    const created=ok(await as(editor,'createSnipersClass',{operationId:randomUUID(),...classFields})).result;
    const cat=ok(await as(editor,'createSnipersCategory',{operationId:randomUUID(),name:'Acciones',slug:`acciones-${randomUUID()}`})).result;
    const meetingFields={title:'Encuentro acciones',startsAt:'2026-11-03T15:00:00.000Z',endsAt:'2026-11-03T16:00:00.000Z',privateJoinUrl:'https://mentor.zoom.us/j/123?pwd=private-actions'};
    const meet=ok(await as(editor,'createSnipersMeeting',{operationId:randomUUID(),...meetingFields})).result;
    const calls=[['createSnipersClass',{operationId:randomUUID(),...classFields}],['saveSnipersClass',{operationId:randomUUID(),id:created.id,expectedVersion:1,...classFields}],['transitionSnipersContent',{operationId:randomUUID(),entity:'CLASS',id:created.id,expectedVersion:1,transition:'PUBLISH'}],['createSnipersCategory',{operationId:randomUUID(),name:'Nueva',slug:`acciones-${randomUUID()}`}],['saveSnipersCategory',{operationId:randomUUID(),id:cat.id,expectedVersion:1,name:'Editada'}],['createSnipersMeeting',{operationId:randomUUID(),...meetingFields}],['saveSnipersMeeting',{operationId:randomUUID(),id:meet.id,expectedVersion:1,...meetingFields}],['getSnipersEditorialClass',created.id],['getSnipersEditorialOperation',randomUUID()]];
    await t.test('matriz contempla cada export público nuevo',()=>assert.deepEqual(Object.keys(actions).sort(),calls.map(c=>c[0]).sort()));
    for(const [label,who] of [['anónimo',null],['alumno',student],['gestor',manager],['ADMIN global',admin]])await t.test(`${label}: las nueve acciones verifican permiso propio`,async()=>{for(const [name,input] of calls)deny(await as(who,name,input),who?'FORBIDDEN':'SESSION');});
    await t.test('editor y supervisor mantienen separación de permisos',async()=>{for(const who of [editor,supervisor])ok(await as(who,'getSnipersEditorialClass',created.id));await session(editor);await assert.rejects(snipers.getCatalog(),e=>e.code==='FORBIDDEN');});
    await t.test('guardar, publicar y recuperar recibo real sin reaplicar retiro',async()=>{
      const command={operationId:randomUUID(),id:created.id,expectedVersion:1,...classFields,title:'Clase actualizada'};
      ok(await as(editor,'saveSnipersClass',command));ok(await as(editor,'transitionSnipersContent',{operationId:randomUUID(),entity:'CLASS',id:created.id,expectedVersion:2,transition:'PUBLISH'}));
      ok(await as(editor,'transitionSnipersContent',{operationId:randomUUID(),entity:'CLASS',id:created.id,expectedVersion:3,transition:'WITHDRAW'}));
      assert.equal(ok(await as(editor,'saveSnipersClass',command)).replayed,true);assert.equal(ok(await as(editor,'getSnipersEditorialClass',created.id)).status,'DRAFT');ok(await as(editor,'getSnipersEditorialOperation',command.operationId));
    });
    await t.test('slug duplicado atraviesa la acción como rechazo corregible y exige otro UUID en el siguiente envío',async()=>{
      const fields={operationId:randomUUID(),name:'Identificador repetido',slug:`action-slug-${randomUUID()}`};
      ok(await as(editor,'createSnipersCategory',fields));
      const rejected={...fields,operationId:randomUUID()};
      deny(await as(editor,'createSnipersCategory',rejected),'DUPLICATE_SLUG');
      assert.equal(ok(await as(editor,'getSnipersEditorialOperation',rejected.operationId)),null);
      ok(await as(editor,'createSnipersCategory',{...rejected,operationId:randomUUID(),slug:`corrected-action-${randomUUID()}`}));
      deny(await as(editor,'createSnipersCategory',{...fields,slug:`different-action-${randomUUID()}` }),'IDEMPOTENCY_CONFLICT');
    });
    await t.test('contenido malicioso y campos editoriales inyectados se rechazan',async()=>{deny(await as(editor,'createSnipersClass',{operationId:randomUUID(),...classFields,body:{type:'doc',content:[{type:'iframe'}]}}),'VALIDATION');deny(await as(editor,'saveSnipersClass',{operationId:randomUUID(),id:created.id,expectedVersion:4,...classFields,status:'PUBLISHED'}),'VALIDATION');});
    await t.test('ruta Zoom: reautoriza, redirige sin caché y no navega al servicio externo',async()=>{
      ok(await as(editor,'transitionSnipersContent',{operationId:randomUUID(),entity:'MEETING',id:meet.id,expectedVersion:1,transition:'PUBLISH'}));
      const {GET}=require('../../src/app/mi-campus/snipers/agenda/[id]/acceso/route.ts');await session(manager);
      const r=await GET(new Request('http://127.0.0.1:3100/test'),{params:Promise.resolve({id:meet.id})});assert.equal(r.status,303);assert.equal(r.headers.get('location'),meetingFields.privateJoinUrl);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
      await session(student);assert.equal((await GET(new Request('http://127.0.0.1:3100/test'),{params:Promise.resolve({id:meet.id})})).status,403);
      await as(editor,'transitionSnipersContent',{operationId:randomUUID(),entity:'MEETING',id:meet.id,expectedVersion:2,transition:'WITHDRAW'});await session(manager);assert.equal((await GET(new Request('http://127.0.0.1:3100/test'),{params:Promise.resolve({id:meet.id})})).status,404);
    });
    await t.test('JWT expirado, clave equivocada y sesión sustituida deniegan',async()=>{
      await session(editor,process.env.NEXTAUTH_SECRET,-3600);deny(await actions.getSnipersEditorialClass(created.id),'SESSION');
      await session(editor,'wrong-secret-'.repeat(4));deny(await actions.getSnipersEditorialClass(created.id),'SESSION');
      await local.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[editor.userId,randomUUID()]);deny(await as(editor,'getSnipersEditorialClass',created.id),'SESSION');
    });
    await t.test('módulo deshabilitado rechaza todas las acciones antes de leer datos',async()=>{process.env.SNIPERS_ENABLED='false';for(const [name,input] of calls)deny(await as(supervisor,name,input),'DISABLED');});
    await changePermission(local,root,supervisor.userId,'SNIPERS_ADMIN',false);
  }finally{process.env.SNIPERS_ENABLED='false';Module._load=load;if(db)await db.$disconnect();if(appPool)await appPool.end();await local.end();}
});
