import {z} from 'zod';
import type { PrivateFileType } from './file-contracts';
import {id} from './contracts';

export const storagePageSchema=z.object({offset:z.number().int().min(0).max(1000000).default(0)}).strict();
export const storageResourceSchema=z.object({resourceId:id}).strict();
export const storageCleanupSchema=z.object({operationId:id,objectId:id}).strict();
export const storageRequestAuditSchema=z.object({
  formatVersion:z.literal(4),commandHash:z.string().regex(/^[a-f0-9]{64}$/),
  result:z.object({kind:z.literal('ADMIN_CLEANUP_REQUEST'),operationId:id,resourceId:id,objectId:id,
    generation:z.number().int().nonnegative()}).strict(),
}).strict();

export type StorageResource={id:string;name:string;type:PrivateFileType;sizeBytes:string;createdAt:string;
  classId:string;classTitle:string;classStatus:string;attached:boolean;status:string;objectCount:string};
export type StorageSummary={resources:string;logicalBytes:string;withoutObjects:string;objects:string;
  verifiedObjects:string;verifiedBytes:string;unknownSizeObjects:string;absentObjects:string;pendingObjects:string};
export type StoragePage={items:StorageResource[];summary:StorageSummary;offset:number;hasMore:boolean};
export type StorageObjectState='PROTECTED'|'IN_USE'|'RETAINED'|'ELIGIBLE'|'RUNNING'|'UNCERTAIN'|'ABSENT'|'BLOCKED'|'PENDING';
export type StorageObjectView={id:string;resourceId:string;kind:'TEMPORARY'|'FINAL';createdAt:string;
  sizeBytes:string|null;state:StorageObjectState;canClean:boolean;reason:string;availableAt:string|null;
  lastAbsentAt:string|null};
