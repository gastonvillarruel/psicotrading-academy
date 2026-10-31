// Foundation only. No upload, worker, signed URL or public action is implemented here.
import { z } from 'zod';
import { id, instant } from './contracts';

export const fileHash = z.string().regex(/^[a-f0-9]{64}$/);
export const uploadStatus = z.enum(['PREPARING', 'UPLOADING', 'COMPLETING', 'PROCESSING', 'SUCCEEDED', 'CANCELLED', 'EXPIRED', 'FAILED']);
export const fileJobKind = z.enum(['PREPARE_UPLOAD', 'PROCESS_UPLOAD', 'CLEAN_OBJECT']);
export const fileJobStatus = z.enum(['READY', 'RUNNING', 'WAIT_RETRY', 'BLOCKED', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
export const objectKind = z.enum(['TEMPORARY', 'FINAL']);
export const fileResourceStatus = z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'ARCHIVED']);
export const objectOperation = z.enum(['NONE', 'CREATE_MULTIPART', 'COMPLETE_MULTIPART', 'PUT_FINAL']);
export const objectWriteState = z.enum(['RESERVED', 'IN_FLIGHT', 'UNCERTAIN', 'ACKNOWLEDGED', 'BYTES_VERIFIED']);
export const objectCleanupState = z.enum(['PENDING', 'ABSENT_OBSERVED', 'QUIESCENT']);
export const fileDeclaration = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MP3'), sizeBytes: z.number().int().positive().max(262144000), mimeType: z.literal('audio/mpeg') }).strict(),
  z.object({ type: z.literal('PDF'), sizeBytes: z.number().int().positive().max(26214400), mimeType: z.literal('application/pdf') }).strict(),
]);
export const completionManifest = z.array(z.object({ partNumber: z.number().int().min(1).max(32), etag: z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f-\x9f]+$/) }).strict()).min(1).max(32)
  .refine(parts => parts.every((part, index) => part.partNumber === index + 1));
// Technical intent is deliberately small. Business commands belong to later subphases.
export const foundationCommand = z.object({ operationId: id, resourceId: id, objectId: id.nullable(),
  kind: z.enum(['INVENTORY_RECORDED', 'OBJECT_RETIRED']) }).strict().refine(v => v.kind !== 'OBJECT_RETIRED' || v.objectId !== null);
export const fileAuditSchema = z.object({ formatVersion: z.literal(1), commandHash: fileHash,
  result: foundationCommand.safeExtend({ changed: z.boolean() }).strict() }).strict();
export type FoundationCommand = z.infer<typeof foundationCommand>;
export type FileReceipt = { result: z.infer<typeof fileAuditSchema>['result']; replayed: boolean; confirmedAt: string };
export const retirementObservation = z.object({ objectId: id, retiredAt: instant, cleanupAfter: instant,
  nextProbeAt: instant, lastAbsentAt: instant.nullable(), cleanupState: objectCleanupState }).strict()
  .refine(v => v.cleanupAfter >= v.retiredAt && v.nextProbeAt >= v.cleanupAfter && (v.cleanupState === 'PENDING' || v.lastAbsentAt !== null));

// System maintenance, deliberately separate from actor-bound v1/v2 receipts.
export const cleanupError = z.enum(['DEPENDENCY_ACTIVE','PROTECTED_FINAL','INVALID_PROVENANCE','INVALID_OBJECT_IDENTITY',
  'RETENTION_PENDING','STORAGE_UNAVAILABLE','STORAGE_CONFIGURATION','VISIT_INTERRUPTED','MULTIPART_RESPONSE_INVALID']);
export const cleanupAuditSchema = z.object({formatVersion:z.literal(3),commandHash:fileHash,
  result:z.object({operationId:id,resourceId:id,uploadId:id,objectId:id.nullable(),jobId:id.nullable(),
    generation:z.number().int().nonnegative(),phase:z.enum(['RESERVED','ABORT_MULTIPART','DELETE','PROBE']),
    kind:z.enum(['UPLOAD_EXPIRED','CLEANUP_INTENT','CLEANUP_QUIESCENT','CLEANUP_RETRY','CLEANUP_BLOCKED']),
    errorCode:cleanupError.nullable()}).strict()}).strict();
