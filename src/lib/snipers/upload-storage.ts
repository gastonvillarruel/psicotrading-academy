// Server/processor adapter. No credentials or SDK imports in the browser bundle.
import { S3Client, CreateMultipartUploadCommand, ListPartsCommand, CompleteMultipartUploadCommand,
  HeadObjectCommand, UploadPartCommand, AbortMultipartUploadCommand, GetObjectCommand, PutObjectCommand,
  ListMultipartUploadsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ValidationStorage } from './file-validation';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { reject } from './errors';

export type StoredPart = { partNumber: number; etag: string; sizeBytes: number };
export type MultipartCursor = {keyMarker:string;uploadIdMarker:string};
export type CleanupStorage = Pick<MultipartStorage,'head'|'abort'> & {
  listMultipart(key:string,cursor:MultipartCursor|null,signal:AbortSignal):Promise<{
    uploads:{key:string;multipartId:string}[];next:MultipartCursor|null}>;
  deleteObject(key:string,signal:AbortSignal):Promise<void>;
};
export type DeliveryStorage = {
  inspectDelivery(key:string,mime:string,size:number,uploadId:string,signal:AbortSignal):Promise<void>;
  signRead(key:string,now:Date,expiresAt:Date):Promise<string>;
};
// Stored metadata supported by R2. No dependency on undocumented GET response-* overrides.
export function downloadDisposition(uploadId:string,mime:string) {
  const name=uploadId.replace(/[^a-zA-Z0-9-]/g,'').slice(0,64)||'archivo';
  return `attachment; filename="snipers-${name}.${mime==='audio/mpeg'?'mp3':'pdf'}"`;
}
export type MultipartStorage = {
  create(key: string, mimeType: string, uploadId: string, signal: AbortSignal): Promise<string>;
  listParts(key: string, multipartId: string, signal: AbortSignal): Promise<StoredPart[]>;
  complete(key: string, multipartId: string, parts: { partNumber: number; etag: string }[], signal: AbortSignal): Promise<void>;
  head(key: string, signal: AbortSignal): Promise<{ sizeBytes: number; uploadId: string | null } | null>;
  signPart(key: string, multipartId: string, partNumber: number, bytes: number, expiresAt: Date): Promise<string>;
  abort(key: string, multipartId: string, signal: AbortSignal): Promise<void>;
};

export function r2TestConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.SNIPERS_R2_ENVIRONMENT !== 'test') reject('CONFIGURATION', 'Falta R2 de prueba.');
  return r2Config(env);
}

export function r2Config(env: Readonly<Record<string, string | undefined>> = process.env) {
  const mode = env.SNIPERS_R2_ENVIRONMENT;
  if (!mode || !['test', 'staging', 'production'].includes(mode)) reject('CONFIGURATION', 'Entorno R2 explícito requerido.');
  if ((mode === 'test' && env.SNIPERS_ENVIRONMENT && env.SNIPERS_ENVIRONMENT !== 'local')
    || (mode !== 'test' && env.SNIPERS_ENVIRONMENT !== mode)
    || (env.VERCEL_ENV && (env.VERCEL_ENV === 'production' ? mode !== 'production' : mode === 'production'))
    || (env.VERCEL_ENV && Object.keys(env).some(k => /^SNIPERS_R2_PRODUCTION_/.test(k) && env[k]) && env.VERCEL_ENV !== 'production')) {
    reject('CONFIGURATION', 'Configuración R2 cruzada.');
  }
  const prefix = `SNIPERS_R2_${mode.toUpperCase()}_`;
  for (const other of ['TEST', 'STAGING', 'PRODUCTION']) {
    if (other !== mode.toUpperCase() && Object.keys(env).some(k => k.startsWith(`SNIPERS_R2_${other}_`) && env[k])) reject('CONFIGURATION', 'Credenciales de varios entornos no permitidas.');
  }
  const account = env[`${prefix}ACCOUNT_ID`], bucket = env[`${prefix}BUCKET`];
  const accessKeyId = env[`${prefix}ACCESS_KEY_ID`], secretAccessKey = env[`${prefix}SECRET_ACCESS_KEY`];
  const bucketPrefix = mode === 'production' ? 'prod' : mode;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !bucket
    || !new RegExp(`^snipers-${bucketPrefix}-[a-z0-9][a-z0-9-]{0,49}$`).test(bucket) || !accessKeyId || !secretAccessKey) reject('CONFIGURATION', 'Falta configuración R2 del entorno seleccionado.');
  let endpoint = `https://${account}.r2.cloudflarestorage.com`;
  if (env.SNIPERS_UPLOAD_FIXTURE_ORIGIN) {
    const db = new URL(env.DATABASE_URL ?? 'https://invalid.invalid');
    if (mode !== 'test' || env.SNIPERS_PHASE3B2B_LOCAL !== '1' || env.SNIPERS_ENVIRONMENT !== 'local'
      || db.hostname !== '127.0.0.1' || db.port !== '55432' || db.pathname !== '/snipers_dev' || db.username !== 'snipers_local'
      || env.SNIPERS_UPLOAD_FIXTURE_ORIGIN !== 'http://127.0.0.1:3101') reject('CONFIGURATION', 'Fixture local no autorizado.');
    endpoint = env.SNIPERS_UPLOAD_FIXTURE_ORIGIN;
  }
  return { bucket, endpoint, credentials: { accessKeyId, secretAccessKey } };
}

export function createR2Storage(env: Readonly<Record<string, string | undefined>> = process.env): MultipartStorage & ValidationStorage & DeliveryStorage & CleanupStorage {
  const { bucket, endpoint, credentials } = r2Config(env);
  // SDK automatic retries must not repeat uncertain writes. The processor owns recovery.
  const client = new S3Client({ region: 'auto', endpoint, credentials, maxAttempts: 1, forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000, throwOnRequestTimeout: true } });
  const missing = (error: unknown) => ['NoSuchKey', 'NotFound', 'NoSuchUpload'].includes((error as { name?: string }).name ?? '');
  return {
    async listMultipart(key,cursor,signal) {
      const r=await client.send(new ListMultipartUploadsCommand({Bucket:bucket,Prefix:key,MaxUploads:100,
        ...(cursor?{KeyMarker:cursor.keyMarker,UploadIdMarker:cursor.uploadIdMarker}:{})}),{abortSignal:signal});
      if(typeof r.IsTruncated!=='boolean'||(r.Uploads??[]).some(u=>!u.Key||!u.UploadId)
        ||(r.IsTruncated&&(!r.NextKeyMarker||!r.NextUploadIdMarker))) throw new Error('MULTIPART_RESPONSE_INVALID');
      return {uploads:(r.Uploads??[]).map(u=>({key:u.Key!,multipartId:u.UploadId!})),
        next:r.IsTruncated?{keyMarker:r.NextKeyMarker!,uploadIdMarker:r.NextUploadIdMarker!}:null};
    },
    async deleteObject(key,signal) {
      await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
    },
    async inspectDelivery(key,mime,size,uploadId,signal) {
      const r=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:signal});
      if(r.ContentType!==mime||r.ContentLength!==size||r.Metadata?.['snipers-upload-id']!==uploadId
        ||r.ContentDisposition!==downloadDisposition(uploadId,mime)||r.CacheControl!=='private, no-store') {
        reject('CONFIGURATION','El definitivo requiere una nueva carga con metadatos de entrega.');
      }
    },
    async signRead(key,now,expiresAt) {
      const seconds=Math.floor((expiresAt.getTime()-now.getTime())/1000);
      if(seconds<1||seconds>120)reject('VALIDATION','Vigencia de firma inválida.');
      return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:seconds,signingDate:now});
    },
    async read(key, signal) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      if (!(r.Body instanceof Readable)) throw new Error('Missing readable object body');
      return r.Body;
    },
    async putNew(key, file, size, mime, uploadId, signal) {
      const body = createReadStream(file, { highWaterMark: 64 * 1024 });
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: size,
          IfNoneMatch: '*', ContentType: mime, ContentDisposition:downloadDisposition(uploadId,mime), CacheControl: 'private, no-store', Metadata: { 'snipers-upload-id': uploadId } }), { abortSignal: signal });
      } finally { body.destroy(); }
    },
    async create(key, mimeType, uploadId, signal) {
      const r = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key,
        ContentType: mimeType, CacheControl: 'private, no-store', Metadata: { 'snipers-upload-id': uploadId } }), { abortSignal: signal });
      if (!r.UploadId) throw new Error('Missing multipart identity');
      return r.UploadId;
    },
    async listParts(key, multipartId, signal) {
      const r = await client.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: multipartId, MaxParts: 1000 }), { abortSignal: signal });
      // At most 32 parts are legitimate. Never silently accept a truncated list.
      if (r.IsTruncated || !r.Parts) throw new Error('Invalid parts response');
      return r.Parts.map(p => ({ partNumber: p.PartNumber ?? 0, etag: p.ETag ?? '', sizeBytes: p.Size ?? -1 }));
    },
    async complete(key, multipartId, parts, signal) {
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: multipartId,
        MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) } }), { abortSignal: signal });
    },
    async head(key, signal) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
        return { sizeBytes: r.ContentLength ?? -1, uploadId: r.Metadata?.['snipers-upload-id'] ?? null };
      } catch (error) { if (missing(error)) return null; throw error; }
    },
    async signPart(key, multipartId, partNumber, bytes, expiresAt) {
      const seconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      if (seconds < 1) reject('INVALID_STATE', 'Firma vencida.');
      return getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: multipartId,
        PartNumber: partNumber, ContentLength: bytes }), { expiresIn: seconds, signableHeaders: new Set(['content-length']) });
    },
    async abort(key, multipartId, signal) {
      try { await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: multipartId }), { abortSignal: signal }); }
      catch (error) { if (!missing(error)) throw error; }
    },
  };
}
