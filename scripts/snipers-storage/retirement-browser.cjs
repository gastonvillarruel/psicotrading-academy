/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomBytes}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {chromium}=require(path.resolve('.local/snipers/browser-tools/node_modules/playwright'));
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {isolatedEnv,npmBackup,profilePath}=require('../phase0/local.ts');
const {testActor,CleanupDouble}=require('./fixtures.ts'),{verified}=require('../phase3b2d/fixtures.ts');
const {historicalRetirement}=require('./retirement-fixtures.ts');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');

async function main(){
  const p=localProfile();verifyDatabase(p);await assertPortFree(3100);await assertPortFree(3101);
  const backup=npmBackup(profilePath),work=path.resolve('.local/snipers/work-resource-retirement'),directory=path.join(work,'.local/snipers/validation');
  const base='http://127.0.0.1:3100',secret=randomBytes(32).toString('hex');
  const env={...isolatedEnv(p),SNIPERS_ENABLED:'true',SNIPERS_PHASE3A_LOCAL:'1',SNIPERS_PHASE3B2B_LOCAL:'1',NEXTAUTH_SECRET:secret,
    NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base,NEXT_TELEMETRY_DISABLED:'1',SNIPERS_NETWORK_TRACE:path.join(directory,'browser-network.jsonl'),
    SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-admin',
    SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',
    NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
  const pool=new Pool({connectionString:p.DATABASE_URL,max:4,connectionTimeoutMillis:5000}),errors=[],checks=[],requests=[];
  let server,browser,fixture;const log=fs.createWriteStream(path.join(directory,'browser.log'),{flags:'w'});
  try{
    const admin=await testActor(pool,'SNIPERS_ADMIN'),editor=await testActor(pool,'SNIPERS_CONTENT_EDITOR');
    const storage=new CleanupDouble(),current={...await verified(pool,admin,'PDF',storage),storage},old=await historicalRetirement(pool,admin);
    const all=new Map([...current.storage.objects,...old.storage.objects]),ids=new Map([...current.storage.uploadIds,...old.storage.uploadIds]);
    fixture=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://127.0.0.1:3101'),key=decodeURIComponent(url.pathname.replace(/^\/snipers-test-admin\/?/,''));requests.push({method:req.method,key,multipart:url.searchParams.has('uploadId')});
      if(req.method==='HEAD'){const b=all.get(key);if(!b){res.writeHead(404);res.end();return;}res.setHeader('content-length',b.length);res.setHeader('x-amz-meta-snipers-upload-id',ids.get(key));res.writeHead(200);res.end();return;}
      if(req.method==='DELETE'){if(!url.searchParams.has('uploadId'))all.delete(key);res.writeHead(204);res.end();return;}
      if(req.method==='GET'){res.setHeader('content-type','application/xml');res.end('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');return;}
      res.writeHead(405);res.end();
    });
    await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(3101,'127.0.0.1',resolve);});
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:work,env:{...env,NODE_ENV:'production'},windowsHide:true},3100,log);await server.waitReady(90000);
    browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
    async function pageFor(actor){
      const context=await browser.newContext({viewport:{width:1360,height:1100}});await context.addInitScript(key=>localStorage.setItem(key,'AR'),COUNTRY_STORAGE_KEY);
      await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base||u.origin==='http://127.0.0.1:3101'||['data:','blob:'].includes(u.protocol))return route.continue();
        if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});return route.abort();});
      const value=await encode({token:{id:actor.userId,activeSessionId:actor.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret});
      await context.addCookies([{name:'next-auth.session-token',value,url:base,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));return page;
    }
    const page=await pageFor(admin),classUrl=`${base}/mi-campus/snipers/gestion/contenido/clases/${current.classId}`;
    await page.goto(classUrl);const control=page.getByRole('region',{name:/Retiro definitivo de/});await control.getByRole('button',{name:'Consultar retiro definitivo',exact:true}).click();
    await control.getByText('Disponible para retirar',{exact:true}).waitFor();await control.getByRole('button',{name:'Solicitar eliminación definitiva',exact:true}).click();
    await page.getByRole('heading',{name:'Eliminar archivo definitivamente',exact:true}).waitFor();await page.screenshot({path:path.join(directory,'retiro-confirmacion.png')});
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(requests.filter(r=>r.method==='DELETE').length,0);checks.push('class editor shows explicit confirmation; cancellation has no effect');
    let classIntercepted=false,classComplete;const classResponseLost=new Promise(r=>{classComplete=r;});
    await page.route('**/*',async route=>{const req=route.request();if(!classIntercepted&&req.method()==='POST'&&req.postData()?.includes(current.resourceId)&&req.postData()?.includes('operationId')){
      classIntercepted=true;try{await route.fetch();await route.abort('failed');}finally{classComplete();}return;}await route.continue();});
    await control.getByRole('button',{name:'Solicitar eliminación definitiva',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación definitiva',exact:true}).click();await classResponseLost;
    await control.getByRole('button',{name:'Recuperar solicitud de retiro',exact:true}).waitFor();await page.reload();
    await control.getByRole('button',{name:'Recuperar solicitud de retiro',exact:true}).click();
    await control.getByText('Pendiente de eliminación',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Vincular archivo',exact:true}).count(),0);
    assert.equal(requests.filter(r=>r.method==='DELETE').length,0);await page.screenshot({path:path.join(directory,'retiro-clase-pendiente.png')});checks.push('class editor persists intent, waits retention and removes attach option');
    const other=await pageFor(editor);await other.goto(classUrl);assert.equal(await other.getByRole('region',{name:/Retiro definitivo de/}).count(),0);await other.goto(`${base}/mi-campus/snipers/gestion/archivos`);assert.equal(await other.getByRole('heading',{name:'Archivos privados',exact:true}).count(),0);checks.push('content editor has no retirement controls or admin inventory access');
    await page.goto(`${base}/mi-campus/snipers/gestion/archivos`);const article=page.locator('article').filter({has:page.locator(`a[href$="/${old.classId}"]`)});
    await article.getByRole('button',{name:/Ver objetos/}).click();const retirement=article.getByRole('region',{name:/Retiro definitivo de/});
    await retirement.getByRole('button',{name:'Consultar retiro definitivo',exact:true}).click();await retirement.getByRole('button',{name:'Continuar eliminación',exact:true}).waitFor();
    let intercepted=false,complete;const responseLost=new Promise(r=>{complete=r;});
    await page.route('**/*',async route=>{const req=route.request();
      if(!intercepted&&req.method()==='POST'&&req.postData()?.includes(old.resourceId)&&req.postData()?.includes('operationId')){
        intercepted=true;try{await route.fetch();await route.abort('failed');}finally{complete();}return;
      }await route.continue();});
    await retirement.getByRole('button',{name:'Continuar eliminación',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación definitiva',exact:true}).click();await responseLost;
    await page.getByRole('button',{name:'Recuperar solicitud de retiro',exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='DELETE'&&!r.multipart).length,1);
    await page.reload();await article.getByRole('button',{name:/Ver objetos/}).click();await retirement.getByRole('button',{name:'Recuperar solicitud de retiro',exact:true}).click();
    await retirement.getByText('Pendiente de eliminación',{exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='DELETE'&&!r.multipart).length,1);checks.push('lost response recovers same exact visit after reload, with no duplicate DELETE');
    await retirement.getByRole('button',{name:'Continuar eliminación',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación definitiva',exact:true}).click();await retirement.getByText('Eliminado',{exact:true}).waitFor();
    assert.equal(requests.filter(r=>r.method==='DELETE'&&!r.multipart).length,2);assert.ok([...current.storage.objects.keys()].every(k=>all.has(k)));
    await page.screenshot({path:path.join(directory,'retiro-eliminado.png')});checks.push('admin inventory reports eliminated only after both exact objects have persisted absence');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(directory,'retiro-mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(directory,'browser.json'),JSON.stringify({passed:true,backup,checks,pageErrors:errors,realR2:false,productionMutated:false},null,2));console.log(JSON.stringify({passed:true,checks}));
  }finally{if(browser)await browser.close();if(server)await server.stop();log.end();if(fixture){fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}await pool.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
