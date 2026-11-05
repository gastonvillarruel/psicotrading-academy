import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {requireRunner,verifyDatabase} from '../phase1/guard';
import {createR2Storage} from '../../src/lib/snipers/upload-storage';

test('3B-2E: SDK real contra HTTP loopback, paginación, errores y cancelación',{timeout:15000},async()=>{
  const p=requireRunner();verifyDatabase(p);
  const requests:{method:string;path:string;prefix:string|null;keyMarker:string|null;uploadMarker:string|null}[]=[];
  let mode='normal',deletes=0;
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url!,'http://127.0.0.1:3101');
    requests.push({method:req.method!,path:u.pathname,prefix:u.searchParams.get('prefix'),keyMarker:u.searchParams.get('key-marker'),uploadMarker:u.searchParams.get('upload-id-marker')});
    res.setHeader('Content-Type','application/xml');
    if(mode==='denied'){res.writeHead(403);res.end('<Error><Code>AccessDenied</Code></Error>');return;}
    if(mode==='hang')return;
    if(req.method==='GET'){
      const second=u.searchParams.has('key-marker');
      res.end(`<ListMultipartUploadsResult><Bucket>snipers-test-cleanup</Bucket><IsTruncated>${!second}</IsTruncated>${!second&&mode!=='malformed'?'<NextKeyMarker>snipers/temporary/key</NextKeyMarker><NextUploadIdMarker>remote-1</NextUploadIdMarker>':''}${second?'':'<Upload><Key>snipers/temporary/key</Key><UploadId>remote-1</UploadId></Upload>'}</ListMultipartUploadsResult>`);return;
    }
    if(req.method==='DELETE'){
      deletes++;if(mode==='failed'){res.writeHead(503);res.end('<Error><Code>ServiceUnavailable</Code></Error>');return;}
      if(u.searchParams.has('uploadId')){res.writeHead(404);res.end('<Error><Code>NoSuchUpload</Code></Error>');return;}
      res.writeHead(204);res.end();return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
  const storage=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-cleanup',
    SNIPERS_R2_TEST_ACCESS_KEY_ID:'fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',
    SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_ENVIRONMENT:'local',DATABASE_URL:p.DATABASE_URL});
  const key='snipers/temporary/key',signal=AbortSignal.timeout(10000);
  try{
    const first=await storage.listMultipart(key,null,signal);assert.equal(first.uploads[0].key,key);assert.ok(first.next);
    const second=await storage.listMultipart(key,first.next,signal);assert.equal(second.next,null);assert.deepEqual(second.uploads,[]);
    assert.deepEqual(requests[1],{method:'GET',path:'/snipers-test-cleanup/',prefix:key,keyMarker:key,uploadMarker:'remote-1'});
    await storage.abort(key,'remote-1',signal);await storage.deleteObject(key,signal);assert.equal(await storage.head(key,signal),null);
    assert.equal(deletes,2);assert.ok(requests.filter(r=>r.method==='DELETE').every(r=>r.path===`/snipers-test-cleanup/${key}`));
    mode='malformed';await assert.rejects(storage.listMultipart(key,null,signal),/MULTIPART_RESPONSE_INVALID/);
    mode='denied';await assert.rejects(storage.head(key,signal),e=>(e as {$metadata:{httpStatusCode:number}}).$metadata.httpStatusCode===403);
    mode='failed';const before=deletes;await assert.rejects(storage.deleteObject(key,signal));assert.equal(deletes,before+1,'SDK no repite DELETE ambiguo');
    mode='hang';const start=Date.now();await assert.rejects(storage.deleteObject(key,AbortSignal.timeout(100)));assert.ok(Date.now()-start<2000);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
