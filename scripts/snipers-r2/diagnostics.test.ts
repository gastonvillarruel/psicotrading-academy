import test from 'node:test';
import assert from 'node:assert/strict';
import { multipartCreateDiagnostic, reportMultipartCreateFailure, MULTIPART_DIAGNOSTIC_PREFIX } from '../../src/lib/snipers/upload-diagnostics';

const context={uploadId:'5733a669-4a68-4b61-86f3-4c16928302e7',jobId:'728b904c-2990-4d8e-aa63-80a108b58d27',generation:1};
test('preserves only safe technical fields from an SDK error',()=>{
  const canary='DO_NOT_LOG_PRIVATE_MATERIAL';
  const error={name:'AccessDenied',Code:'AccessDenied',$metadata:{httpStatusCode:403,requestId:'0123456789abcdef'},
    message:canary,stack:canary,$response:{headers:{authorization:canary},body:canary},credentials:canary,
    signedUrl:'https://private.invalid/?X-Amz-Signature='+canary};
  const event=multipartCreateDiagnostic(error,context);
  assert.equal(event.stage,'CREATE_MULTIPART');assert.equal(event.exceptionType,'AccessDenied');assert.equal(event.exceptionCode,'AccessDenied');
  assert.equal(event.httpStatus,403);assert.equal(event.requestId,'0123456789abcdef');assert.equal(event.uploadId,context.uploadId);
  assert.ok(!JSON.stringify(event).includes(canary));assert.ok(!('message' in event));assert.ok(!('$response' in event));
});
test('records network causes and fixed internal failures without messages',()=>{
  const event=multipartCreateDiagnostic(Object.assign(new TypeError('private message'),{cause:Object.assign(new Error(),{code:'EAI_AGAIN'})}),context);
  assert.equal(event.exceptionType,'TypeError');assert.equal(event.causeType,'Error');assert.equal(event.causeCode,'EAI_AGAIN');
  assert.equal(event.httpStatus,null);assert.equal(event.requestId,null);
  assert.equal(multipartCreateDiagnostic(new Error('Missing multipart identity'),context).exceptionCode,'MISSING_MULTIPART_IDENTITY');
  assert.equal(multipartCreateDiagnostic(new Error('LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED'),context).exceptionCode,'LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED');
});

test('classifies the observed sandbox connection denial without exposing aggregated errors',()=>{
  const error=Object.assign(new AggregateError([new Error('DO_NOT_LOG_PRIVATE_ADDRESS')],'private connection details'),{code:'EACCES'});
  const event=multipartCreateDiagnostic(error,context);
  assert.equal(event.exceptionType,'AggregateError');assert.equal(event.exceptionCode,'EACCES');
  assert.equal(event.httpStatus,null);assert.ok(!JSON.stringify(event).includes('private'));
  assert.ok(!JSON.stringify(event).includes('DO_NOT_LOG_PRIVATE_ADDRESS'));
});
test('rejects arbitrary names, codes, IDs, headers and invalid HTTP statuses',()=>{
  const secret='DO_NOT_LOG_TOKEN';
  const event=multipartCreateDiagnostic({name:secret,code:secret,$metadata:{httpStatusCode:'403',requestId:secret}},context);
  assert.equal(event.exceptionType,'UnclassifiedError');assert.equal(event.exceptionCode,null);assert.equal(event.requestId,null);assert.equal(event.httpStatus,null);
  assert.ok(!JSON.stringify(event).includes(secret));
  const malformed=multipartCreateDiagnostic(null,{uploadId:secret,jobId:secret,generation:NaN});
  assert.equal(malformed.uploadId,null);assert.equal(malformed.jobId,null);assert.equal(malformed.generation,null);
});
test('throwing getters and non-object exceptions cannot break sanitization',()=>{
  const hostile=new Proxy({}, {get(){throw new Error('not logged');}});
  for(const error of [hostile,null,undefined,'private string',42])assert.doesNotThrow(()=>multipartCreateDiagnostic(error,context));
});
test('logs structured output; a broken logger cannot change transfer behavior',()=>{
  const oldConsole=console.error,oldMarker=process.env.SNIPERS_R2_LOCAL_PROCESS;
  delete process.env.SNIPERS_R2_LOCAL_PROCESS; // No diagnostic file or database writes in these tests.
  try{
    const lines:string[]=[];console.error=(line:string)=>{lines.push(line);};
    reportMultipartCreateFailure(new Error('private message'),context);assert.equal(lines.length,1);
    assert.ok(lines[0].startsWith(MULTIPART_DIAGNOSTIC_PREFIX));assert.ok(!lines[0].includes('private message'));
    assert.equal(JSON.parse(lines[0].slice(MULTIPART_DIAGNOSTIC_PREFIX.length)).stage,'CREATE_MULTIPART');
    console.error=()=>{throw new Error('sink unavailable');};
    assert.doesNotThrow(()=>reportMultipartCreateFailure(new Error('private message'),context));
  }finally{console.error=oldConsole;if(oldMarker===undefined)delete process.env.SNIPERS_R2_LOCAL_PROCESS;else process.env.SNIPERS_R2_LOCAL_PROCESS=oldMarker;}
});
