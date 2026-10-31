import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {requireRunner,verifyDatabase,localPool} from '../phase1/guard';
import {changePermission,type Actor} from '../../src/lib/snipers/permissions';
import * as api from '../../src/lib/snipers/content';
import {editorialAuditSchema,resourceLinkSchema,resourceDeliverySchema} from '../../src/lib/snipers/content-contracts';
import {op,verified,body} from './fixtures';
import {startUpload,cancelUpload} from '../../src/lib/snipers/uploads';
import {changeMembershipStatus} from '../../src/lib/snipers/operations';

test('3B-2D: vinculación, consumo y carreras con PostgreSQL real',{timeout:240000},async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B2D_LOCAL,'1');verifyDatabase(requireRunner());const pool=localPool();
  const root:Actor={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  const denied=(p:Promise<unknown>,code:string)=>assert.rejects(p,e=>(e as {code:string}).code===code);
  const version=async(classId:string)=>(await api.getEditorialClass(pool,root,classId)).version;
  const link=async(f:Awaited<ReturnType<typeof verified>>,transition='ATTACH',actor=root)=>api.linkResource(pool,actor,{operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:await version(f.classId),transition});
  const transition=async(classId:string,value:string)=>api.transitionContent(pool,root,{operationId:op(),id:classId,expectedVersion:await version(classId),entity:'CLASS',transition:value});
  const sign=(f:Awaited<ReturnType<typeof verified>>,actor=root,mode='DOWNLOAD',db=pool)=>api.signResource(db,actor,{resourceId:f.resourceId,mode},()=>f.storage);
  async function user(permission?:'SNIPERS_CONTENT_EDITOR'|'SNIPERS_MEMBERSHIP_MANAGER',role='STUDENT'){
    const actor:Actor={userId:op(),activeSessionId:op(),singleSession:true};
    await pool.query('INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())',[actor.userId,`phase3b2d-${actor.userId}@local.invalid`,role,actor.activeSessionId]);
    if(permission)await changePermission(pool,root,actor.userId,permission,true);return actor;
  }
  function gated(predicate:(sql:string)=>boolean,tag=op()){
    let ready!:()=>void,release!:()=>void,paused=false;
    const waiting=new Promise<void>(r=>{ready=r;}),gate=new Promise<void>(r=>{release=r;});const errors:string[]=[];
    const db={connect:async()=>{const tx=await pool.connect();await tx.query("SELECT set_config('application_name',$1,false)",[tag]);return {query:async(sql:string,args?:unknown[])=>{try{const result=await tx.query(sql,args);if(!paused&&predicate(sql)){paused=true;ready();await gate;}return result;}catch(error){errors.push((error as {code:string}).code);throw error;}},release:()=>tx.release()};}} as unknown as Pool;
    return {db,waiting,release:()=>release(),tag,errors};
  }
  async function waitLock(tag:string){for(let i=0;i<150;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[tag])).rowCount)return;await delay(10);}assert.fail('No se observó espera real de bloqueo');}
  try{
    await t.test('contratos estrictos y compatibilidad histórica de auditoría',()=>{
      const v={operationId:op(),classId:op(),expectedVersion:1,resourceId:op(),transition:'ATTACH'};
      assert.ok(resourceLinkSchema.safeParse(v).success);assert.equal(resourceLinkSchema.safeParse({...v,objectKey:'private'}).success,false);
      assert.equal(resourceDeliverySchema.safeParse({resourceId:op(),mode:'PLAY',userId:root.userId}).success,false);
      const p={formatVersion:1,kind:'CLASS_PUBLISH',commandHash:'a'.repeat(64),result:{operationId:op(),id:op(),entity:'CLASS',version:2,changed:true},before:{version:1},after:{version:2},changedFields:['status']};
      assert.ok(editorialAuditSchema.safeParse(p).success);assert.equal(editorialAuditSchema.safeParse({...p,url:'secret'}).success,false);
    });
    const f=await verified(pool,root);
    await t.test('validar no vincula/publica; vínculo explícito auditable e idempotente',async()=>{
      assert.equal((await api.getEditorialClass(pool,root,f.classId)).resources[0].attachedAt,null);
      await denied(sign(f),'NOT_FOUND');
      const command={operationId:op(),classId:f.classId,resourceId:f.resourceId,expectedVersion:await version(f.classId),transition:'ATTACH'};
      const results=await Promise.all([api.linkResource(pool,root,command),api.linkResource(pool,root,command)]);
      assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(await version(f.classId),2);
      await denied(api.linkResource(pool,root,{...command,transition:'DETACH'}),'IDEMPOTENCY_CONFLICT');
      const auditor=(await pool.query('SELECT payload FROM "SnipersAuditEvent" WHERE id=$1',[command.operationId])).rows[0].payload;
      assert.ok(editorialAuditSchema.safeParse(auditor).success);assert.equal(auditor.formatVersion,2);assert.equal(auditor.resource.resourceId,f.resourceId);assert.ok(auditor.resource.afterAttachedAt);
      const noChange=await link(f);assert.equal(noChange.result.changed,false);assert.equal(await version(f.classId),2);
      await denied(sign(f),'NOT_FOUND');await transition(f.classId,'PUBLISH');
      assert.deepEqual((await api.getPublishedClass(pool,root,f.classId)).resources,[{id:f.resourceId,name:'Archivo PDF',type:'PDF'}]);
      await sign(f);assert.equal(f.storage.signed.length,1);assert.equal(f.storage.signed[0],(await pool.query('SELECT "objectKey" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0].objectKey);
      await denied(sign(f,root,'PLAY'),'VALIDATION');
      await link(f,'DETACH');await denied(sign(f),'NOT_FOUND');
      assert.equal((await api.getPublishedClass(pool,root,f.classId)).resources.length,0);
      const replay=await api.linkResource(pool,root,command);assert.equal(replay.replayed,true);await denied(sign(f),'NOT_FOUND');
    });
    await t.test('permisos editoriales separados, pertenencia, pendientes y archivados',async()=>{
      const editor=await user('SNIPERS_CONTENT_EDITOR'),manager=await user('SNIPERS_MEMBERSHIP_MANAGER'),student=await user(),admin=await user(undefined,'ADMIN');
      for(const actor of [manager,student,admin])await denied(link(f,'ATTACH',actor),'FORBIDDEN');
      const other=(await api.createClass(pool,root,{operationId:op(),title:'Otra clase',body,classDate:new Date().toISOString(),categoryId:null})).result.id;
      await denied(api.linkResource(pool,editor,{operationId:op(),classId:other,resourceId:f.resourceId,expectedVersion:1,transition:'ATTACH'}),'NOT_FOUND');
      const pending=op();await pool.query(`INSERT INTO "SnipersResource" (id,"classId",name,type,"mimeType","sizeBytes","updatedAt") VALUES ($1,$2,'Pendiente','PDF','application/pdf',10,clock_timestamp())`,[pending,f.classId]);
      await denied(api.linkResource(pool,editor,{operationId:op(),classId:f.classId,resourceId:pending,expectedVersion:await version(f.classId),transition:'ATTACH'}),'INVALID_STATE');
      await link(f,'ATTACH',editor);await sign(f,manager);await denied(sign(f,student),'FORBIDDEN');await denied(sign(f,admin),'FORBIDDEN');
      await transition(f.classId,'ARCHIVE');await denied(link(f),'INVALID_STATE');await denied(sign(f),'NOT_FOUND');
      await transition(f.classId,'RESTORE');await denied(sign(f),'NOT_FOUND');await transition(f.classId,'PUBLISH');
      await changePermission(pool,root,editor.userId,'SNIPERS_CONTENT_EDITOR',false);await denied(link(f,'DETACH',editor),'FORBIDDEN');
    });
    await t.test('igual acceso e historia en los tres niveles; suspensión, baja, vencimiento y sesión',async()=>{
      const plans=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code')).rows;assert.equal(plans.length,3);
      for(const plan of plans){const actor=await user(),membership=op(),coverage=op();
        await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,clock_timestamp())',[membership,actor.userId,plan.id]);
        await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','3B-2D igualdad',$4)`,[coverage,membership,plan.id,root.userId]);
        await sign(f,actor);assert.equal((await api.getPublishedClass(pool,actor,f.classId)).resources.length,1);
        for(const status of ['SUSPENDED','CLOSED']){await pool.query('UPDATE "SnipersMembership" SET status=$2 WHERE id=$1',[membership,status]);await denied(sign(f,actor),'FORBIDDEN');}
        await pool.query(`UPDATE "SnipersMembership" SET status='ACTIVE' WHERE id=$1`,[membership]);
        await pool.query(`UPDATE "SnipersCoveragePeriod" SET "endsAt"=clock_timestamp()-interval '1 second' WHERE id=$1`,[coverage]);await denied(sign(f,actor),'FORBIDDEN');
        await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1',[actor.userId,op()]);await denied(sign(f,actor),'SESSION');
      }
    });
    await t.test('fallo SQL real de auditoría revierte vínculo y versión',async()=>{
      const target=await verified(pool,root),before=await version(target.classId);
      const db={connect:async()=>{const tx=await pool.connect();return {query:(sql:string,args?:unknown[])=>tx.query(sql,sql.includes('INSERT INTO "SnipersAuditEvent"')?[args![0],op(),...args!.slice(2)]:args),release:()=>tx.release()};}} as unknown as Pool;
      const command={operationId:op(),classId:target.classId,resourceId:target.resourceId,expectedVersion:before,transition:'ATTACH'};
      await denied(api.linkResource(db,root,command),'23503');assert.equal(await version(target.classId),before);
      assert.equal((await api.getEditorialClass(pool,root,target.classId)).resources[0].attachedAt,null);assert.equal((await pool.query('SELECT id FROM "SnipersAuditEvent" WHERE id=$1',[command.operationId])).rowCount,0);
    });
    for(const first of ['ATTACH','PUBLISH'])await t.test(`carrera real ${first} primero frente a publicación/vínculo`,async()=>{
      const target=await verified(pool,root),base=await version(target.classId);
      const a=gated(sql=>sql.startsWith(first==='ATTACH'?'UPDATE "SnipersResource"':'UPDATE "SnipersClass"')),b=gated(()=>false);
      const run=(db:Pool,kind:string)=>kind==='ATTACH'?api.linkResource(db,root,{operationId:op(),classId:target.classId,resourceId:target.resourceId,expectedVersion:base,transition:'ATTACH'}):api.transitionContent(db,root,{operationId:op(),id:target.classId,expectedVersion:base,entity:'CLASS',transition:'PUBLISH'});
      const one=run(a.db,first);await a.waiting;const two=run(b.db,first==='ATTACH'?'PUBLISH':'ATTACH').then(()=>null,e=>e.code);
      try{await waitLock(b.tag);}finally{a.release();}await one;assert.equal(await two,'STALE');assert.ok(!b.errors.includes('40P01'));assert.equal(await version(target.classId),base+1);
    });
    for(const mutation of ['DETACH','WITHDRAW','REVOKE'])for(const signingFirst of [true,false])await t.test(`carrera real firma/${mutation}: ${signingFirst?'firma':'mutación'} primero`,async()=>{
      const target=await verified(pool,root,'MP3');await link(target);await transition(target.classId,'PUBLISH');const reader=await user('SNIPERS_CONTENT_EDITOR');
      const a=gated(sql=>signingFirst?sql==='SELECT clock_timestamp() AS now':sql.startsWith(mutation==='REVOKE'?'UPDATE "UserPermission"':mutation==='DETACH'?'UPDATE "SnipersResource"':'UPDATE "SnipersClass"'));
      const b=gated(()=>false);
      const mutate=(db:Pool)=>mutation==='REVOKE'?changePermission(db,root,reader.userId,'SNIPERS_CONTENT_EDITOR',false):mutation==='DETACH'?api.linkResource(db,root,{operationId:op(),classId:target.classId,resourceId:target.resourceId,expectedVersion:3,transition:'DETACH'}):api.transitionContent(db,root,{operationId:op(),id:target.classId,expectedVersion:3,entity:'CLASS',transition:'WITHDRAW'});
      const one=signingFirst?sign(target,reader,'PLAY',a.db):mutate(a.db);await a.waiting;
      const two=(signingFirst?mutate(b.db):sign(target,reader,'PLAY',b.db)).then(value=>({value,error:null}),e=>({value:null,error:e.code}));
      try{await waitLock(b.tag);}finally{a.release();}await one;const result=await two;
      if(signingFirst)assert.equal(result.error,null);else assert.equal(result.error,mutation==='REVOKE'?'FORBIDDEN':'NOT_FOUND');
      assert.ok(!b.errors.includes('40P01'));await denied(sign(target,reader,'PLAY'),mutation==='REVOKE'?'FORBIDDEN':'NOT_FOUND');
      assert.equal(target.storage.signed.length,signingFirst?1:0);
    });
    await t.test('encabezados remotos no autorizan: revalidar después de HEAD',async()=>{
      const target=await verified(pool,root);await link(target);await transition(target.classId,'PUBLISH');target.storage.inspectDelivery=async()=>{await link(target,'DETACH');};
      await denied(sign(target),'NOT_FOUND');assert.equal(target.storage.signed.length,0);
    });
    for(const signingFirst of [true,false])await t.test(`carrera real firma/suspensión académica: ${signingFirst?'firma':'suspensión'} primero`,async()=>{
      const target=await verified(pool,root,'MP3');await link(target);await transition(target.classId,'PUBLISH');const reader=await user(),membership=op(),plan=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code LIMIT 1')).rows[0].id;
      await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,clock_timestamp())',[membership,reader.userId,plan]);
      await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','Carrera 3B-2D',$4)`,[op(),membership,plan,root.userId]);
      const a=gated(sql=>signingFirst?sql==='SELECT clock_timestamp() AS now':sql.includes('UPDATE "SnipersMembership" SET status')),b=gated(()=>false);
      const suspend=(db:Pool)=>changeMembershipStatus(db,root,{operationId:op(),membershipId:membership,expectedVersion:1,status:'SUSPENDED',reason:'Prueba 3B-2D'});
      const one=signingFirst?sign(target,reader,'PLAY',a.db):suspend(a.db);await a.waiting;
      const two=(signingFirst?suspend(b.db):sign(target,reader,'PLAY',b.db)).then(()=>null,e=>e.code);
      try{await waitLock(b.tag);}finally{a.release();}await one;assert.equal(await two,signingFirst?null:'FORBIDDEN');assert.ok(!b.errors.includes('40P01'));await denied(sign(target,reader,'PLAY'),'FORBIDDEN');assert.equal(target.storage.signed.length,signingFirst?1:0);
    });
    await t.test('recibos v2 rechazan otro actor y reautorizan antes de replay',async()=>{
      const target=await verified(pool,root),editor=await user('SNIPERS_CONTENT_EDITOR');
      const command={operationId:op(),classId:target.classId,resourceId:target.resourceId,expectedVersion:1,transition:'ATTACH'};
      await api.linkResource(pool,editor,command);await denied(api.linkResource(pool,root,command),'IDEMPOTENCY_CONFLICT');
      await changePermission(pool,root,editor.userId,'SNIPERS_CONTENT_EDITOR',false);await denied(api.linkResource(pool,editor,command),'FORBIDDEN');
    });
    await t.test('pendiente y cancelado nunca se firman; no se consulta R2',async()=>{
      const pending=await startUpload(pool,root,{operationId:op(),classId:f.classId,name:'No consumible',file:{type:'PDF',mimeType:'application/pdf',sizeBytes:10},expectedSha256:'a'.repeat(64)});
      const probe={...f,...pending},inspections=f.storage.inspections;
      await denied(sign(probe),'INVALID_STATE');await cancelUpload(pool,root,{operationId:op(),uploadId:pending.uploadId},()=>f.storage);await denied(sign(probe),'INVALID_STATE');assert.equal(f.storage.inspections,inspections);
    });
    await t.test('retirar definitivamente conserva evidencia/generación y bloquea consumo',async()=>{
      const target=await verified(pool,root);await link(target);await transition(target.classId,'PUBLISH');
      const {transaction}=await import('../../src/lib/snipers/permissions');
      await transaction(pool,async tx=>{await tx.query('SELECT id FROM "SnipersClass" WHERE id=$1 FOR UPDATE',[target.classId]);await tx.query('SELECT id FROM "SnipersResource" WHERE id=$1 FOR UPDATE',[target.resourceId]);await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1 FOR UPDATE',[target.resourceId]);await tx.query('SELECT id FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY id FOR UPDATE',[target.resourceId]);await tx.query('SELECT id FROM "SnipersFileJob" WHERE "resourceId"=$1 ORDER BY id FOR UPDATE',[target.resourceId]);
        await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"attachedAt"=NULL,"archivedAt"=clock_timestamp() WHERE id=$1`,[target.resourceId]);
        await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=clock_timestamp(),"cleanupAfter"=clock_timestamp()+interval '7 days',"nextProbeAt"=clock_timestamp()+interval '7 days' WHERE "resourceId"=$1 AND "retiredAt" IS NULL`,[target.resourceId]);});
      await denied(sign(target),'INVALID_STATE');await denied(link(target),'INVALID_STATE');assert.equal((await api.getPublishedClass(pool,root,target.classId)).resources.length,0);
    });
  }finally{await pool.end();}
});
