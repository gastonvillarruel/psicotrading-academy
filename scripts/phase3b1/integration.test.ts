import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'pg';
import { localPool,requireRunner,verifyDatabase } from '../phase1/guard';
import { changePermission,type Actor } from '../../src/lib/snipers/permissions';
import * as api from '../../src/lib/snipers/content';
import { editorialAuditSchema } from '../../src/lib/snipers/content-contracts';

const body=(text='Disciplina y gestión emocional')=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const denied=(promise:Promise<unknown>,code:string)=>assert.rejects(promise,e=>(e as {code:string}).code===code);
const op=()=>randomUUID();
test('3B-1: servicios, autorización y concurrencia PostgreSQL reales',{timeout:180000},async t=>{
  assert.equal(process.env.SNIPERS_PHASE3B1_LOCAL,'1');const p=requireRunner();verifyDatabase(p);
  const pool=localPool();const root:Actor={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  async function user(permission?:'SNIPERS_CONTENT_EDITOR'|'SNIPERS_MEMBERSHIP_MANAGER',role='STUDENT'){
    const actor={userId:op(),activeSessionId:null,singleSession:false};
    await pool.query('INSERT INTO "User" (id,email,name,role,"updatedAt") VALUES ($1,$2,\'Fixture 3B\',$3,CURRENT_TIMESTAMP)',[actor.userId,`phase3b1-${actor.userId}@local.invalid`,role]);
    if(permission)await changePermission(pool,root,actor.userId,permission,true);return actor;
  }
  async function create(actor=root){return (await api.createClass(pool,actor,{operationId:op(),title:'Clase de prueba',body:body(),classDate:'2000-01-01T15:00:00.000Z',categoryId:null})).result.id;}
  async function saveInput(key:string){const r=await api.getEditorialClass(pool,root,key);return {operationId:op(),id:key,expectedVersion:r.version,title:r.title,body:r.body,classDate:r.classDate,categoryId:r.categoryId};}
  async function transition(key:string,transition:string,entity='CLASS'){
    const table=entity==='CLASS'?'SnipersClass':entity==='CATEGORY'?'SnipersCategory':'SnipersMeeting';
    const version=(await pool.query(`SELECT version FROM "${table}" WHERE id=$1`,[key])).rows[0].version;
    return api.transitionContent(pool,root,{operationId:op(),id:key,expectedVersion:version,entity,transition});
  }
  const editor=await user('SNIPERS_CONTENT_EDITOR');const manager=await user('SNIPERS_MEMBERSHIP_MANAGER');const stranger=await user();const globalAdmin=await user(undefined,'ADMIN');
  const key=await create(editor);
  try{
    await t.test('matriz editorial: editor/supervisor; gestor, alumno y ADMIN sin concesión denegados',async()=>{
      for(const actor of [stranger,manager,globalAdmin]){
        await denied(api.getEditorialClass(pool,actor,key),'FORBIDDEN');
        await denied(api.createClass(pool,actor,{operationId:op(),title:'No permitido',body:body(),classDate:new Date().toISOString(),categoryId:null}),'FORBIDDEN');
        await denied(api.listCategories(pool,actor,true),'FORBIDDEN');
        await denied(api.listMeetings(pool,actor,{},true),'FORBIDDEN');
        await denied(api.getEditorialHistory(pool,actor,{}),'FORBIDDEN');
      }
      assert.equal((await api.getEditorialClass(pool,editor,key)).id,key);
      await denied(api.getEditorialClass(pool,{...editor,activeSessionId:op(),singleSession:true},key),'SESSION');
    });
    await t.test('borrador privado, publicación y retiro conservan primera publicación',async()=>{
      await denied(api.getPublishedClass(pool,manager,key),'NOT_FOUND');await transition(key,'PUBLISH');
      const first=(await api.getPublishedClass(pool,manager,key)).publishedAt;assert.ok(first);
      await transition(key,'WITHDRAW');await denied(api.getPublishedClass(pool,manager,key),'NOT_FOUND');
      await transition(key,'PUBLISH');assert.equal((await api.getPublishedClass(pool,manager,key)).publishedAt,first);
    });
    await t.test('los tres planes acceden al historial anterior al alta y no a borradores',async()=>{
      const plans=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code')).rows;
      for(const plan of plans){const actor=await user();const membershipId=op();
        await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[membershipId,actor.userId,plan.id]);
        await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','Fixture local',$4)`,[op(),membershipId,plan.id,root.userId]);
        assert.equal((await api.getPublishedClass(pool,actor,key)).id,key);
        assert.ok((await api.listPublishedClasses(pool,actor,{year:2000,month:1})).items.some(x=>x.id===key));
        await pool.query('UPDATE "SnipersMembership" SET status=\'SUSPENDED\' WHERE id=$1',[membershipId]);
        await denied(api.getPublishedClass(pool,actor,key),'FORBIDDEN');
        await pool.query('UPDATE "SnipersMembership" SET status=\'CLOSED\' WHERE id=$1',[membershipId]);await denied(api.listMeetings(pool,actor,{}),'FORBIDDEN');
        await pool.query('UPDATE "SnipersMembership" SET status=\'ACTIVE\' WHERE id=$1',[membershipId]);
        await pool.query('UPDATE "SnipersCoveragePeriod" SET "endsAt"=clock_timestamp()-interval \'1 hour\' WHERE "membershipId"=$1',[membershipId]);
        await denied(api.getPublishedClass(pool,actor,key),'FORBIDDEN');
      }
      await denied(api.listPublishedClasses(pool,stranger,{}),'FORBIDDEN');
    });
    await t.test('guardar publicada sólo cambia campos editoriales y rechaza estado inyectado',async()=>{
      const input=await saveInput(key);await denied(api.saveClass(pool,editor,{...input,status:'PUBLISHED'}),'VALIDATION');
      await api.saveClass(pool,editor,{...input,title:'Guardado visible'});assert.equal((await api.getPublishedClass(pool,manager,key)).title,'Guardado visible');
      await denied(api.saveClass(pool,editor,{...await saveInput(key),body:{type:'doc',content:[{type:'paragraph'}]}}),'VALIDATION');
    });
    await t.test('idempotencia histórica: UUID e intención; no reaplica después del retiro',async()=>{
      const input={...await saveInput(key),title:'Cambio idempotente'};const r=await api.saveClass(pool,editor,input);await transition(key,'WITHDRAW');
      assert.equal((await api.saveClass(pool,editor,input)).replayed,true);
      assert.equal((await api.getEditorialClass(pool,editor,key)).status,'DRAFT');
      await denied(api.saveClass(pool,editor,{...input,title:'Otra intención'}),'IDEMPOTENCY_CONFLICT');
      await denied(api.saveClass(pool,root,input),'IDEMPOTENCY_CONFLICT');
      assert.equal((await api.getEditorialOperation(pool,editor,input.operationId))?.result.version,r.result.version);
      await denied(api.getEditorialOperation(pool,root,input.operationId),'FORBIDDEN');
    });
    await t.test('categorías: archivado conserva historial y bloquea asignaciones nuevas',async()=>{
      const cat=(await api.createCategory(pool,editor,{operationId:op(),name:'Gestión emocional',slug:`fixture-${op()}`})).result;
      await api.saveClass(pool,editor,{...await saveInput(key),categoryId:cat.id});await transition(key,'PUBLISH');await transition(cat.id,'ARCHIVE','CATEGORY');
      assert.ok((await api.listCategories(pool,manager)).some(c=>c.id===cat.id));
      assert.equal((await api.listPublishedClasses(pool,manager,{categoryId:cat.id})).items[0].id,key);
      await denied(api.createClass(pool,editor,{operationId:op(),title:'Nueva',body:body(),classDate:new Date().toISOString(),categoryId:cat.id}),'INVALID_STATE');
      await transition(cat.id,'RESTORE','CATEGORY');
      await api.saveCategory(pool,editor,{operationId:op(),id:cat.id,expectedVersion:3,name:'Categoría actualizada'});
    });
    await t.test('slug existente: rechazo definitivo, corrección con UUID nuevo e intención confirmada inmutable',async()=>{
      const original={operationId:op(),name:'Categoría original',slug:`unique-${op()}`};
      const first=await api.createCategory(pool,editor,original);
      const rejected={...original,operationId:op(),name:'Otra categoría'};
      await denied(api.createCategory(pool,editor,rejected),'DUPLICATE_SLUG');
      assert.equal(await api.getEditorialOperation(pool,editor,rejected.operationId),null);
      const corrected={...rejected,operationId:op(),slug:`corrected-${op()}`};
      assert.notEqual(corrected.operationId,rejected.operationId);
      await api.createCategory(pool,editor,corrected);
      await denied(api.createCategory(pool,editor,{...original,slug:`modified-${op()}` }),'IDEMPOTENCY_CONFLICT');
      assert.equal((await api.createCategory(pool,editor,original)).result.id,first.result.id);
    });
    await t.test('crear categoría dos veces con el mismo UUID concilia antes de clasificar el slug duplicado',async()=>{
      const input={operationId:op(),name:'Doble confirmación categoría',slug:`double-${op()}`};
      const receipts=await Promise.all([api.createCategory(pool,editor,input),api.createCategory(pool,editor,input)]);
      assert.equal(receipts.filter(r=>r.replayed).length,1);
      assert.equal(receipts[0].result.id,receipts[1].result.id);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersCategory" WHERE slug=$1',[input.slug])).rows[0].n,1);
    });
    await t.test('Zoom: lista sin URL privada; acceso sólo publicado y autorizado',async()=>{
      const input={operationId:op(),title:'Encuentro privado',startsAt:'2026-11-01T15:00:00.000Z',endsAt:'2026-11-01T16:00:00.000Z',privateJoinUrl:'https://mentor.zoom.us/j/123456?pwd=super-private'};
      const meeting=(await api.createMeeting(pool,editor,input)).result;
      await denied(api.getMeetingJoin(pool,manager,meeting.id),'NOT_FOUND');
      await transition(meeting.id,'PUBLISH','MEETING');
      assert.ok(!JSON.stringify(await api.listMeetings(pool,manager,{})).includes('privateJoinUrl'));
      assert.equal((await api.getMeetingJoin(pool,manager,meeting.id)).url,input.privateJoinUrl);
      await denied(api.getMeetingJoin(pool,stranger,meeting.id),'FORBIDDEN');
      await api.saveMeeting(pool,editor,{...input,operationId:op(),id:meeting.id,expectedVersion:2,title:'Encuentro actualizado'});
      await transition(meeting.id,'WITHDRAW','MEETING');await denied(api.getMeetingJoin(pool,manager,meeting.id),'NOT_FOUND');
      await denied(api.createMeeting(pool,editor,{...input,operationId:op(),endsAt:input.startsAt}),'VALIDATION');
    });
    await t.test('archivo/restauración: borrador obligatorio; comandos antiguos nunca republican',async()=>{
      const old=await saveInput(key);await transition(key,'ARCHIVE');await denied(api.saveClass(pool,editor,old),'STALE');
      const archived=await saveInput(key);await denied(api.saveClass(pool,editor,archived),'INVALID_STATE');
      await transition(key,'RESTORE');assert.equal((await api.getEditorialClass(pool,editor,key)).status,'DRAFT');
      await denied(api.transitionContent(pool,editor,{operationId:op(),id:key,expectedVersion:old.expectedVersion,entity:'CLASS',transition:'PUBLISH'}),'STALE');
    });
    await t.test('fallo de auditoría revierte contenido, versión y recibo',async()=>{
      const input={...await saveInput(key),title:'Nunca confirmado'};
      const broken={connect:async()=>{const tx=await pool.connect();return {query:(sql:string,args?:unknown[])=>{if(sql.includes('INSERT INTO "SnipersAuditEvent"'))throw new Error('Injected audit failure');return tx.query(sql,args);},release:()=>tx.release()};}} as unknown as Pool;
      await assert.rejects(api.saveClass(broken,editor,input),/Injected audit/);
      const actual=await api.getEditorialClass(pool,editor,key);assert.notEqual(actual.title,input.title);assert.equal(actual.version,input.expectedVersion);
      assert.equal(await api.getEditorialOperation(pool,editor,input.operationId),null);
    });
    async function race(first:'SAVE'|'PUBLISH'|'WITHDRAW'|'ARCHIVE',second:'SAVE'|'PUBLISH'|'WITHDRAW'|'RESTORE',published=first==='WITHDRAW'||first==='ARCHIVE'){
      const target=await create();if(published)await transition(target,'PUBLISH');
      const input=await saveInput(target);let ready!:()=>void;let release!:()=>void;const waiting=new Promise<void>(r=>{ready=r;});const gate=new Promise<void>(r=>{release=r;});
      const tag=`phase3b1-${op()}`;const errors:string[]=[];let paused=false;
      function wrapped(block:boolean){return {connect:async()=>{const tx=await pool.connect();if(!block)await tx.query('SELECT set_config(\'application_name\',$1,false)',[tag]);return {query:async(sql:string,args?:unknown[])=>{try{const r=await tx.query(sql,args);if(block&&!paused&&sql.startsWith('UPDATE "SnipersClass"')){paused=true;ready();await gate;}return r;}catch(e){errors.push((e as {code:string}).code);throw e;}},release:()=>tx.release()};}} as unknown as Pool;}
      function operation(db:Pool,kind:string){return kind==='SAVE'?api.saveClass(db,editor,{...input,title:`Cambio ${op()}`}):api.transitionContent(db,editor,{operationId:op(),id:target,expectedVersion:input.expectedVersion,entity:'CLASS',transition:kind});}
      const a=operation(wrapped(true),first);await waiting;
      const b=operation(wrapped(false),second).then(value=>({value,error:null}),error=>({value:null,error}));
      try{let locked=false;for(let i=0;i<100;i++){locked=!!(await pool.query('SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\'',[tag])).rowCount;if(locked)break;await delay(20);}assert.ok(locked,'Se observó espera de bloqueo real');}
      finally{release();}
      await a;const result=await b;assert.equal(result.error?.code,'STALE');assert.ok(!errors.includes('40P01'));
      const actual=await api.getEditorialClass(pool,editor,target);assert.equal(actual.version,input.expectedVersion+1);assert.equal(actual.status,first==='ARCHIVE'?'ARCHIVED':first==='PUBLISH'||first==='SAVE'&&published?'PUBLISHED':'DRAFT');
    }
    await t.test('carrera real: guardar gana a publicar; el reintento no cambia versión esperada',()=>race('SAVE','PUBLISH'));
    await t.test('carrera inversa: publicar gana a guardar obsoleto',()=>race('PUBLISH','SAVE'));
    await t.test('carrera real: retirar gana a guardar; contenido retirado permanece privado',()=>race('WITHDRAW','SAVE'));
    await t.test('carrera inversa: guardar publicada gana a retiro obsoleto',()=>race('SAVE','WITHDRAW',true));
    await t.test('carrera real: archivar gana a restauración obsoleta',()=>race('ARCHIVE','RESTORE'));
    await t.test('dos confirmaciones simultáneas del mismo UUID producen un solo evento',async()=>{
      const target=await create();const input={...await saveInput(target),title:'Único cambio'};
      const results=await Promise.all([api.saveClass(pool,editor,input),api.saveClass(pool,editor,input)]);
      assert.equal(results.filter(r=>r.replayed).length,1);assert.equal((await api.getEditorialClass(pool,editor,target)).version,2);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE id=$1',[input.operationId])).rows[0].n,1);
    });
    async function waitForLock(pid:number){
      for(let i=0;i<100;i++){
        if((await pool.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type=\'Lock\'',[pid])).rowCount)return;
        await delay(20);
      }
      assert.fail('No se observó la espera de bloqueo esperada.');
    }
    await t.test('lecturas académicas mantienen autorización y contenido en una transacción frente a revocación',async()=>{
      const student=await user();const membershipId=op();const plan=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code LIMIT 1')).rows[0].id;
      await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',[membershipId,student.userId,plan]);
      await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','Carrera de lectura',$4)`,[op(),membershipId,plan,root.userId]);
      const target=await create();await transition(target,'PUBLISH');
      const meeting=(await api.createMeeting(pool,root,{operationId:op(),title:'Zoom carrera',startsAt:'2026-11-01T15:00:00.000Z',endsAt:'2026-11-01T16:00:00.000Z',privateJoinUrl:'https://mentor.zoom.us/j/321'})).result.id;
      await transition(meeting,'PUBLISH','MEETING');
      const reads=[
        (db:Pool)=>api.listPublishedClasses(db,student,{}),
        (db:Pool)=>api.getPublishedClass(db,student,target),
        (db:Pool)=>api.listCategories(db,student),
        (db:Pool)=>api.listMeetings(db,student,{}),
        (db:Pool)=>api.getMeetingJoin(db,student,meeting),
      ];
      for(const read of reads){
        await pool.query('UPDATE "SnipersMembership" SET status=\'ACTIVE\' WHERE id=$1',[membershipId]);
        let ready!:()=>void,release!:()=>void;const authorized=new Promise<void>(r=>{ready=r;});const gate=new Promise<void>(r=>{release=r;});
        let checkouts=0,paused=false,contentReads=0,inTransaction=false;
        const revoker=await pool.connect();const pid=(await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        let revoked!:()=>void;const revocationCommitted=new Promise<void>(r=>{revoked=r;});
        const db={connect:async()=>{
          checkouts++;if(checkouts>1)await revocationCommitted;
          const tx=await pool.connect();return {query:async(sql:string,args?:unknown[])=>{
            if(sql.startsWith('BEGIN')){assert.equal(inTransaction,false,'Sin transacciones anidadas');inTransaction=true;}
            if(sql.includes('FROM "SnipersClass"')||sql.includes('FROM "SnipersCategory"')||sql.includes('FROM "SnipersMeeting"')){assert.equal(inTransaction,true);contentReads++;}
            const r=await tx.query(sql,args);
            if(!paused&&sql.includes('FROM "SnipersCoveragePeriod" c LEFT JOIN "SnipersPayment"')){paused=true;ready();await gate;}
            if(sql==='COMMIT'||sql==='ROLLBACK')inTransaction=false;
            return r;
          },release:()=>tx.release()};
        }} as unknown as Pool;
        const reading=read(db);
        let revoking:Promise<void>|undefined;
        try{
          await authorized;assert.equal(contentReads,0);
          await revoker.query('BEGIN');
          revoking=(async()=>{await revoker.query('UPDATE "SnipersMembership" SET status=\'SUSPENDED\',version=version+1 WHERE id=$1',[membershipId]);await revoker.query('COMMIT');revoked();})();
          await waitForLock(pid);release();
          await reading;await revoking;
          assert.equal(checkouts,1,'La autorización no libera su conexión antes de leer contenido');
          assert.equal(contentReads,1);
          await denied(read(pool),'FORBIDDEN');
        }finally{release();await reading.catch(()=>{});await revoking?.catch(()=>{});await revoker.query('ROLLBACK');revoker.release();}
      }
      // Revocation commits while authorization is waiting for the user lock.
      // SERIALIZABLE must retry with current coverage, without reading content.
      await pool.query('UPDATE "SnipersMembership" SET status=\'ACTIVE\' WHERE id=$1',[membershipId]);
      const blocker=await pool.connect();let pid=0,contentReads=0;
      const waitingDb={connect:async()=>{const tx=await pool.connect();pid=(await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return {query:(sql:string,args?:unknown[])=>{if(sql.includes('FROM "SnipersClass"'))contentReads++;return tx.query(sql,args);},release:()=>tx.release()};}} as unknown as Pool;
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[student.userId]);
      const reading=api.getPublishedClass(waitingDb,student,target);
      const rejected=denied(reading,'FORBIDDEN');
      try{
        for(let i=0;i<100&&!pid;i++)await delay(10);
        await waitForLock(pid);
        await pool.query('UPDATE "SnipersMembership" SET status=\'SUSPENDED\',version=version+1 WHERE id=$1',[membershipId]);
      }finally{await blocker.query('ROLLBACK');blocker.release();}
      await rejected;assert.equal(contentReads,0);
    });
    await t.test('la revocación del permiso académico espera a la lectura Zoom ya autorizada',async()=>{
      const manager=await user('SNIPERS_MEMBERSHIP_MANAGER');
      const meeting=(await api.createMeeting(pool,root,{operationId:op(),title:'Zoom concesión',startsAt:'2026-11-01T15:00:00.000Z',endsAt:'2026-11-01T16:00:00.000Z',privateJoinUrl:'https://mentor.zoom.us/j/456'})).result.id;
      await transition(meeting,'PUBLISH','MEETING');
      let ready!:()=>void,release!:()=>void;const authorized=new Promise<void>(r=>{ready=r;});const gate=new Promise<void>(r=>{release=r;});let paused=false;
      const db={connect:async()=>{const tx=await pool.connect();return {query:async(sql:string,args?:unknown[])=>{const r=await tx.query(sql,args);if(!paused&&sql.includes('FROM "UserPermission"')){paused=true;ready();await gate;}return r;},release:()=>tx.release()};}} as unknown as Pool;
      let pid=0;
      const revokeDb={connect:async()=>{const tx=await pool.connect();pid=(await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return {query:(sql:string,args?:unknown[])=>tx.query(sql,args),release:()=>tx.release()};}} as unknown as Pool;
      const reading=api.getMeetingJoin(db,manager,meeting);let revoking:Promise<boolean>|undefined;
      try{
        await authorized;revoking=changePermission(revokeDb,root,manager.userId,'SNIPERS_MEMBERSHIP_MANAGER',false);
        for(let i=0;i<100&&!pid;i++)await delay(10);
        await waitForLock(pid);release();
        assert.equal((await reading).url,'https://mentor.zoom.us/j/456');await revoking;
        await denied(api.getMeetingJoin(pool,manager,meeting),'FORBIDDEN');
      }finally{release();await reading.catch(()=>{});await revoking?.catch(()=>{});}
    });
    await t.test('revocación bloquea lectura y replay antes de recuperar recibos',async()=>{
      const input={...await saveInput(key),title:'Previo a revocación'};await api.saveClass(pool,editor,input);await changePermission(pool,root,editor.userId,'SNIPERS_CONTENT_EDITOR',false);
      await denied(api.saveClass(pool,editor,input),'FORBIDDEN');await denied(api.getEditorialOperation(pool,editor,input.operationId),'FORBIDDEN');
    });
    await t.test('auditoría estricta sin cuerpo, títulos, enlaces, ni secretos; recursos sin implementación',async()=>{
      const rows=(await pool.query('SELECT payload FROM "SnipersAuditEvent" WHERE action IN (\'CLASS_CHANGED\',\'CATEGORY_CHANGED\',\'MEETING_CHANGED\')')).rows;
      assert.ok(rows.length);for(const r of rows)assert.ok(editorialAuditSchema.safeParse(r.payload).success);
      assert.doesNotMatch(JSON.stringify(rows),/https?:|super-private|Disciplina|Nunca confirmado|privateJoinUrl|objectKey/);
      assert.deepEqual((await api.getEditorialClass(pool,root,key)).resources,[]);
      assert.ok((await api.getEditorialHistory(pool,root,{})).items.length);
    });
  }finally{await pool.end();}
});
