/* eslint @typescript-eslint/no-require-imports: "off" */
// HTTP fixture with an independent SigV4 GET verifier. Does not certify Cloudflare implementation.
const http=require('node:http'),crypto=require('node:crypto');
const accessKey='local-delivery-key',secret='local-delivery-secret';
const encode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
function authorized(url,host){
  const q=url.searchParams,date=q.get('X-Amz-Date'),credential=q.get('X-Amz-Credential')?.split('/'),ttl=Number(q.get('X-Amz-Expires'));
  if(q.get('X-Amz-Algorithm')!=='AWS4-HMAC-SHA256'||q.get('X-Amz-SignedHeaders')!=='host'||!date||!credential||credential[0]!==accessKey||ttl<1||ttl>120)return false;
  const issued=Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z'));
  if(!Number.isFinite(issued)||Date.now()>issued+ttl*1000||issued>Date.now()+1000)return false;
  const query=[...q].filter(([k])=>k!=='X-Amz-Signature').map(([k,v])=>[encode(k),encode(v)]).sort(([a,av],[b,bv])=>a<b?-1:a>b?1:av<bv?-1:av>bv?1:0).map(p=>p.join('=')).join('&');
  const canonical=`GET\n${url.pathname}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const hash=crypto.createHash('sha256').update(canonical).digest('hex'),scope=credential.slice(1).join('/');
  const hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
  const key=hmac(hmac(hmac(hmac(`AWS4${secret}`,credential[1]),credential[2]),credential[3]),'aws4_request');
  const expected=hmac(key,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash}`).toString('hex');
  const actual=q.get('X-Amz-Signature')??'';return actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
}
async function startDeliveryFixture(){
  const objects=new Map(),requests=[];let failGets=0;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:3101'),key=url.pathname,origin=req.headers.origin;
    if(origin&&origin!=='http://127.0.0.1:3100'){res.writeHead(403);res.end();return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','Content-Disposition, Content-Range, Accept-Ranges');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'range'});res.end();return;}
    if(req.method==='PUT'){
      if(objects.has(key)||req.headers['if-none-match']!=='*'){res.writeHead(412);res.end();return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);objects.set(key,{bytes:Buffer.concat(chunks),mime:req.headers['content-type'],disposition:req.headers['content-disposition'],cache:req.headers['cache-control'],uploadId:req.headers['x-amz-meta-snipers-upload-id']});res.writeHead(200);res.end();return;
    }
    const o=objects.get(key);if(!o){res.writeHead(404);res.end();return;}
    if(req.method==='GET'){
      const valid=authorized(url,req.headers.host);requests.push({key,range:req.headers.range??null,valid});
      if(!valid){res.writeHead(403);res.end();return;}
      if(failGets>0){failGets--;res.writeHead(503);res.end();return;}
    }else if(req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const headers={'content-type':o.mime,'content-disposition':o.disposition,'cache-control':o.cache,'accept-ranges':'bytes','x-amz-meta-snipers-upload-id':o.uploadId};
    if(req.method==='HEAD'){res.writeHead(200,{...headers,'content-length':o.bytes.length});res.end();return;}
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):o.bytes.length-1,o.bytes.length-1);if(start>end){res.writeHead(416,{'content-range':`bytes */${o.bytes.length}`});res.end();return;}res.writeHead(206,{...headers,'content-length':end-start+1,'content-range':`bytes ${start}-${end}/${o.bytes.length}`});res.end(o.bytes.subarray(start,end+1));return;}
    res.writeHead(200,{...headers,'content-length':o.bytes.length});res.end(o.bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3101,'127.0.0.1',resolve);});
  return {objects,requests,failNextGets:n=>{failGets=n;},stop:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
module.exports={startDeliveryFixture,accessKey,secret};
