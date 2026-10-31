import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {requireRunner} from '../phase1/guard';
import {createR2Storage,downloadDisposition} from '../../src/lib/snipers/upload-storage';

test('SDK real: metadatos persistidos, GET sin overrides, firma local y TTL acotado',async()=>{
  const p=requireRunner(),objects=new Map<string,{mime:string;disposition:string;cache:string;uploadId:string;bytes:Buffer}>();
  let heads=0,gets=0,puts=0;
  const server=createServer(async(req,res)=>{
    const key=new URL(req.url!,'http://127.0.0.1:3101').pathname;
    if(req.method==='PUT'){puts++;assert.equal(req.headers['if-none-match'],'*');const chunks:Buffer[]=[];for await(const b of req)chunks.push(Buffer.from(b));objects.set(key,{mime:String(req.headers['content-type']),disposition:String(req.headers['content-disposition']),cache:String(req.headers['cache-control']),uploadId:String(req.headers['x-amz-meta-snipers-upload-id']),bytes:Buffer.concat(chunks)});res.writeHead(200);res.end();return;}
    if(req.method==='HEAD'){heads++;const o=objects.get(key);if(!o){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':o.mime,'content-length':o.bytes.length,'content-disposition':o.disposition,'cache-control':o.cache,'x-amz-meta-snipers-upload-id':o.uploadId});res.end();return;}
    gets++;res.writeHead(500);res.end();
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
  const adapter=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-delivery',SNIPERS_R2_TEST_ACCESS_KEY_ID:'fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_ENVIRONMENT:'local',DATABASE_URL:p.DATABASE_URL});
  const dir=await mkdtemp(path.join(os.tmpdir(),'snipers-delivery-')),file=path.join(dir,'input');await writeFile(file,'test bytes');
  try{
    for(const mime of ['audio/mpeg','application/pdf']){
      const uploadId='94c3189e-a24e-4bb4-91e7-857844829d3f',key=`snipers/final/${mime.split('/')[1]}`,signal=AbortSignal.timeout(10000);
      await adapter.putNew(key,file,10,mime,uploadId,signal);await adapter.inspectDelivery(key,mime,10,uploadId,signal);
      const o=[...objects.values()].at(-1)!;assert.equal(o.disposition,downloadDisposition(uploadId,mime));assert.equal(o.cache,'private, no-store');assert.equal(o.mime,mime);
      const now=new Date(),url=new URL(await adapter.signRead(key,now,new Date(now.getTime()+120000)));
      assert.equal(url.searchParams.get('X-Amz-Expires'),'120');assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'host');assert.ok(url.searchParams.get('X-Amz-Signature'));assert.equal(url.pathname,`/snipers-test-delivery/${key}`);
      assert.equal([...url.searchParams.keys()].some(k=>k.startsWith('response-')),false);assert.equal(gets,0,'No GET remoto durante la firma');
      await assert.rejects(adapter.signRead(key,now,new Date(now.getTime()+121000)),e=>(e as {code:string}).code==='VALIDATION');
      o.disposition='';await assert.rejects(adapter.inspectDelivery(key,mime,10,uploadId,signal),e=>(e as {code:string}).code==='CONFIGURATION');
      assert.equal(puts,mime==='audio/mpeg'?1:2,'No se reescribe el objeto histórico');
    }
    assert.equal(heads,4);assert.equal(downloadDisposition('../bad\r\n".exe','audio/mpeg'),'attachment; filename="snipers-badexe.mp3"');
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
