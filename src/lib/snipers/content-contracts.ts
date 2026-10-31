import { z } from 'zod';
import { id, instant, version, pageSchema } from './contracts';
import { validateDocument, zoomUrl } from './content-document';

export const publication = z.enum(['DRAFT','PUBLISHED','ARCHIVED']);
export type Publication = z.infer<typeof publication>;
export const entity = z.enum(['CLASS','CATEGORY','MEETING']);
export type EditorialEntity = z.infer<typeof entity>;
export const title = z.string().trim().min(1).max(200);
const classFields = { title, body:z.unknown().transform(validateDocument), classDate:instant, categoryId:id.nullable() };
const meetingFields = {title,startsAt:instant,endsAt:instant,privateJoinUrl:z.string().transform(zoomUrl)};
const command = {operationId:id};
const update = {...command,id,expectedVersion:version};
export const createClassSchema=z.object({...command,...classFields}).strict();
export const saveClassSchema=z.object({...update,...classFields}).strict();
export const createCategorySchema=z.object({...command,name:z.string().trim().min(1).max(100),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)}).strict();
export const saveCategorySchema=z.object({...update,name:z.string().trim().min(1).max(100)}).strict();
export const createMeetingSchema=z.object({...command,...meetingFields}).strict();
export const saveMeetingSchema=z.object({...update,...meetingFields}).strict();
export const transitionSchema=z.object({...update,entity,transition:z.enum(['PUBLISH','WITHDRAW','ARCHIVE','RESTORE'])}).strict();
export const resourceLinkSchema=z.object({...command,classId:id,expectedVersion:version,resourceId:id,transition:z.enum(['ATTACH','DETACH'])}).strict();
export const resourceDeliverySchema=z.object({resourceId:id,mode:z.enum(['PLAY','DOWNLOAD'])}).strict();
export type PublishedResource={id:string;name:string;type:'MP3'|'PDF'};
export type EditorialResource=PublishedResource & {status:'PENDING'|'VERIFIED'|'REJECTED'|'ARCHIVED';attachedAt:string|null};
export const editorialFilter=pageSchema.extend({status:publication.optional()}).strict();
export const libraryFilter=pageSchema.extend({categoryId:id.optional(),year:z.number().int().min(1900).max(9998).optional(),month:z.number().int().min(1).max(12).optional()}).strict().refine(v=>!v.month||!!v.year);
export const historyFilter=pageSchema.extend({entity:entity.optional(),id:id.optional()}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const state=z.object({version:version,status:publication.optional(),archived:z.boolean().optional(),titleHash:hash.optional(),bodyHash:hash.optional(),nameHash:hash.optional(),joinHash:hash.optional(),categoryId:id.nullable().optional(),classDate:instant.optional(),startsAt:instant.optional(),endsAt:instant.optional(),publishedAt:instant.nullable().optional(),archivedAt:instant.nullable().optional()}).strict();
const editorialAuditV1=z.object({formatVersion:z.literal(1),kind:z.string().regex(/^(CLASS|CATEGORY|MEETING)_(CREATE|SAVE|PUBLISH|WITHDRAW|ARCHIVE|RESTORE)$/),commandHash:hash,
  result:z.object({operationId:id,id,entity,version,changed:z.boolean()}).strict(),before:state.nullable(),after:state,changedFields:z.array(z.string().regex(/^[a-zA-Z]+$/)).max(12)}).strict();
export const resourceChangeSchema=z.object({resourceId:id,finalObjectId:id,generation:version,beforeAttachedAt:instant.nullable(),afterAttachedAt:instant.nullable()}).strict();
const editorialAuditV2=editorialAuditV1.extend({formatVersion:z.literal(2),kind:z.enum(['CLASS_ATTACH','CLASS_DETACH']),
  result:editorialAuditV1.shape.result.extend({entity:z.literal('CLASS')}),resource:resourceChangeSchema}).strict();
export const editorialAuditSchema=z.discriminatedUnion('formatVersion',[editorialAuditV1,editorialAuditV2]);
export type EditorialReceipt={result:z.infer<typeof editorialAuditSchema>['result'];replayed:boolean;confirmedAt:string};
