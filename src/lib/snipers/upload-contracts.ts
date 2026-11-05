import { z } from 'zod';
import { id } from './contracts';
import { completionManifest, fileDeclaration, fileHash, uploadStatus } from './file-contracts';

export const PART_BYTES = 8 * 1024 * 1024;
export const startUploadSchema = z.object({
  operationId: id, classId: id, name: z.string().trim().min(1).max(200),
  file: fileDeclaration, expectedSha256: fileHash,
}).strict();
export const uploadQuerySchema = z.object({ uploadId: id }).strict();
export const signPartSchema = uploadQuerySchema.extend({ partNumber: z.number().int().min(1).max(32) }).strict();
export const completeUploadSchema = uploadQuerySchema.extend({ operationId: id, parts: completionManifest }).strict();
export const cancelUploadSchema = uploadQuerySchema.extend({ operationId: id }).strict();
export const uploadReceiptSchema = z.object({
  formatVersion: z.literal(2), commandHash: fileHash,
  result: z.object({ operationId: id, kind: z.enum(['UPLOAD_START', 'UPLOAD_COMPLETE', 'UPLOAD_CANCEL']),
    resourceId: id, uploadId: id }).strict(),
}).strict();
export type UploadReceipt = z.infer<typeof uploadReceiptSchema>['result'];
export type UploadState = {
  uploadId: string; resourceId: string; status: z.infer<typeof uploadStatus>;
  transferComplete: boolean; blocked: boolean; expired: boolean; errorCode: string | null;
  expiresAt: string; sizeBytes: number; partSizeBytes: number; name: string;
};
export function partBytes(size: number, partNumber: number): number {
  if (!Number.isSafeInteger(size) || size <= 0 || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(size / PART_BYTES)) {
    throw new Error('Parte fuera del archivo.');
  }
  return Math.min(PART_BYTES, size - (partNumber - 1) * PART_BYTES);
}
