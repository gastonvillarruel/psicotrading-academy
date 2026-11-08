/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {isolatedEnv,npmBackup,profilePath}=require('../phase0/local.ts');
const {testActor,fresh,op,CleanupDouble}=require('./fixtures.ts');
const {verified}=require('../phase3b2d/fixtures.ts');
const {transaction}=require('../../src/lib/snipers/permissions.ts');
const {linkResource,getEditorialClass}=require('../../src/lib/snipers/content.ts');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');

async function main(){
  const profile=localProfile();verifyDatabase(profile);await assertPortFree(3100);
  const backup=npmBackup(profilePath),directory=path.resolve('.local/snipers/storage-management');
  const build=JSON.parse(fs.readFileSync(path.join(directory,'build-evidence.json'),'utf8'));
  assert.equal(build.passed,true);
  for(const [file,hash]of Object.entries(build.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Rebuild after changing source.');
  const base='http://127.0.0.1:3100',secret=randomBytes(32).toString('hex');
  const env={...isolatedEnv(profile),NODE_ENV:'production',SNIPERS_ENABLED:'true',NEXTAUTH_SECRET:secret,
    NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base,NEXT_TELEMETRY_DISABLED:'1',SNIPERS_PHASE3A_LOCAL:'1',
    SNIPERS_NETWORK_TRACE:path.join(directory,'discard-browser-network.jsonl'),
    NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
  const pool=new Pool({connectionString:profile.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
  const checks=[],errors=[];let server,browser;
  const log=fs.createWriteStream(path.join(directory,'discard-browser-server.log'),{flags:'w'});
  try{
    const admin=await testActor(pool,'SNIPERS_ADMIN'),editor=await testActor(pool,'SNIPERS_CONTENT_EDITOR');
    const rejectedName=`Intento rechazado ${op().slice(0,8)}.pdf`;
    const f=await fresh(pool,admin,{final:true,name:rejectedName});
    await transaction(pool,async tx=>{
      await tx.query(`UPDATE "SnipersResource" SET status='REJECTED' WHERE id=$1`,[f.resourceId]);
      await tx.query(`UPDATE "SnipersUpload" SET status='FAILED' WHERE id=$1`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersFileJob" SET status='FAILED',"errorCode"='INVALID_PDF',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "uploadId"=$1 AND kind='PROCESS_UPLOAD'`,[f.uploadId]);
      await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=statement_timestamp(),"cleanupAfter"=statement_timestamp()+interval '7 days',"nextProbeAt"=statement_timestamp()+interval '7 days' WHERE "resourceId"=$1`,[f.resourceId]);
    });
    const linked=await verified(pool,admin,'PDF',new CleanupDouble());
    let cl=await getEditorialClass(pool,admin,linked.classId);
    await linkResource(pool,admin,{operationId:op(),classId:linked.classId,resourceId:linked.resourceId,expectedVersion:cl.version,transition:'ATTACH'});
    const detached=await verified(pool,admin,'PDF',new CleanupDouble());
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:build.snapshot,env,windowsHide:true},3100,log);
    await server.waitReady(90000);
    browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
      args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-features=msEdgeSidebarV2']});
    async function pageFor(actor){
      const context=await browser.newContext({viewport:{width:1360,height:1100}});
      await context.addInitScript(key=>localStorage.setItem(key,'AR'),COUNTRY_STORAGE_KEY);
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.origin===base||['data:','blob:'].includes(u.protocol))return route.continue();
        if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});
        if(u.hostname==='flagcdn.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
        return route.abort();
      });
      if(actor){const value=await encode({token:{id:actor.userId,activeSessionId:actor.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret});
        await context.addCookies([{name:'next-auth.session-token',value,url:base,httpOnly:true,sameSite:'Lax'}]);}
      const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));return page;
    }
    const page=await pageFor(admin);
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${f.classId}`);
    let row=page.locator('li').filter({hasText:rejectedName});
    await row.getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await page.getByRole('heading',{name:'Eliminar archivo',exact:true}).waitFor();
    await page.screenshot({path:path.join(directory,'discard-confirmation.png')});
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal((await pool.query('SELECT status FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0].status,'REJECTED');
    await row.getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await page.locator('.fixed').getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await row.waitFor({state:'detached'});
    cl=await getEditorialClass(pool,admin,f.classId);assert.equal(cl.resources.length,0);
    assert.equal((await pool.query('SELECT status FROM "SnipersUpload" WHERE id=$1',[f.uploadId])).rows[0].status,'FAILED');
    checks.push('class editor confirms rejected discard; cancel is inert; FAILED remains; row disappears');
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${linked.classId}`);
    row=page.locator('li').filter({hasText:'Archivo PDF'});
    assert.equal(await row.getByRole('button',{name:'Eliminar archivo',exact:true}).isDisabled(),true);
    await row.getByText('Desvinculá el archivo de la clase antes de eliminarlo.').waitFor();
    checks.push('linked file has disabled delete with clear explanation');
    const other=await pageFor(editor);
    await other.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${linked.classId}`);
    assert.equal(await other.getByRole('button',{name:'Eliminar archivo',exact:true}).count(),0);await other.context().close();
    checks.push('non-admin editor has no delete control');
    await page.goto(`${base}/mi-campus/snipers/gestion/archivos`);
    const article=page.locator('article').filter({has:page.getByRole('heading',{name:'Archivo PDF',exact:true})}).first();
    let lost=false,finished;
    const intercepted=new Promise(resolve=>{finished=resolve;});
    await page.route('**/*',async route=>{
      const req=route.request();
      if(!lost&&req.method()==='POST'&&req.postData()?.includes(detached.resourceId)&&req.postData()?.includes('operationId')){
        lost=true;try{await route.fetch();await route.abort('failed');}finally{finished();}return;
      }return route.fallback();
    });
    await article.getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await page.locator('.fixed').getByRole('button',{name:'Eliminar archivo',exact:true}).click();await intercepted;
    await article.getByRole('button',{name:'Recuperar eliminación',exact:true}).waitFor();
    await article.getByRole('button',{name:'Recuperar eliminación',exact:true}).click();
    await page.waitForFunction(()=>!document.body.textContent.includes('Recuperar eliminación'));
    const count=(await pool.query(`SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE "entityId"=$1 AND payload->>'formatVersion'='6'`,[detached.resourceId])).rows[0].n;
    assert.equal(count,1);checks.push('storage delete recovers a lost response with one durable receipt');
    await page.getByRole('link',{name:'Eliminados',exact:true}).click();
    await page.getByRole('heading',{name:'Archivos eliminados',exact:true}).waitFor();
    await page.getByRole('heading',{name:rejectedName,exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Eliminar archivo',exact:true}).count(),0);
    assert.ok(await page.getByRole('heading',{name:'Archivo PDF',exact:true}).count()>0);
    const next=page.getByRole('link',{name:'Siguiente',exact:true});
    if(await next.count())assert.match(await next.getAttribute('href'),/archived=true/);
    await page.getByRole('heading',{name:'Archivos eliminados',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,'discard-history-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('heading',{name:'Archivos eliminados',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,'discard-history-mobile.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    checks.push('deleted filter shows both discarded files, preserves pagination and fits mobile');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE "entityId" IN ($1,$2) AND payload->'result'->>'kind'='CLEANUP_INTENT'`,[f.resourceId,detached.resourceId])).rows[0].n,0);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(directory,'discard-browser-evidence.json'),JSON.stringify({passed:true,backup,checks,errors,realR2:false,productionMutated:false},null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors:errors.length}));
  }finally{if(browser)await browser.close();if(server)await server.stop();log.end();await pool.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
