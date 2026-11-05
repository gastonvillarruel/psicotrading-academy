// Server-only technical evidence. Never serialize the error, message, stack or response.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const types=new Set(['Error','AggregateError','TypeError','RangeError','ReferenceError','SyntaxError','TimeoutError','AbortError',
  'S3ServiceException','CredentialsProviderError','NetworkingError','AccessDenied','Forbidden','InvalidRequest',
  'InvalidArgument','InvalidAccessKeyId','SignatureDoesNotMatch','RequestTimeTooSkewed','ExpiredToken',
  'NoSuchBucket','InvalidBucketName','NotImplemented','ServiceUnavailable','InternalError','SlowDown',
  'RequestTimeout','BadDigest','InvalidDigest','ChecksumMismatchError','UnknownEndpoint','InvalidEndpoint']);
const codes=new Set([...types,'EACCES','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','EPIPE',
  'EHOSTUNREACH','ENETUNREACH','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_INVALID_CHAR','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE',
  'ERR_STREAM_PREMATURE_CLOSE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ABORT_ERR',
  'LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED']);
export const MULTIPART_DIAGNOSTIC_PREFIX='SNIPERS_MULTIPART_CREATE_DIAGNOSTIC ';
type Context={uploadId:string;jobId:string;generation:number};
function field(value:unknown,key:string):unknown{
  try{return value!==null&&(typeof value==='object'||typeof value==='function')?(value as Record<string,unknown>)[key]:undefined;}
  catch{return undefined;}
}
function allowed(value:unknown,list:Set<string>){return typeof value==='string'&&list.has(value)?value:null;}
function exceptionCode(error:unknown){
  const code=allowed(field(error,'code'),codes)??allowed(field(error,'Code'),codes);
  if(code)return code;
  // Recognize fixed internal failures without logging arbitrary exception messages.
  if(field(error,'message')==='Missing multipart identity')return 'MISSING_MULTIPART_IDENTITY';
  if(field(error,'message')==='LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED')return 'LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED';
  const type=allowed(field(error,'name'),types);
  return type&&!['Error','TypeError','RangeError','ReferenceError','SyntaxError'].includes(type)?type:null;
}
export function multipartCreateDiagnostic(error:unknown,context:Context){
  const metadata=field(error,'$metadata'),status=field(metadata,'httpStatusCode'),request=field(metadata,'requestId');
  // R2/Cloudflare hex, UUID or ray identifiers only; never arbitrary opaque strings.
  const safeRequestId=typeof request==='string'&&/^(?:[a-fA-F0-9]{16,128}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}|[a-fA-F0-9]{16}-[A-Z]{3})$/.test(request)?request:null;
  const cause=field(error,'cause');
  const uuid=(value:string)=>/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value)?value:null;
  return {event:'MULTIPART_CREATE_FAILED',stage:'CREATE_MULTIPART',uploadId:uuid(context.uploadId),jobId:uuid(context.jobId),
    generation:Number.isSafeInteger(context.generation)&&context.generation>0?context.generation:null,
    exceptionType:allowed(field(error,'name'),types)??'UnclassifiedError',exceptionCode:exceptionCode(error),
    httpStatus:typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?status:null,
    requestId:safeRequestId,causeType:allowed(field(cause,'name'),types),causeCode:exceptionCode(cause)};
}
export function reportMultipartCreateFailure(error:unknown,context:Context):void{
  // Diagnostics must never change the existing CREATE_UNCERTAIN/fencing behavior.
  try{
    const json=JSON.stringify({...multipartCreateDiagnostic(error,context),recordedAt:new Date().toISOString()});
    try{console.error(MULTIPART_DIAGNOSTIC_PREFIX+json);}catch{/* logging is best-effort */}
    if(process.env.SNIPERS_R2_LOCAL_PROCESS==='1'&&process.env.SNIPERS_ENVIRONMENT==='local'){
      const file=path.resolve('.local/snipers/r2-multipart-diagnostics.jsonl');
      mkdirSync(path.dirname(file),{recursive:true});
      appendFileSync(file,json+'\n',{encoding:'utf8',mode:0o600});
    }
  }catch{/* Never replace the original transfer outcome with a diagnostic failure. */}
}
