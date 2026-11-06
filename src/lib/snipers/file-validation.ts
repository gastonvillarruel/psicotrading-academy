import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileDeclaration, fileHash, type PrivateFileType } from './file-contracts';

export const VALIDATION_POLICY = 1;
export const SIGNATURE_MAX_AGE = 72 * 60 * 60 * 1000;
export class ValidationFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
export type ByteProof = { sha256: string; sizeBytes: number };
export type ScanProof = { signatureVersion: string; signaturePublishedAt: Date };
export type FileAnalyzer = {
  analyze(file: string, type: 'MP3' | 'PDF', signal: AbortSignal): Promise<ScanProof>;
};
export type ValidationStorage = {
  read(key: string, signal: AbortSignal): Promise<Readable>;
  // A single conditional write, never an overwrite or an automatic retry.
  putNew(key: string, file: string, size: number, mime: string, uploadId: string, signal: AbortSignal): Promise<void>;
};
export function checkSignatures(proof: ScanProof, now: Date) {
  const date = proof.signaturePublishedAt?.getTime();
  if (typeof proof.signatureVersion !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(proof.signatureVersion) || !Number.isFinite(date)
    || date > now.getTime() || date < now.getTime() - SIGNATURE_MAX_AGE) throw new ValidationFailure('SIGNATURES_STALE');
}

// Both the source and the definitive GET use this counter, never HEAD/metadata as proof.
export async function inspectBytes(source: Readable, expected: { type: PrivateFileType; mimeType: string; sizeBytes: number; sha256: string },
  signal: AbortSignal, destination?: string): Promise<ByteProof> {
  fileDeclaration.parse({ type: expected.type, mimeType: expected.mimeType, sizeBytes: expected.sizeBytes });
  fileHash.parse(expected.sha256);
  const hash = createHash('sha256'); let size = 0;
  const count = new Transform({ transform(chunk: Buffer, _encoding, done) {
    size += chunk.length;
    if (size > expected.sizeBytes) return done(new ValidationFailure('SIZE_EXCEEDED'));
    hash.update(chunk); done(null, destination ? chunk : undefined);
  } });
  if (destination) await pipeline(source, count, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
  else await pipeline(source, count, { signal });
  if (size !== expected.sizeBytes) throw new ValidationFailure('SIZE_MISMATCH');
  const sha256 = hash.digest('hex');
  if (sha256 !== expected.sha256) throw new ValidationFailure('SHA256_MISMATCH');
  return { sha256, sizeBytes: size };
}
export function inspectLocal(file: string, expected: Parameters<typeof inspectBytes>[1], signal: AbortSignal) {
  return inspectBytes(createReadStream(file, { highWaterMark: 64 * 1024 }), expected, signal);
}
