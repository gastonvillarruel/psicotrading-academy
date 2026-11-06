/* eslint @typescript-eslint/no-require-imports: "off" */
// Local harness: actual React components, gateways, PostgreSQL and S3 SDK; HTTP storage is simulated.
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID,randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg'),{encode,decode}=require('next-auth/jwt');
const {build}=require('esbuild'),{chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts'),{readProfile,npmBackup,isolatedEnv}=require('../phase0/local.ts');
const {assertPortFree}=require('../phase3a/server.cjs');
const {createR2Storage}=require('../../src/lib/snipers/upload-storage.ts');
const {createUploadGateway}=require('../../src/lib/snipers/upload-gateway.ts');
const {createSnipersGateway}=require('../../src/lib/snipers/gateway.ts');
const {advancePrivateUpload}=require('../../src/lib/snipers/basic-upload-processor.ts');
const {respond}=require('../../src/lib/snipers/action-result.ts');
const content=require('../../src/lib/snipers/content.ts');
const {m4aMigration}=require('../snipers-launch/database.ts');

async function main(){
  const local=localProfile();verifyDatabase(local);await assertPortFree(3100);await assertPortFree(3101);
  const dir=path.resolve('.local/snipers/m4a'),previous=path.resolve('.local/snipers/basic-files');
  const evidence=fs.readdirSync(previous).filter(n=>/^evidence-.*\.json$/.test(n)).map(n=>({n,time:fs.statSync(path.join(previous,n)).mtimeMs})).sort((a,b)=>b.time-a.time)[0];
  assert.ok(evidence,'Run files.test.ts first');
  const database=JSON.parse(fs.readFileSync(path.join(previous,evidence.n))).database;
  assert.match(database,/^snipers_basic_[a-f0-9]{8}$/);
  const profileFile=path.join(previous,`${database.slice(-8)}.profile`),profile=readProfile(profileFile);
  const url=new URL(profile.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,`/${database}`);assert.equal(url.username,'snipers_local');
  const backup=npmBackup(profileFile),secret=randomBytes(32).toString('hex');
  Object.assign(process.env,isolatedEnv(local),{SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_NETWORK_TRACE:path.join(dir,'browser-network.jsonl')});
  require('../phase3a/network-guard.cjs');
  const pool=new Pool({connectionString:profile.DATABASE_URL,max:5,connectionTimeoutMillis:5000});
  const base='http://127.0.0.1:3100',origin='http://127.0.0.1:3101',objects=new Map(),uploads=new Map(),requests=[],errors=[];
  const xml=(res,text)=>{res.writeHead(200,{'content-type':'application/xml'});res.end(text);};
  const body=async req=>{const chunks=[];for await(const b of req)chunks.push(b);return Buffer.concat(chunks);};
  const hash=b=>createHash('sha256').update(b).digest('hex');
  let provider,app,browser;
  try{
    assert.equal((await pool.query('SELECT current_database() AS db, current_user AS role')).rows[0].db,database);
    assert.equal((await pool.query('SELECT 1 FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',[m4aMigration])).rowCount,1);
    const actor=()=>({userId:randomUUID(),activeSessionId:randomUUID(),singleSession:true});
    const editor=actor(),student=actor(),outsider=actor();
    for(const who of [editor,student,outsider])await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp())`,[who.userId,`${who.userId}@local.invalid`,who.activeSessionId]);
    await pool.query(`INSERT INTO "UserPermission" (id,"userId",permission) VALUES ($1,$2,'SNIPERS_ADMIN')`,[randomUUID(),editor.userId]);
    const plan=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code LIMIT 1')).rows[0].id,membership=randomUUID();
    await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,clock_timestamp())',[membership,student.userId,plan]);
    await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','Local browser M4A',$4)`,[randomUUID(),membership,plan,editor.userId]);
    const classId=(await content.createClass(pool,editor,{operationId:randomUUID(),title:'M4A local browser',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Prueba local de audio privado.'}]}]},classDate:new Date().toISOString(),categoryId:null})).result.id;
    provider=http.createServer(async(req,res)=>{
      try{
        const u=new URL(req.url,origin),key=decodeURIComponent(u.pathname),id=u.searchParams.get('uploadId');
        res.setHeader('access-control-allow-origin',base);res.setHeader('access-control-allow-methods','GET,HEAD,PUT,POST,OPTIONS');res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-expose-headers','ETag,Content-Range,Content-Length');
        if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
        requests.push({method:req.method,key});
        if(req.method==='POST'&&u.searchParams.has('uploads')){const uid=randomUUID();uploads.set(uid,{key,parts:new Map(),creator:req.headers['x-amz-meta-snipers-upload-id']});xml(res,`<InitiateMultipartUploadResult><UploadId>${uid}</UploadId></InitiateMultipartUploadResult>`);return;}
        if(req.method==='PUT'&&id){const bytes=await body(req),part=Number(u.searchParams.get('partNumber')),etag=`"${hash(bytes)}"`;assert.equal(uploads.get(id).key,key);uploads.get(id).parts.set(part,{bytes,etag});res.writeHead(200,{etag});res.end();return;}
        if(req.method==='GET'&&id){const upload=uploads.get(id);assert.equal(upload.key,key);xml(res,`<ListPartsResult><IsTruncated>false</IsTruncated>${[...upload.parts].map(([n,p])=>`<Part><PartNumber>${n}</PartNumber><ETag>${p.etag}</ETag><Size>${p.bytes.length}</Size></Part>`).join('')}</ListPartsResult>`);return;}
        if(req.method==='POST'&&id){await body(req);const upload=uploads.get(id);objects.set(key,{bytes:Buffer.concat([...upload.parts].sort((a,b)=>a[0]-b[0]).map(([,p])=>p.bytes)),headers:{'x-amz-meta-snipers-upload-id':upload.creator}});
          xml(res,'<CompleteMultipartUploadResult><ETag>"local"</ETag></CompleteMultipartUploadResult>');return;}
        if(req.method==='PUT'){assert.equal(req.headers['if-none-match'],'*');assert.ok(!objects.has(key));const bytes=await body(req);objects.set(key,{bytes,headers:Object.fromEntries(['content-type','content-disposition','cache-control','x-amz-meta-snipers-upload-id'].map(n=>[n,req.headers[n]]))});res.writeHead(200,{etag:'"local"'});res.end();return;}
        const item=objects.get(key);if(!item){res.writeHead(404);res.end();return;}
        for(const [name,value]of Object.entries(item.headers))if(value)res.setHeader(name,value);
        res.setHeader('content-length',item.bytes.length);res.setHeader('accept-ranges','bytes');
        if(req.method==='HEAD'){res.end();return;}
        if(req.headers.authorization)assert.match(req.headers.authorization,/^AWS4-HMAC-SHA256 /);
        else{assert.ok(u.searchParams.has('X-Amz-Signature'));assert.ok(Number(u.searchParams.get('X-Amz-Expires'))<=120);}
        const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');
        if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),item.bytes.length-1):item.bytes.length-1;res.setHeader('content-range',`bytes ${start}-${end}/${item.bytes.length}`);res.setHeader('content-length',end-start+1);res.writeHead(206);res.end(item.bytes.subarray(start,end+1));}
        else res.end(item.bytes);
      }catch(e){errors.push(e.message);res.writeHead(500);res.end();}
    });
    await new Promise(r=>provider.listen(3101,'127.0.0.1',r));
    const storage=createR2Storage({SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-m4a',SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:origin,SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_ENVIRONMENT:'local',DATABASE_URL:local.DATABASE_URL});
    const exports=['startSnipersUpload','getSnipersUpload','advanceSnipersUpload','signSnipersUploadPart','completeSnipersUpload','cancelSnipersUpload','signSnipersResource'];
    const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Uploads from './src/components/snipers/PrivateUploads';import Resources from './src/components/snipers/PrivateResources';fetch('/bootstrap').then(r=>r.json()).then(p=>createRoot(document.getElementById('root')).render(<main>{p.editor&&<Uploads classId={p.classId} archived={false}/>}<Resources resources={p.resources}/></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-actions',setup(b){b.onResolve({filter:/^@\/app\/actions\/snipers-(uploads|content)$/},args=>({path:args.path,namespace:'local-actions'}));b.onLoad({filter:/.*/,namespace:'local-actions'},()=>({contents:exports.map(n=>`export const ${n}=async input=>(await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'${n}',input})})).json();`).join('\n'),loader:'js'}));}}]});
    const session=async req=>{const token=/session=([^;]+)/.exec(req.headers.cookie??'')?.[1];const value=token?await decode({token,secret}):null;return value?{user:{id:value.id,activeSessionId:value.activeSessionId}}:null;};
    const config=()=>({enabled:'true',singleSession:'true',secret});
    app=http.createServer(async(req,res)=>{
      try{
        const s=await session(req),u=new URL(req.url,base);
        if(u.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].contents);return;}
        const files=createUploadGateway(pool,async()=>s,config,()=>storage,(who,id)=>advancePrivateUpload(pool,who,id,storage));
        const campus=createSnipersGateway(pool,async()=>s,config,()=>storage);
        if(u.pathname==='/bootstrap'){let resources=[];try{resources=(await campus.getPublishedClass(classId)).resources;}catch{}res.setHeader('content-type','application/json');res.end(JSON.stringify({classId,editor:s?.user.id===editor.userId,resources}));return;}
        if(u.pathname==='/rpc'){
          const {method,input}=JSON.parse((await body(req)).toString()),methods={startSnipersUpload:()=>files.start(input),getSnipersUpload:()=>files.get(input),advanceSnipersUpload:()=>files.advance(input),signSnipersUploadPart:()=>files.sign(input),completeSnipersUpload:()=>files.complete(input),cancelSnipersUpload:()=>files.cancel(input),signSnipersResource:()=>campus.signResource(input)};
          assert.ok(Object.hasOwn(methods,method));res.setHeader('content-type','application/json');res.end(JSON.stringify(await respond(methods[method])));return;
        }
        res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Local Snipers M4A test</title><div id="root"></div><script src="/bundle.js"></script>');
      }catch(e){errors.push(e.message);res.writeHead(500);res.end();}
    });
    await new Promise(r=>app.listen(3100,'127.0.0.1',r));
    browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--no-first-run','--autoplay-policy=no-user-gesture-required']});
    const pageFor=async who=>{const ctx=await browser.newContext({acceptDownloads:true});await ctx.route('**/*',r=>[base,origin].includes(new URL(r.request().url()).origin)?r.continue():r.abort());const value=await encode({secret,token:{id:who.userId,activeSessionId:who.activeSessionId}});await ctx.addCookies([{name:'session',value,url:base,httpOnly:true}]);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);return page;};
    const mentor=await pageFor(editor);await mentor.goto(base);
    const picker=mentor.getByLabel('Archivo MP3, M4A o PDF');assert.match(await picker.getAttribute('accept'),/\.m4a/);
    await picker.setInputFiles('scripts/snipers-m4a/fixtures/sfx.m4a');await mentor.getByRole('button',{name:'Subir archivo privado'}).click();
    try{await mentor.getByText('Archivo verificado. Actualizá el inventario de la clase para vincularlo.').waitFor();}
    catch(e){console.log(JSON.stringify({status:await mentor.getByRole('status').allTextContents(),errors,requests}));throw e;}
    const resource=(await pool.query('SELECT id FROM "SnipersResource" WHERE "classId"=$1',[classId])).rows[0].id;
    await content.linkResource(pool,editor,{operationId:randomUUID(),classId,resourceId:resource,expectedVersion:1,transition:'ATTACH'});
    await content.transitionContent(pool,editor,{operationId:randomUUID(),entity:'CLASS',id:classId,expectedVersion:2,transition:'PUBLISH'});
    const studentPage=await pageFor(student);await studentPage.goto(base);await studentPage.getByRole('button',{name:'Reproducir M4A'}).click();
    await studentPage.waitForFunction(()=>{const a=document.querySelector('audio');return a&&a.currentTime>0.05;});
    assert.ok(await studentPage.locator('audio').evaluate(a=>a.controls&&a.duration>0&&!a.error));
    await studentPage.locator('audio').evaluate(a=>a.pause());
    await studentPage.screenshot({path:path.join(dir,'m4a-edge.png')});
    const download=studentPage.waitForEvent('download');await studentPage.getByRole('button',{name:'Descargar M4A'}).click();const received=await download;
    assert.match(received.suggestedFilename(),/\.m4a$/);const output=path.join(dir,'downloaded.m4a');await received.saveAs(output);assert.equal(hash(fs.readFileSync(output)),hash(fs.readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a')));
    const denied=await pageFor(outsider);await denied.goto(base);const rejection=await denied.evaluate(async resource=>(await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'signSnipersResource',input:{resourceId:resource,mode:'PLAY'}})})).json(),resource);assert.equal(rejection.code,'FORBIDDEN');
    await studentPage.locator('audio').evaluate(a=>a.dispatchEvent(new Event('error')));await studentPage.getByText('No se pudo reproducir el audio en este navegador. Podés reintentar o descargar el archivo original.').waitFor();assert.equal(await studentPage.getByRole('button',{name:'Descargar M4A'}).isEnabled(),true);
    assert.deepEqual(errors,[]);
    const result={passed:true,database,backup,browser:await browser.version(),checks:['real picker and upload UI','multipart S3 SDK through local HTTP','server AAC-LC verification','attach/publish service','authorized student HTML5 time advances','original download hash and extension','unauthorized signing denied','playback error retains download'],storage:'HTTP simulation',nextServerActions:'separate actions.test.cjs; browser bridge uses real gateways',realR2:false,productionMutated:false};
    fs.writeFileSync(path.join(dir,'browser-evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{if(browser)await browser.close();for(const s of [app,provider])if(s){s.closeAllConnections();await new Promise(r=>s.close(r));}await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
