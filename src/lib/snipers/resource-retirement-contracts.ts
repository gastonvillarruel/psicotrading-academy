import {z} from 'zod';
import {id} from './contracts';

export const resourceRetirementSchema=z.object({operationId:id,resourceId:id}).strict();
export const resourceRetirementAuditSchema=z.object({
  formatVersion:z.literal(5),commandHash:z.string().regex(/^[a-f0-9]{64}$/),
  result:z.object({kind:z.literal('RESOURCE_RETIREMENT_REQUEST'),operationId:id,resourceId:id,
    finalObjectId:id,requestedAt:z.string().datetime(),cleanupObjectId:id.nullable(),cleanupOperationId:id.nullable()}).strict()
    .refine(v=>(v.cleanupObjectId===null)===(v.cleanupOperationId===null)),
}).strict();
export type ResourceRetirementView={resourceId:string;
  state:'PROTECTED'|'AVAILABLE'|'PENDING'|'RUNNING'|'BLOCKED'|'DELETED';
  requested:boolean;canRequest:boolean;canContinue:boolean;reason:string;availableAt:string|null};
