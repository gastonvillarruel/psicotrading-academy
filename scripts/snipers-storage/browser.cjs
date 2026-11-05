/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {isolatedEnv,npmBackup,profilePath}=require('../phase0/local.ts');
const {fresh,retire,testActor,CleanupDouble}=require('./fixtures.ts');
const {verified}=require('../phase3b2d/fixtures.ts');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');

async function main(){
  const p=localProfile();verifyDatabase(p);await assertPortFree(3100);await assertPortFree(3101);
  const backup=npmBackup(profilePath),directory=path.resolve('.local/snipers/storage-management');fs.mkdirSync(directory,{recursive:true});
  const build=JSON.parse(fs.readFileSync(path.join(directory,'build-evidence.json'),'utf8'));
  assert.equal(build.passed,true);assert.ok(path.resolve(build.snapshot).startsWith(directory+path.sep));
  for(const [file,hash]of Object.entries(build.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Rebuild the isolated source snapshot after code changes.');
  const base='http://127.0.0.1:3100',secret=randomBytes(32).toString('hex');
  const env={...isolatedEnv(p),SNIPERS_ENABLED:'true',SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_PHASE3B2B_LOCAL:'1',NEXTAUTH_SECRET:secret,
    NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base,NEXT_TELEMETRY_DISABLED:'1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.resolve('scripts/phase3a/font-responses.cjs'),
    SNIPERS_NETWORK_TRACE:path.join(directory,'browser-network.jsonl'),
    SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-admin',
    SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',
    NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
  const pool=new Pool({connectionString:p.DATABASE_URL,max:4,connectionTimeoutMillis:5000}),errors=[],checks=[],requests=[];
  let server,browser,fixture;const log=fs.createWriteStream(path.join(directory,'browser-server.log'),{flags:'w'});
  try{
    const admin=await testActor(pool,'SNIPERS_ADMIN'),editor=await testActor(pool,'SNIPERS_CONTENT_EDITOR'),student=await testActor(pool);
    const protectedStorage=new CleanupDouble(),protectedFile=await verified(pool,admin,'PDF',protectedStorage);
    const f=await fresh(pool,admin,{final:true,name:'Guía de práctica emocional.pdf'});await retire(pool,f);
    const target=f.objects.find(o=>o.kind==='FINAL'),other=f.objects.find(o=>o.kind==='TEMPORARY');
    const all=new Map([...f.storage.objects,...protectedStorage.objects]),ids=new Map([...f.storage.uploadIds,...protectedStorage.uploadIds]);
    fixture=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://127.0.0.1:3101'),key=decodeURIComponent(url.pathname.replace(/^\/snipers-test-admin\/?/,''));
      requests.push({method:req.method,key});
      if(req.method==='HEAD'){
        const bytes=all.get(key);if(!bytes){res.writeHead(404);res.end();return;}
        res.setHeader('content-length',bytes.length);res.setHeader('x-amz-meta-snipers-upload-id',ids.get(key));res.writeHead(200);res.end();return;
      }
      if(req.method==='DELETE'){if(!url.searchParams.has('uploadId'))all.delete(key);res.writeHead(204);res.end();return;}
      if(req.method==='GET'){res.setHeader('content-type','application/xml');res.end('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');return;}
      res.writeHead(405);res.end();
    });
    await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(3101,'127.0.0.1',resolve);});
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:build.snapshot,env:{...env,NODE_ENV:'production'},windowsHide:true},3100,log);
    await server.waitReady(90000);
    browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-features=msEdgeSidebarV2']});
    async function pageFor(actor){
      const context=await browser.newContext({viewport:{width:1360,height:1100}});
      await context.addInitScript(key=>localStorage.setItem(key,'AR'),COUNTRY_STORAGE_KEY);
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());if(u.origin===base||u.origin==='http://127.0.0.1:3101'||['data:','blob:'].includes(u.protocol))return route.continue();
        if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});
        if(u.hostname==='flagcdn.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
        return route.abort();
      });
      if(actor){const value=await encode({token:{id:actor.userId,activeSessionId:actor.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret});
        await context.addCookies([{name:'next-auth.session-token',value,url:base,httpOnly:true,sameSite:'Lax'}]);}
      const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));return page;
    }
    const page=await pageFor(admin),url=`${base}/mi-campus/snipers/gestion/archivos`;
    const response=await page.goto(url);assert.equal(response.status(),200);
    await page.getByRole('heading',{name:'Archivos privados',exact:true}).waitFor();
    const html=await response.text();assert.ok(!html.includes(target.key));assert.ok(!html.includes('X-Amz-Signature'));
    assert.equal(await page.locator('article').count(),25);checks.push('admin page, 25 resources and safe server HTML');
    const firstIds=await page.locator('article button[aria-controls]').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-controls')));
    await page.getByRole('link',{name:'Siguiente',exact:true}).click();await page.getByText('Página 2',{exact:true}).waitFor();
    const nextIds=await page.locator('article button[aria-controls]').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-controls')));
    assert.equal(nextIds.length,25);assert.equal(nextIds.some(id=>firstIds.includes(id)),false);
    await page.getByRole('link',{name:'Anterior',exact:true}).click();await page.getByText('Página 1',{exact:true}).waitFor();checks.push('browser pagination moves through 25 distinct resources and returns to the first page');
    for(const actor of [editor,student,null]){const denied=await pageFor(actor),r=await denied.goto(url);assert.ok([404,200].includes(r.status()));assert.equal(await denied.getByRole('heading',{name:'Archivos privados',exact:true}).count(),0);await denied.context().close();}
    checks.push('editor, student and unauthenticated direct navigation denied');
    const protectedArticle=page.locator('article').filter({has:page.getByRole('heading',{name:'Archivo PDF',exact:true})}).first();
    await protectedArticle.getByRole('button',{name:/Ver objetos/}).click();await protectedArticle.getByRole('button',{name:'Consultar objetos',exact:true}).click();
    await protectedArticle.getByText('Protegido',{exact:true}).waitFor();assert.equal(await protectedArticle.getByRole('button',{name:'Limpiar objeto',exact:true}).count(),0);
    checks.push('detached protected file has clear reason and no delete control');
    const article=page.locator('article').filter({has:page.getByRole('heading',{name:'Guía de práctica emocional.pdf',exact:true})}).first();
    await article.getByRole('button',{name:/Ver objetos/}).click();await article.getByRole('button',{name:'Consultar objetos',exact:true}).click();
    await article.getByText('Elegible para limpieza',{exact:true}).first().waitFor();
    await page.getByText('Ver desglose de objetos',{exact:true}).click();
    await page.screenshot({path:path.join(directory,'archivos-desktop.png')});
    const before=requests.filter(r=>r.method==='DELETE').length;
    await article.getByRole('button',{name:'Limpiar objeto',exact:true}).last().click();await page.getByRole('heading',{name:'Limpiar objeto retirado',exact:true}).waitFor();
    await page.screenshot({path:path.join(directory,'archivos-confirmacion.png')});
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(requests.filter(r=>r.method==='DELETE').length,before);
    checks.push('confirmation cancellation issues no remote deletion');
    // Lose only the action response, after the server has persisted its real result.
    let intercepted=false,routeFailure=false,finished;
    const actionFinished=new Promise(resolve=>{finished=resolve;});
    await page.route('**/*',async route=>{
      const req=route.request();
      if(!intercepted&&req.method()==='POST'&&req.postData()?.includes(target.id)&&req.postData()?.includes('operationId')){
        intercepted=true;try{await route.fetch();await route.abort('failed');}catch{routeFailure=true;}finally{finished();}return;
      }await route.continue();
    });
    await article.getByRole('button',{name:'Limpiar objeto',exact:true}).last().click();await page.getByRole('button',{name:'Confirmar limpieza',exact:true}).click();
    await actionFinished;assert.equal(routeFailure,false);
    await page.getByText(/No se pudo confirmar el resultado/).waitFor();
    await page.getByText('Hay una solicitud pendiente de confirmar.',{exact:true}).waitFor();
    assert.equal(all.has(target.key),false);assert.equal(all.has(other.key),true);assert.equal(intercepted,true);
    await page.reload();await article.getByRole('button',{name:/Ver objetos/}).click();
    await article.getByRole('button',{name:'Recuperar mismo intento',exact:true}).waitFor();const deleted=requests.filter(r=>r.method==='DELETE').length;
    await article.getByRole('button',{name:'Recuperar mismo intento',exact:true}).click();await article.getByText('Ausencia confirmada',{exact:true}).waitFor();
    await article.getByText(/Copia temporal/).waitFor();
    assert.equal(requests.filter(r=>r.method==='DELETE').length,deleted);checks.push('SDK cleanup persists absence, targets one object and recovers lost response after reload without repeating DELETE');
    await page.screenshot({path:path.join(directory,'archivos-resultado.png')});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(directory,'archivos-mobile.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push('mobile layout without horizontal overflow');
    assert.deepEqual(errors,[]);assert.equal((await pool.query(`SELECT "cleanupState" FROM "SnipersStorageObject" WHERE id=$1`,[target.id])).rows[0].cleanupState,'QUIESCENT');
    assert.equal((await pool.query(`SELECT "finalObjectId" FROM "SnipersResource" WHERE id=$1`,[protectedFile.resourceId])).rowCount,1);
    fs.writeFileSync(path.join(directory,'browser-evidence.json'),JSON.stringify({passed:true,backup,checks,screenshots:['archivos-desktop.png','archivos-confirmacion.png','archivos-resultado.png','archivos-mobile.png'],pageErrors:errors,realR2:false,productionMutated:false},null,2));
    console.log(JSON.stringify({passed:true,checks,screenshot:path.join(directory,'archivos-desktop.png')}));
  }finally{
    if(browser)await browser.close();if(server)await server.stop();log.end();
    if(fixture){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}await pool.end();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
