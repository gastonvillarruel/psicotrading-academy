import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import type {Pool} from 'pg';
import type {Actor} from '../../src/lib/snipers/permissions';
import {createClass} from '../../src/lib/snipers/content';
import {startUpload,completeUpload} from '../../src/lib/snipers/uploads';
import {processUploadOnce} from '../../src/lib/snipers/upload-processor';
import {processValidationOnce} from '../../src/lib/snipers/file-processor';
import type {MultipartStorage,DeliveryStorage} from '../../src/lib/snipers/upload-storage';
import type {ValidationStorage} from '../../src/lib/snipers/file-validation';
export const body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Material privado 3B-2D'}]}]};
export const op=()=>randomUUID();
export class StorageDouble implements MultipartStorage,ValidationStorage,DeliveryStorage {
  objects=new Map<string,Buffer>();multipart=new Map<string,string>();uploadIds=new Map<string,string>();signed:string[]=[];inspections=0;
  payload=Buffer.from('%PDF-1.7\nfixture: analysis deliberately simulated\n%%EOF');
  async create(key:string,_mime:string,uploadId:string){const id=op();this.multipart.set(id,key);this.uploadIds.set(key,uploadId);return id;}
  async listParts(){return [{partNumber:1,etag:'fixture',sizeBytes:this.payload.length}];}
  async complete(key:string){this.objects.set(key,this.payload);}
  async head(key:string){const b=this.objects.get(key);return b?{sizeBytes:b.length,uploadId:this.uploadIds.get(key)??null}:null;}
  async signPart():Promise<string>{throw Error('unused');}
  async abort(){}
  async read(key:string){const bytes=this.objects.get(key);if(!bytes)throw Error('missing');return Readable.from([bytes]);}
  async putNew(key:string,file:string){if(this.objects.has(key))throw Error('overwrite');this.objects.set(key,await readFile(file));}
  async inspectDelivery(){this.inspections++;}
  async signRead(key:string,now:Date,expiresAt:Date){if(expiresAt.getTime()-now.getTime()>120000)throw Error('TTL');this.signed.push(key);return `https://private.invalid/${encodeURIComponent(key)}?signature=controlled`;}
}
export async function verified(pool:Pool,actor:Actor,type:'MP3'|'PDF'='PDF',storage=new StorageDouble(),classId?:string) {
  classId??=(await createClass(pool,actor,{operationId:op(),title:`3B-2D ${op()}`,body,classDate:new Date().toISOString(),categoryId:null})).result.id;
  const upload=await startUpload(pool,actor,{operationId:op(),classId,name:`Archivo ${type}`,file:{type,mimeType:type==='MP3'?'audio/mpeg':'application/pdf',sizeBytes:storage.payload.length},expectedSha256:createHash('sha256').update(storage.payload).digest('hex')});
  await processUploadOnce(pool,storage,undefined,upload.uploadId);
  await completeUpload(pool,actor,{operationId:op(),uploadId:upload.uploadId,parts:[{partNumber:1,etag:'fixture'}]});
  await processUploadOnce(pool,storage,undefined,upload.uploadId);
  await processValidationOnce(pool,storage,{async analyze(){return {signatureVersion:'controlled-daily-1',signaturePublishedAt:new Date(Date.now()-3600000)};}},undefined,upload.uploadId);
  const state=(await pool.query('SELECT r.status,j."errorCode" FROM "SnipersResource" r JOIN "SnipersFileJob" j ON j."resourceId"=r.id AND j.kind=\'PROCESS_UPLOAD\' WHERE r.id=$1',[upload.resourceId])).rows[0];
  if(state.status!=='VERIFIED')throw Error(`Fixture no verificado: ${JSON.stringify(state)}`);
  return {...upload,classId,storage};
}
