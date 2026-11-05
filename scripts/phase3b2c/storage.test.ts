import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { requireRunner } from '../phase1/guard';
import { createR2Storage } from '../../src/lib/snipers/upload-storage';
import { inspectBytes } from '../../src/lib/snipers/file-validation';

test('SDK S3 real contra HTTP loopback: GET completo, PUT condicional, colisión sin sobrescritura ni retry', {timeout:10000}, async () => {
  const p=requireRunner();
  const bytes=Buffer.from('controlled private file bytes'), objects=new Map<string,Buffer>();
  const dir=await mkdtemp(path.join(os.tmpdir(),'snipers-storage-test-')), file=path.join(dir,'input');
  await writeFile(file,bytes);
  let puts=0;
  const server=createServer(async(request,response)=>{
    const key=new URL(request.url!,'http://127.0.0.1:3101').pathname;
    if(request.method==='PUT') {
      puts++;assert.equal(request.headers['if-none-match'],'*');assert.equal(request.headers['content-length'],String(bytes.length));
      const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
      if(objects.has(key)){response.writeHead(412,{'content-type':'application/xml'});response.end('<Error><Code>PreconditionFailed</Code></Error>');return;}
      objects.set(key,Buffer.concat(chunks));response.writeHead(200,{etag:'"local"'});response.end();return;
    }
    if(request.method==='GET' && key.endsWith('/stalled')){response.writeHead(200,{'content-length':bytes.length});response.flushHeaders();return;}
    if(request.method==='GET' && objects.has(key)){const data=objects.get(key)!;response.writeHead(200,{'content-length':data.length});response.end(data);return;}
    response.writeHead(404);response.end();
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
  const sdk=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-validation',
    SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-fixture',
    SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_ENVIRONMENT:'local',DATABASE_URL:p.DATABASE_URL});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000),signal=controller.signal;
  try {
    const key='snipers/final/fixture/new-key';
    await sdk.putNew(key,file,bytes.length,'application/pdf','fixture-upload',signal);
    const expected={type:'PDF' as const,mimeType:'application/pdf',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    assert.equal((await inspectBytes(await sdk.read(key,signal),expected,signal)).sha256,expected.sha256);
    await assert.rejects(sdk.putNew(key,file,bytes.length,'application/pdf','fixture-upload',signal),error=>(error as {name:string}).name==='PreconditionFailed');
    assert.equal(puts,2);assert.equal(objects.size,1);assert.deepEqual([...objects.values()][0],bytes);
    // Actual SDK response/body remains open after headers. The read deadline must destroy it.
    const stalledSignal=AbortSignal.any([signal,AbortSignal.timeout(100)]);
    const stalled=await sdk.read('snipers/final/fixture/stalled',stalledSignal);
    await assert.rejects(inspectBytes(stalled,expected,stalledSignal),{name:'AbortError'});
    assert.equal(stalled.destroyed,true);assert.equal(controller.signal.aborted,false);
  } finally {
    clearTimeout(timer);controller.abort();server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(dir,{recursive:true,force:true});
  }
});
