/* eslint @typescript-eslint/no-require-imports: "off" */
// Test-only S3-shaped HTTP fixture. Does NOT certify R2/SigV4 enforcement or Cloudflare behavior.
const http=require('node:http'),{randomUUID,createHash}=require('node:crypto');
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function startStorageFixture(){
  const uploads=new Map(),objects=new Map();const state={failPuts:0,puts:0,completes:0,creates:0,aborts:0};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1:3101'),key=url.pathname,origin=req.headers.origin;
      if(origin&&origin!=='http://127.0.0.1:3100'){res.writeHead(403);res.end();return;}
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Expose-Headers','ETag');res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','PUT');res.setHeader('Access-Control-Allow-Headers','content-length');res.writeHead(204);res.end();return;}
      if(req.method==='HEAD'){const o=objects.get(key);if(!o){res.writeHead(404);res.end();return;}res.setHeader('Content-Length',o.sizeBytes);res.setHeader('x-amz-meta-snipers-upload-id',o.uploadId);res.writeHead(200);res.end();return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      res.setHeader('Content-Type','application/xml');
      if(req.method==='POST'&&url.searchParams.has('uploads')){
        const id=randomUUID();uploads.set(id,{key,uploadId:req.headers['x-amz-meta-snipers-upload-id'],parts:new Map()});state.creates++;
        res.end(`<InitiateMultipartUploadResult><Bucket>snipers-test-fixture</Bucket><Key>${xml(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);return;
      }
      const id=url.searchParams.get('uploadId'),u=uploads.get(id);
      if(!u||u.key!==key){res.writeHead(404);res.end('<Error><Code>NoSuchUpload</Code></Error>');return;}
      if(req.method==='PUT'){
        state.puts++;if(state.failPuts>0){state.failPuts--;res.writeHead(503);res.end('<Error><Code>SlowDown</Code></Error>');return;}
        const number=Number(url.searchParams.get('partNumber')),etag=`"${createHash('md5').update(body).digest('hex')}"`;
        u.parts.set(number,{partNumber:number,etag,sizeBytes:body.length});res.setHeader('ETag',etag);res.writeHead(200);res.end();return;
      }
      if(req.method==='GET'){
        res.end(`<ListPartsResult><Bucket>snipers-test-fixture</Bucket><Key>${xml(key)}</Key><UploadId>${id}</UploadId><IsTruncated>false</IsTruncated>${[...u.parts.values()].sort((a,b)=>a.partNumber-b.partNumber).map(p=>`<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xml(p.etag)}</ETag><Size>${p.sizeBytes}</Size></Part>`).join('')}</ListPartsResult>`);return;
      }
      if(req.method==='POST'){
        state.completes++;objects.set(key,{sizeBytes:[...u.parts.values()].reduce((n,p)=>n+p.sizeBytes,0),uploadId:u.uploadId});uploads.delete(id);
        res.end(`<CompleteMultipartUploadResult><Location>http://127.0.0.1:3101${xml(key)}</Location><Bucket>snipers-test-fixture</Bucket><Key>${xml(key)}</Key><ETag>"fixture-final"</ETag></CompleteMultipartUploadResult>`);return;
      }
      if(req.method==='DELETE'){state.aborts++;uploads.delete(id);res.writeHead(204);res.end();return;}
      res.writeHead(405);res.end();
    }catch{res.writeHead(500);res.end('<Error><Code>FixtureFailure</Code></Error>');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
  return {state,uploads,objects,stop:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
module.exports={startStorageFixture};
