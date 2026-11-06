// Trusted internal core. Only the session-bound server facade is public to application callers.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { parse, id } from './contracts';
import { requirePermission, transaction, type Actor } from './permissions';
import { getAcademicAccessInTransaction } from './queries';
import { digest, canonical } from './preview';
import { reject } from './errors';
import { inputInstant } from './presentation';
import { documentText, validateDocument, type ContentDocument } from './content-document';
import * as c from './content-contracts';
import type { DeliveryStorage } from './upload-storage';
import type { z } from 'zod';
import {finalResourceIdentity} from './resource-retirement-proof';

const tables = {CLASS:'SnipersClass',CATEGORY:'SnipersCategory',MEETING:'SnipersMeeting'} as const;
type Row = {id:string;version:number;title:string;body:ContentDocument;classDate:Date;categoryId:string|null;status:c.Publication;publishedAt:Date|null;archivedAt:Date|null;name:string;slug:string;startsAt:Date;endsAt:Date;privateJoinUrl:string};
const iso=(v:Date|null)=>v?.toISOString()??null;
function snapshot(e:c.EditorialEntity,r:Row) {
  if(e==='CATEGORY')return {version:r.version,archived:!!r.archivedAt,nameHash:digest(r.name)};
  if(e==='MEETING')return {version:r.version,status:r.status,titleHash:digest(r.title),joinHash:digest(r.privateJoinUrl),startsAt:iso(r.startsAt)!,endsAt:iso(r.endsAt)!};
  return {version:r.version,status:r.status,titleHash:digest(r.title),bodyHash:digest(r.body),categoryId:r.categoryId,classDate:iso(r.classDate)!,publishedAt:iso(r.publishedAt),archivedAt:iso(r.archivedAt)};
}
async function row(tx:PoolClient,e:c.EditorialEntity,key:string,expected:number) {
  const r=(await tx.query<Row>(`SELECT * FROM "${tables[e]}" WHERE id=$1 FOR UPDATE`,[key])).rows[0];
  if(!r)reject('NOT_FOUND','Contenido inexistente.');
  if(r.version!==expected)reject('STALE','El contenido cambió.');
  if(r.version===2147483647)reject('INTEGRITY','Versión fuera de rango.');
  return r;
}
async function category(tx:PoolClient,key:string|null,previous:string|null) {
  if(!key||key===previous)return;
  const r=(await tx.query('SELECT "archivedAt" FROM "SnipersCategory" WHERE id=$1 FOR SHARE',[key])).rows[0];
  if(!r||r.archivedAt)reject('INVALID_STATE','Elegí una categoría activa.');
}
async function receipt(tx:PoolClient,actor:Actor,operationId:string,kind:string,commandHash:string) {
  const r=(await tx.query('SELECT "actorUserId",action,payload,"createdAt" FROM "SnipersAuditEvent" WHERE id=$1',[operationId])).rows[0];
  if(!r)return null;
  const p=c.editorialAuditSchema.safeParse(r.payload);
  if(r.actorUserId!==actor.userId||!p.success||p.data.kind!==kind||p.data.commandHash!==commandHash)reject('IDEMPOTENCY_CONFLICT','Operación diferente.');
  if(p.data.result.operationId!==operationId)reject('INTEGRITY','Recibo inválido.');
  return {result:p.data.result,replayed:true,confirmedAt:iso(r.createdAt)!};
}
async function mutate(pool:Pool,actor:Actor,operationId:string,entity:c.EditorialEntity,kind:string,input:unknown,
  work:(tx:PoolClient)=>Promise<{before:Row|null;after:Row;resource?:z.infer<typeof c.resourceChangeSchema>}>) :Promise<c.EditorialReceipt> {
  const commandHash=digest({kind,input});
  try {
    return await transaction(pool,async tx=>{
      await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);
      const old=await receipt(tx,actor,operationId,kind,commandHash);if(old)return old;
      const {before,after,resource}=await work(tx);
      const a=snapshot(entity,after),b=before?snapshot(entity,before):null;
      const changedFields=Object.keys(a).filter(k=>k!=='version'&&canonical(a[k as keyof typeof a])!==canonical(b?.[k as keyof typeof b]));
      if(resource&&resource.beforeAttachedAt!==resource.afterAttachedAt)changedFields.push('resources');
      const changed=!before||changedFields.length>0;
      const result={operationId,id:after.id,entity,version:after.version,changed};
      const payload={formatVersion:resource?2:1,kind,commandHash,result,before:b,after:a,changedFields,...(resource?{resource}:{})};
      parse(c.editorialAuditSchema,payload);
      const event=await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING "createdAt"`,[operationId,actor.userId,`${entity}_CHANGED`,tables[entity],after.id,JSON.stringify(payload)]);
      return {result,replayed:false,confirmedAt:iso(event.rows[0].createdAt)!};
    });
  }catch(error){
    const code=(error as {code?:string}).code;
    if(code==='23505') {
      const old=await transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);return receipt(tx,actor,operationId,kind,commandHash);});
      if(old)return old;
      if(entity==='CATEGORY'&&kind==='CATEGORY_CREATE'&&(error as {constraint?:string}).constraint==='SnipersCategory_slug_key')reject('DUPLICATE_SLUG','El identificador de categoría ya existe.');
      reject('CONCURRENT','El identificador ya existe.');
    }
    if(['40001','40P01','55P03'].includes(code??''))reject('CONCURRENT','Reintentá el mismo envío.');
    throw error;
  }
}
export async function createClass(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.createClassSchema,input);
  return mutate(pool,actor,v.operationId,'CLASS','CLASS_CREATE',v,async tx=>{
    await category(tx,v.categoryId,null);
    const r=await tx.query<Row>(`INSERT INTO "SnipersClass" (id,title,body,"classDate","categoryId","updatedAt") VALUES ($1,$2,$3::jsonb,$4,$5,CURRENT_TIMESTAMP) RETURNING *`,[randomUUID(),v.title,JSON.stringify(v.body),v.classDate,v.categoryId]);
    return {before:null,after:r.rows[0]};
  });
}
export async function saveClass(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.saveClassSchema,input);
  return mutate(pool,actor,v.operationId,'CLASS','CLASS_SAVE',v,async tx=>{
    const before=await row(tx,'CLASS',v.id,v.expectedVersion);
    if(before.status==='ARCHIVED')reject('INVALID_STATE','Restaurá primero el borrador.');
    await category(tx,v.categoryId,before.categoryId);
    if(before.status==='PUBLISHED'&&!documentText(v.body))reject('VALIDATION','La clase publicada necesita texto.');
    if(before.title===v.title&&canonical(before.body)===canonical(v.body)&&iso(before.classDate)===v.classDate&&before.categoryId===v.categoryId)return {before,after:before};
    const after=(await tx.query<Row>(`UPDATE "SnipersClass" SET title=$2,body=$3::jsonb,"classDate"=$4,"categoryId"=$5,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[v.id,v.title,JSON.stringify(v.body),v.classDate,v.categoryId])).rows[0];
    return {before,after};
  });
}
export async function createCategory(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.createCategorySchema,input);
  return mutate(pool,actor,v.operationId,'CATEGORY','CATEGORY_CREATE',v,async tx=>({before:null,after:(await tx.query<Row>(`INSERT INTO "SnipersCategory" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP) RETURNING *`,[randomUUID(),v.name,v.slug])).rows[0]}));
}
export async function saveCategory(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.saveCategorySchema,input);
  return mutate(pool,actor,v.operationId,'CATEGORY','CATEGORY_SAVE',v,async tx=>{
    const before=await row(tx,'CATEGORY',v.id,v.expectedVersion);
    if(before.archivedAt)reject('INVALID_STATE','Restaurá primero la categoría.');
    const after=before.name===v.name?before:(await tx.query<Row>('UPDATE "SnipersCategory" SET name=$2,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[v.id,v.name])).rows[0];
    return {before,after};
  });
}
function interval(v:{startsAt:string;endsAt:string}) {if(Date.parse(v.startsAt)>=Date.parse(v.endsAt))reject('VALIDATION','El encuentro debe terminar después de comenzar.');}
export async function createMeeting(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.createMeetingSchema,input);interval(v);
  return mutate(pool,actor,v.operationId,'MEETING','MEETING_CREATE',v,async tx=>({before:null,after:(await tx.query<Row>(`INSERT INTO "SnipersMeeting" (id,title,"startsAt","endsAt","privateJoinUrl","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING *`,[randomUUID(),v.title,v.startsAt,v.endsAt,v.privateJoinUrl])).rows[0]}));
}
export async function saveMeeting(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.saveMeetingSchema,input);interval(v);
  return mutate(pool,actor,v.operationId,'MEETING','MEETING_SAVE',v,async tx=>{
    const before=await row(tx,'MEETING',v.id,v.expectedVersion);
    if(before.status==='ARCHIVED')reject('INVALID_STATE','Restaurá primero el encuentro.');
    const same=before.title===v.title&&before.privateJoinUrl===v.privateJoinUrl&&iso(before.startsAt)===v.startsAt&&iso(before.endsAt)===v.endsAt;
    const after=same?before:(await tx.query<Row>(`UPDATE "SnipersMeeting" SET title=$2,"startsAt"=$3,"endsAt"=$4,"privateJoinUrl"=$5,version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[v.id,v.title,v.startsAt,v.endsAt,v.privateJoinUrl])).rows[0];
    return {before,after};
  });
}
export async function transitionContent(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.transitionSchema,input);
  return mutate(pool,actor,v.operationId,v.entity,`${v.entity}_${v.transition}`,v,async tx=>{
    const before=await row(tx,v.entity,v.id,v.expectedVersion);
    if(v.entity==='CATEGORY') {
      if(!['ARCHIVE','RESTORE'].includes(v.transition)||!!before.archivedAt!==(v.transition==='RESTORE'))reject('INVALID_STATE','Transición inválida.');
      const after=(await tx.query<Row>(`UPDATE "SnipersCategory" SET "archivedAt"=${v.transition==='ARCHIVE'?'clock_timestamp()':'NULL'},version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[v.id])).rows[0];
      return {before,after};
    }
    const valid=v.transition==='PUBLISH'?before.status==='DRAFT':v.transition==='WITHDRAW'?before.status==='PUBLISHED':v.transition==='RESTORE'?before.status==='ARCHIVED':before.status!=='ARCHIVED';
    if(!valid)reject('INVALID_STATE','Transición inválida.');
    if(v.entity==='CLASS'&&v.transition==='PUBLISH') {
      if(!documentText(validateDocument(before.body)))reject('VALIDATION','La clase necesita texto para publicarse.');
      // Only explicitly attached VERIFIED resources are exposed; pending uploads do not publish.
    }
    const status=v.transition==='PUBLISH'?'PUBLISHED':v.transition==='ARCHIVE'?'ARCHIVED':'DRAFT';
    const dates=v.entity==='CLASS'?`,"archivedAt"=${status==='ARCHIVED'?'clock_timestamp()':'NULL'}${status==='PUBLISHED'?',"publishedAt"=coalesce("publishedAt",clock_timestamp())':''}`:'';
    const after=(await tx.query<Row>(`UPDATE "${tables[v.entity]}" SET status=$2,version=version+1,"updatedAt"=CURRENT_TIMESTAMP${dates} WHERE id=$1 RETURNING *`,[v.id,status])).rows[0];
    return {before,after};
  });
}
async function academic(tx:PoolClient,actor:Actor) {if(!(await getAcademicAccessInTransaction(tx,actor)).allowed)reject('FORBIDDEN','Acceso académico requerido.');}
// The existing SQL constraints certify the historical byte proof. Do not re-age AV signatures at read time.
const resourceProof=`${finalResourceIdentity}
  AND r.status='VERIFIED' AND r."archivedAt" IS NULL AND o."retiredAt" IS NULL`;
type FinalResource={id:string;name:string;type:c.PublishedResource['type'];classId:string;attachedAt:Date|null;finalObjectId:string;generation:number;key:string;mimeType:string;sizeBytes:string;uploadId:string};
async function lockResource(tx:PoolClient,resourceId:string,classId:string,mode:'SHARE'|'UPDATE') {
  const r=(await tx.query('SELECT id FROM "SnipersResource" WHERE id=$1 AND "classId"=$2 FOR '+mode,[resourceId,classId])).rows[0];
  if(!r)reject('NOT_FOUND','Recurso inexistente.');
  await tx.query('SELECT id FROM "SnipersUpload" WHERE "resourceId"=$1 FOR '+mode,[resourceId]);
  await tx.query('SELECT id FROM "SnipersStorageObject" WHERE "resourceId"=$1 ORDER BY id FOR '+mode,[resourceId]);
  await tx.query('SELECT id FROM "SnipersFileJob" WHERE "resourceId"=$1 ORDER BY id FOR '+mode,[resourceId]);
  const final=(await tx.query<FinalResource>(`SELECT r.id,r.name,r.type,r."classId",r."attachedAt",r."finalObjectId",r."mimeType",r."sizeBytes",o.key,o."producerGeneration" AS generation,u.id AS "uploadId" ${resourceProof} AND r.id=$1`,[resourceId])).rows[0];
  if(!final)reject('INVALID_STATE','El recurso no está verificado y disponible.');
  return final;
}
export async function linkResource(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.resourceLinkSchema,input);
  return mutate(pool,actor,v.operationId,'CLASS',`CLASS_${v.transition}`,v,async tx=>{
    const before=await row(tx,'CLASS',v.classId,v.expectedVersion);
    if(before.status==='ARCHIVED')reject('INVALID_STATE','Restaurá primero la clase.');
    const r=await lockResource(tx,v.resourceId,v.classId,'UPDATE');
    const changed=(r.attachedAt!==null)!==(v.transition==='ATTACH');
    const attached=changed?(await tx.query<{attachedAt:Date|null}>(`UPDATE "SnipersResource" SET "attachedAt"=${v.transition==='ATTACH'?'clock_timestamp()':'NULL'},"updatedAt"=clock_timestamp() WHERE id=$1 RETURNING "attachedAt"`,[r.id])).rows[0].attachedAt:r.attachedAt;
    const after=changed?(await tx.query<Row>('UPDATE "SnipersClass" SET version=version+1,"updatedAt"=clock_timestamp() WHERE id=$1 RETURNING *',[v.classId])).rows[0]:before;
    return {before,after,resource:{resourceId:r.id,finalObjectId:r.finalObjectId,generation:r.generation,beforeAttachedAt:iso(r.attachedAt),afterAttachedAt:iso(attached)}};
  });
}
async function deliveryResource(tx:PoolClient,actor:Actor,resourceId:string,mode:'PLAY'|'DOWNLOAD') {
  await academic(tx,actor);
  const identity=(await tx.query<{classId:string}>('SELECT "classId" FROM "SnipersResource" WHERE id=$1',[resourceId])).rows[0];
  if(!identity)reject('NOT_FOUND','Recurso inexistente.');
  const cl=(await tx.query<{status:string}>('SELECT status FROM "SnipersClass" WHERE id=$1 FOR SHARE',[identity.classId])).rows[0];
  if(cl?.status!=='PUBLISHED')reject('NOT_FOUND','Recurso no publicado.');
  const r=await lockResource(tx,resourceId,identity.classId,'SHARE');
  if(!r.attachedAt)reject('NOT_FOUND','Recurso no vinculado.');
  if(mode==='PLAY'&&r.type!=='MP3'&&r.type!=='M4A')reject('VALIDATION','Sólo los archivos de audio admiten reproducción.');
  return r;
}
export async function signResource(pool:Pool,actor:Actor,input:unknown,storage:()=>DeliveryStorage) {
  const v=parse(c.resourceDeliverySchema,input);
  // HEAD only checks delivery headers, never byte integrity. Remote I/O is outside SQL/retry callbacks.
  const candidate=await transaction(pool,tx=>deliveryResource(tx,actor,v.resourceId,v.mode));
  const adapter=storage();
  await adapter.inspectDelivery(candidate.key,candidate.mimeType,Number(candidate.sizeBytes),candidate.uploadId,AbortSignal.timeout(10000));
  return transaction(pool,async tx=>{
    const current=await deliveryResource(tx,actor,v.resourceId,v.mode);
    if(current.finalObjectId!==candidate.finalObjectId||current.key!==candidate.key)reject('STALE','El definitivo cambió.');
    // Static credentials + local signing only; hold all authorization/content locks until COMMIT.
    const now=(await tx.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
    const expiresAt=new Date(now.getTime()+120000);
    const url=await adapter.signRead(current.key,now,expiresAt);
    return {url,expiresAt:expiresAt.toISOString()};
  });
}
const classView=(r:Row & {categoryName?:string|null})=>({id:r.id,title:r.title,body:validateDocument(r.body),classDate:iso(r.classDate)!,categoryId:r.categoryId,categoryName:r.categoryName??null,status:r.status,version:r.version,publishedAt:iso(r.publishedAt),archivedAt:iso(r.archivedAt)});
const meetingView=(r:Row)=>({id:r.id,title:r.title,startsAt:iso(r.startsAt)!,endsAt:iso(r.endsAt)!,status:r.status,version:r.version});
const categoryView=(r:Row)=>({id:r.id,name:r.name,slug:r.slug,version:r.version,archivedAt:iso(r.archivedAt)});
export async function listPublishedClasses(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.libraryFilter,input);
  return transaction(pool,async tx=>{
    await academic(tx,actor);
    const boundary=(year:number,month:number)=>{const d=new Date(Date.UTC(year,month,1));return inputInstant(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01T00:00`);};
    const start=v.year?boundary(v.year,(v.month??1)-1):null;
    const end=v.year?boundary(v.year+(v.month?0:1),v.month??0):null;
    const rows=await tx.query<Row & {categoryName:string|null}>(`SELECT c.*,cat.name AS "categoryName" FROM "SnipersClass" c LEFT JOIN "SnipersCategory" cat ON cat.id=c."categoryId"
      WHERE c.status='PUBLISHED' AND ($1::text IS NULL OR c."categoryId"=$1) AND ($2::timestamptz IS NULL OR (c."classDate">=$2 AND c."classDate"<$3))
      ORDER BY c."classDate" DESC,c.id DESC LIMIT $4 OFFSET $5`,[v.categoryId??null,start,end,v.limit+1,v.offset]);
    return {items:rows.rows.slice(0,v.limit).map(r=>({id:r.id,title:r.title,classDate:iso(r.classDate)!,categoryName:r.categoryName})),hasMore:rows.rows.length>v.limit};
  });
}
export async function getPublishedClass(pool:Pool,actor:Actor,input:unknown) {
  const key=parse(id,input);
  return transaction(pool,async tx=>{await academic(tx,actor);const r=(await tx.query<Row & {categoryName:string|null}>(`SELECT c.*,cat.name AS "categoryName" FROM "SnipersClass" c LEFT JOIN "SnipersCategory" cat ON cat.id=c."categoryId" WHERE c.id=$1 AND c.status='PUBLISHED' FOR SHARE OF c`,[key])).rows[0];if(!r)reject('NOT_FOUND','Clase inexistente.');
    const resources=(await tx.query<c.PublishedResource>(`SELECT r.id,r.name,r.type ${resourceProof} AND r."classId"=$1 AND r."attachedAt" IS NOT NULL ORDER BY r."createdAt",r.id`,[key])).rows;
    return {...classView(r),resources};});
}
export async function listCategories(pool:Pool,actor:Actor,editorial=false) {
  return transaction(pool,async tx=>{if(editorial)await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);else await academic(tx,actor);
    return (await tx.query<Row>(`SELECT cat.* FROM "SnipersCategory" cat ${editorial?'':`WHERE cat."archivedAt" IS NULL OR EXISTS (SELECT 1 FROM "SnipersClass" c WHERE c."categoryId"=cat.id AND c.status='PUBLISHED')`} ORDER BY cat.name,cat.id`)).rows.map(categoryView);});
}
export async function listEditorialClasses(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.editorialFilter,input);
  return transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);const r=await tx.query<Row>('SELECT id,title,"classDate",status,version FROM "SnipersClass" WHERE ($1::"SnipersPublicationStatus" IS NULL OR status=$1) ORDER BY "classDate" DESC,id DESC LIMIT $2 OFFSET $3',[v.status??null,v.limit+1,v.offset]);return {items:r.rows.slice(0,v.limit).map(r=>({id:r.id,title:r.title,classDate:iso(r.classDate)!,status:r.status,version:r.version})),hasMore:r.rows.length>v.limit};});
}
export async function getEditorialClass(pool:Pool,actor:Actor,input:unknown) {
  const key=parse(id,input);return transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);const r=(await tx.query<Row>('SELECT * FROM "SnipersClass" WHERE id=$1 FOR SHARE',[key])).rows[0];if(!r)reject('NOT_FOUND','Clase inexistente.');
    const resources=(await tx.query<Omit<c.EditorialResource,'attachedAt'> & {attachedAt:Date|null}>('SELECT id,name,type,status,"attachedAt" FROM "SnipersResource" WHERE "classId"=$1 ORDER BY "createdAt",id',[key])).rows.map(v=>({...v,attachedAt:iso(v.attachedAt)}));
    return {...classView(r),resources};});
}
export async function getEditorialMeeting(pool:Pool,actor:Actor,input:unknown) {
  const key=parse(id,input);
  return transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);
    const r=(await tx.query<Row>('SELECT id,title,"startsAt","endsAt",status,version,"privateJoinUrl" FROM "SnipersMeeting" WHERE id=$1',[key])).rows[0];
    if(!r)reject('NOT_FOUND','Encuentro inexistente.');
    return {...meetingView(r),privateJoinUrl:r.privateJoinUrl};
  });
}
export async function listMeetings(pool:Pool,actor:Actor,input:unknown,editorial=false) {
  const v=parse(c.editorialFilter,input);
  return transaction(pool,async tx=>{if(editorial)await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);else await academic(tx,actor);
    const r=await tx.query<Row>(`SELECT * FROM "SnipersMeeting" WHERE ${editorial?'($1::"SnipersPublicationStatus" IS NULL OR status=$1)':"status='PUBLISHED' AND $1::text IS NULL"} ORDER BY "startsAt" DESC,id DESC LIMIT $2 OFFSET $3`,[editorial?v.status??null:null,v.limit+1,v.offset]);
    return {items:r.rows.slice(0,v.limit).map(r=>({...meetingView(r),...(editorial?{privateJoinUrl:r.privateJoinUrl}:{})})),hasMore:r.rows.length>v.limit};});
}
export async function getMeetingJoin(pool:Pool,actor:Actor,input:unknown) {
  const key=parse(id,input);
  return transaction(pool,async tx=>{await academic(tx,actor);const r=(await tx.query<Row>('SELECT * FROM "SnipersMeeting" WHERE id=$1 AND status=\'PUBLISHED\' FOR SHARE',[key])).rows[0];if(!r)reject('NOT_FOUND','Encuentro inexistente.');return {url:r.privateJoinUrl};});
}
export async function getEditorialHistory(pool:Pool,actor:Actor,input:unknown) {
  const v=parse(c.historyFilter,input);return transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);
    const r=await tx.query('SELECT id,"actorUserId",action,"entityType","entityId",payload,"createdAt" FROM "SnipersAuditEvent" WHERE action IN (\'CLASS_CHANGED\',\'CATEGORY_CHANGED\',\'MEETING_CHANGED\') AND ($1::text IS NULL OR "entityType"=$1) AND ($2::text IS NULL OR "entityId"=$2) ORDER BY "createdAt" DESC,id DESC LIMIT $3 OFFSET $4',[v.entity?tables[v.entity]:null,v.id??null,v.limit+1,v.offset]);
    const actors=await tx.query<{id:string;name:string|null}>('SELECT id,name FROM "User" WHERE id=ANY($1::text[])',[r.rows.map(row=>row.actorUserId)]);
    const names=new Map(actors.rows.map(row=>[row.id,row.name??'Operador']));
    return {items:r.rows.slice(0,v.limit).map(r=>{const p=parse(c.editorialAuditSchema,r.payload);return {operationId:r.id as string,actorId:r.actorUserId as string,actorName:names.get(r.actorUserId)??'Operador',entity:p.result.entity,id:r.entityId as string,kind:p.kind,version:p.result.version,changedFields:p.changedFields,createdAt:iso(r.createdAt)!};}),hasMore:r.rows.length>v.limit};});
}
export async function getEditorialOperation(pool:Pool,actor:Actor,input:unknown) {
  const key=parse(id,input);return transaction(pool,async tx=>{await requirePermission(tx,actor,'SNIPERS_CONTENT_EDITOR',true);const r=(await tx.query('SELECT "actorUserId",payload,"createdAt" FROM "SnipersAuditEvent" WHERE id=$1',[key])).rows[0];if(!r)return null;const p=c.editorialAuditSchema.safeParse(r.payload);if(r.actorUserId!==actor.userId||!p.success)reject('FORBIDDEN','Operación ajena.');return {result:p.data.result,confirmedAt:iso(r.createdAt)!};});
}
