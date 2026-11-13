/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg'),{encode}=require('next-auth/jwt');
const {chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {localProfile,verifyDatabase}=require('../phase1/guard.ts');
const {readProfile,isolatedEnv,npmBackup}=require('../phase0/local.ts');
const {verified}=require('../phase3b2d/fixtures.ts');
const {testActor,op,CleanupDouble}=require('./fixtures.ts');
const {getEditorialClass,linkResource,transitionContent}=require('../../src/lib/snipers/content.ts');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');
const {startStorageFixture}=require('../phase3b2b/storage-fixture.cjs');
const {createR2Storage}=require('../../src/lib/snipers/upload-storage.ts');

async function main(){
  const sourceRoot=path.resolve(process.argv[2]??process.cwd());
  const local=localProfile();verifyDatabase(local);await assertPortFree(3100);await assertPortFree(3101);
  const directory=path.resolve('.local/snipers/integration-validation/deletion-stage1');
  const tested=JSON.parse(fs.readFileSync(path.join(directory,'test-evidence.json'),'utf8'));
  assert.equal(tested.passed,true);assert.match(tested.database,/^snipers_deletion_[a-f0-9]{8}$/);
  const profile=readProfile(tested.profileFile),url=new URL(profile.DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,`/${tested.database}`);
  npmBackup(tested.profileFile);
  const build=JSON.parse(fs.readFileSync('.local/snipers/integration-validation/storage-management/build-evidence.json','utf8'));
  assert.equal(build.passed,true);
  for(const [file,hash]of Object.entries(build.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,file))).digest('hex'),hash);
  const secret=randomBytes(32).toString('hex'),base='http://127.0.0.1:3100';
  const env={...isolatedEnv({...local,...profile}),NODE_ENV:'production',SNIPERS_ENABLED:'true',NEXTAUTH_SECRET:secret,
    NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base,SNIPERS_PHASE3A_LOCAL:'1',NEXT_TELEMETRY_DISABLED:'1',
    SNIPERS_ENVIRONMENT:'local',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_R2_ENVIRONMENT:'test',
    SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-single',
    SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-fixture',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-fixture',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101',
    NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
  const pool=new Pool({connectionString:profile.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
  const log=fs.createWriteStream(path.join(directory,'browser-server.log'));
  const checks=[],errors=[];let server,browser,page,fixture;
  try{
    const admin=await testActor(pool,'SNIPERS_ADMIN');
    const file=await verified(pool,admin,'PDF',new CleanupDouble());
    let current=await getEditorialClass(pool,admin,file.classId);
    await linkResource(pool,admin,{operationId:op(),classId:file.classId,resourceId:file.resourceId,expectedVersion:current.version,transition:'ATTACH'});
    current=await getEditorialClass(pool,admin,file.classId);
    await transitionContent(pool,admin,{operationId:op(),entity:'CLASS',id:file.classId,expectedVersion:current.version,transition:'PUBLISH'});
    const classFile=await verified(pool,admin,'PDF',new CleanupDouble());
    current=await getEditorialClass(pool,admin,classFile.classId);
    await linkResource(pool,admin,{operationId:op(),classId:classFile.classId,resourceId:classFile.resourceId,expectedVersion:current.version,transition:'ATTACH'});
    fixture=await startStorageFixture();
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:build.snapshot,env,windowsHide:true},3100,log);
    await server.waitReady(90000);
    browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
    const context=await browser.newContext({viewport:{width:1360,height:1000}});
    await context.addInitScript(key=>localStorage.setItem(key,'AR'),COUNTRY_STORAGE_KEY);
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if([base,'http://127.0.0.1:3101'].includes(u.origin)||['data:','blob:'].includes(u.protocol))return route.continue();
      if(u.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});
      if(u.hostname==='flagcdn.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
      return route.abort();
    });
    const token=await encode({token:{id:admin.userId,activeSessionId:admin.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret});
    await context.addCookies([{name:'next-auth.session-token',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
    page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    const dialog=()=>page.locator('.fixed').filter({has:page.getByRole('heading',{name:/Eliminar|Cambiar publicación/})});
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${file.classId}`);
    await page.getByRole('button',{name:'Ocultar clase',exact:true}).click();
    await dialog().getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByRole('button',{name:'Publicar clase',exact:true}).waitFor();
    assert.equal((await pool.query('SELECT status FROM "SnipersResource" WHERE id=$1',[file.resourceId])).rows[0].status,'VERIFIED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind=\'CLEAN_OBJECT\'',[file.resourceId])).rows[0].n,0);
    await page.getByRole('button',{name:'Publicar clase',exact:true}).click();await dialog().getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByRole('button',{name:'Ocultar clase',exact:true}).waitFor();checks.push('hide preserves file; republish works');
    const row=page.locator('li').filter({hasText:'Archivo PDF'});
    assert.equal(await row.getByRole('button',{name:'Eliminar archivo',exact:true}).isEnabled(),true);
    await row.getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await page.getByText('También se desvinculará de esta clase.',{exact:false}).waitFor();
    await page.screenshot({path:path.join(directory,'file-confirmation.png')});
    await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.ok((await pool.query('SELECT "attachedAt" FROM "SnipersResource" WHERE id=$1',[file.resourceId])).rows[0].attachedAt);
    await row.getByRole('button',{name:'Eliminar archivo',exact:true}).click();await dialog().getByRole('button',{name:'Eliminar archivo',exact:true}).click();
    await row.waitFor({state:'detached'});
    const removed=(await pool.query('SELECT status,"attachedAt","deletionRequestedAt" FROM "SnipersResource" WHERE id=$1',[file.resourceId])).rows[0];
    assert.equal(removed.status,'ARCHIVED');assert.equal(removed.attachedAt,null);assert.ok(removed.deletionRequestedAt);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersFileJob" WHERE "resourceId"=$1 AND kind=\'CLEAN_OBJECT\'',[file.resourceId])).rows[0].n,2);
    checks.push('one confirmation unlinks/deletes linked file; cancellation inert; durable physical work without R2 configuration');
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${classFile.classId}`);
    await page.getByRole('button',{name:'Eliminar clase',exact:true}).click();
    await page.screenshot({path:path.join(directory,'class-confirmation.png')});
    await dialog().getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal((await pool.query('SELECT "deletedAt" FROM "SnipersClass" WHERE id=$1',[classFile.classId])).rows[0].deletedAt,null);
    await page.getByRole('button',{name:'Eliminar clase',exact:true}).click();await dialog().getByRole('button',{name:'Eliminar clase',exact:true}).click();
    await page.waitForURL(`${base}/mi-campus/snipers/gestion/contenido`);
    assert.ok((await pool.query('SELECT "deletedAt" FROM "SnipersClass" WHERE id=$1',[classFile.classId])).rows[0].deletedAt);
    assert.equal((await pool.query('SELECT status FROM "SnipersResource" WHERE id=$1',[classFile.resourceId])).rows[0].status,'ARCHIVED');
    checks.push('class confirmation deletes class and file links, returns to content list');
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${file.classId}`);
    const pdf=Buffer.alloc(400,32);pdf.write('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');pdf.write('xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n250\n%%EOF\n',250);
    const mp3=Buffer.alloc(1536);for(let i=0;i<mp3.length;i+=384)mp3.writeUInt32BE(0xfffb9400,i);
    for(const [type,mime,bytes]of [['PDF','application/pdf',pdf],['MP3','audio/mpeg',mp3],['M4A','audio/mp4',fs.readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a')]]){
      const name=`Unico ${type}`;
      await page.getByLabel('Archivo MP3, M4A o PDF',{exact:true}).setInputFiles({name:`file.${type.toLowerCase()}`,mimeType:mime,buffer:bytes});
      await page.getByLabel('Nombre del recurso',{exact:true}).fill(name);
      await page.getByRole('button',{name:'Subir archivo privado',exact:true}).click();
      let uploaded;
      for(let i=0;i<150;i++){
        uploaded=(await pool.query(`SELECT r.*,u.id AS "uploadId" FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id WHERE r."classId"=$1 AND r.name=$2 AND r.status='VERIFIED' AND u."singleObject"`,[file.classId,name])).rows[0];
        if(uploaded)break;await new Promise(r=>setTimeout(r,100));
      }
      assert.ok(uploaded,`Browser upload did not finish: ${type}`);
      await page.getByRole('button',{name:'Subir archivo privado',exact:true}).waitFor();
      await createR2Storage(env).inspectDelivery(uploaded.objectKey,mime,bytes.length,uploaded.uploadId,new AbortController().signal);
      const objects=(await pool.query('SELECT kind,key FROM "SnipersStorageObject" WHERE "resourceId"=$1',[uploaded.id])).rows;
      assert.equal(objects.length,1);assert.equal(objects[0].kind,'FINAL');assert.ok(objects[0].key.startsWith('snipers/final/'));
      checks.push(`${type}: browser progress, multipart SDK and one validated object with delivery metadata`);
    }
    assert.equal(fixture.state.creates,3);assert.equal(fixture.state.completes,3);assert.equal(fixture.objects.size,3);
    await page.getByRole('button',{name:'Actualizar archivos',exact:true}).click();
    await page.getByText('Unico PDF',{exact:false}).waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(directory,'editor-mobile.png')});checks.push('mobile editor has no overflow');
    assert.equal((await context.request.get(`${base}/api/snipers/storage-cleanup`)).status(),503);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(directory,'browser-evidence.json'),JSON.stringify({passed:true,checks,pageErrors:errors,productionMutated:false,physicalDeletionCoveredByServiceTests:true},null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors:errors.length}));
  }catch(error){
    if(page){await page.screenshot({path:path.join(directory,'browser-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(directory,'browser-failure.txt'),await page.locator('body').innerText().catch(()=>''));}
    throw error;
  }finally{
    if(browser)await browser.close();if(server)await server.stop();if(fixture)await fixture.stop();log.end();await pool.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
