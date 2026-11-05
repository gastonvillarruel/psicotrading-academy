/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {encode}=require('next-auth/jwt');
const {requireRunner,verifyDatabase,localPool}=require('../phase1/guard.ts');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');
const api=require('../../src/lib/snipers/content.ts');
const {createR2Storage}=require('../../src/lib/snipers/upload-storage.ts');
const {verified,StorageDouble,op}=require('./fixtures.ts');
const {startDeliveryFixture,accessKey,secret}=require('./storage-fixture.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');

async function main(){
  assert.equal(process.env.SNIPERS_PHASE3B2D_LOCAL,'1');const p=requireRunner();verifyDatabase(p);await assertPortFree(3100);await assertPortFree(3101);
  const pool=localPool(),base='http://127.0.0.1:3100',results=[],pageErrors=[],blocked=[];
  const root={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  const env={...process.env,SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-delivery',SNIPERS_R2_TEST_ACCESS_KEY_ID:accessKey,SNIPERS_R2_TEST_SECRET_ACCESS_KEY:secret,SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101'};
  const log=fs.createWriteStream('.local/snipers/phase3b2d/browser-server.log',{flags:'a'});
  let fixture,server,browser,current,playActions=0,resetClock=false;
  async function user(editor=false){const actor={userId:op(),activeSessionId:op(),singleSession:true};await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","emailVerified","updatedAt") VALUES ($1,$2,'STUDENT',$3,clock_timestamp(),clock_timestamp())`,[actor.userId,`phase3b2d-browser-${actor.userId}@local.invalid`,actor.activeSessionId]);if(editor)await changePermission(pool,root,actor.userId,'SNIPERS_CONTENT_EDITOR',true);return actor;}
  async function check(name,work){server.assertRunning();await work();server.assertRunning();results.push({name,passed:true});console.log(`PASS browser: ${name}`);}
  try{
    const editor=await user(true),student=await user(),membership=op(),plan=(await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code LIMIT 1')).rows[0].id;
    await pool.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,clock_timestamp())',[membership,student.userId,plan]);
    await pool.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId") VALUES ($1,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','COURTESY','3B-2D navegador',$4)`,[op(),membership,plan,root.userId]);
    // Silent MPEG-1 Layer III frames: Chromium must actually decode/play them below.
    const frame=Buffer.alloc(417);Buffer.from([0xff,0xfb,0x90,0x00]).copy(frame);
    const audioStorage=new StorageDouble();audioStorage.payload=Buffer.concat(Array.from({length:1200},()=>frame));
    const mp3=await verified(pool,editor,'MP3',audioStorage),pdf=await verified(pool,editor,'PDF',new StorageDouble(),mp3.classId);
    fixture=await startDeliveryFixture();const sdk=createR2Storage(env);
    for(const f of [mp3,pdf]){
      const r=(await pool.query('SELECT "objectKey","mimeType" FROM "SnipersResource" WHERE id=$1',[f.resourceId])).rows[0],file=`.local/snipers/phase3b2d/${f.resourceId}.bin`;
      fs.writeFileSync(file,f.storage.payload,{flag:'wx'});await sdk.putNew(r.objectKey,file,f.storage.payload.length,r.mimeType,f.uploadId,AbortSignal.timeout(10000));
    }
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:process.cwd(),env:{...env,NODE_ENV:'production',SNIPERS_ENABLED:'true',NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base},windowsHide:true},3100,log);
    await server.waitReady();browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-features=msEdgeSidebarV2']});
    async function pageFor(actor){
      const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
      await context.addInitScript(({key,origin})=>{if(location.origin===origin)localStorage.setItem(key,'AR');},{key:COUNTRY_STORAGE_KEY,origin:base});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if([base,'http://127.0.0.1:3101'].includes(url.origin)||['data:','blob:'].includes(url.protocol))return route.continue();if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});if(url.hostname==='flagcdn.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});blocked.push(url.origin);return route.abort();});
      const cookie=await encode({token:{id:actor.userId,activeSessionId:actor.activeSessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret:p.NEXTAUTH_SECRET});
      await context.addCookies([{name:'next-auth.session-token',value:cookie,url:base,httpOnly:true,sameSite:'Lax'}]);
      const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));page.setDefaultTimeout(20000);return page;
    }
    const mentor=await pageFor(editor),learner=await pageFor(student);current=mentor;
    await mentor.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${mp3.classId}`);const inventory=mentor.getByRole('region',{name:'Vinculación de archivos'});
    await check('inventario, borrador local protegido y cancelación de vínculo',async()=>{
      await inventory.getByText('Archivo MP3 · MP3',{exact:true}).waitFor();assert.equal(await inventory.getByRole('button',{name:'Vincular archivo',exact:true}).count(),2);
      const title=mentor.getByLabel('Título de la clase'),original=await title.inputValue();await title.fill('Cambio local sin guardar');assert.equal(await inventory.getByRole('button',{name:'Vincular archivo'}).first().isDisabled(),true);await title.fill(original);
      await inventory.getByRole('button',{name:'Vincular archivo',exact:true}).first().click();await mentor.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal((await api.getEditorialClass(pool,editor,mp3.classId)).resources.filter(r=>r.attachedAt).length,0);
    });
    await check('vinculación explícita y publicación independiente',async()=>{
      for(let i=0;i<2;i++){await inventory.getByRole('button',{name:'Vincular archivo',exact:true}).first().click();await mentor.getByRole('button',{name:'Confirmar',exact:true}).click();await inventory.getByRole('button',{name:'Desvincular archivo',exact:true}).nth(i).waitFor();}
      assert.equal((await learner.goto(`${base}/mi-campus/snipers/biblioteca/${mp3.classId}`)).status(),404);
      await mentor.getByRole('button',{name:'Publicar clase',exact:true}).click();await mentor.getByRole('button',{name:'Confirmar',exact:true}).click();await mentor.getByRole('button',{name:'Retirar a borrador',exact:true}).waitFor();assert.equal(await inventory.getByText('Publicado',{exact:true}).count(),2);
    });
    current=learner;let initialHtml;
    learner.on('request',r=>{if(r.method()==='POST'&&r.postData()?.includes('"PLAY"'))playActions++;});
    // Expiration UX is exercised by a controlled browser clock. SQL/SDK clocks remain real.
    await learner.route('**/biblioteca/*',async route=>{if(resetClock&&route.request().method()==='POST'){const response=await route.fetch();await learner.evaluate(()=>{Date.now=window.__realNow;});resetClock=false;return route.fulfill({response});}return route.continue();});
    async function expireClient(offset){await learner.evaluate(ms=>{window.__realNow??=Date.now;Date.now=()=>window.__realNow()+ms;},offset);resetClock=true;}
    await check('sin precarga, URLs en HTML ni persistencia de firmas',async()=>{
      const response=await learner.goto(`${base}/mi-campus/snipers/biblioteca/${mp3.classId}`);initialHtml=await response.text();await learner.getByRole('region',{name:'Material de la clase'}).waitFor();assert.ok(!initialHtml.includes('X-Amz-Signature'));assert.equal(fixture.requests.length,0);assert.equal(await learner.locator('audio').getAttribute('preload'),'none');
    });
    await check('MP3 reproduce realmente con attachment; Range y firma independiente',async()=>{
      await learner.getByRole('button',{name:'Reproducir MP3',exact:true}).click();await learner.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0.1&&a.duration>1;});
      assert.equal(playActions,1);const url=await learner.locator('audio').getAttribute('src');const range=await learner.request.get(url,{headers:{Range:'bytes=0-31'}});assert.equal(range.status(),206);assert.equal((await range.body()).length,32);assert.match(range.headers()['content-disposition'],/^attachment; filename="snipers-.*\.mp3"$/);assert.equal(range.headers()['cache-control'],'private, no-store');
      const altered=new URL(url);altered.searchParams.set('X-Amz-Expires','121');assert.equal((await learner.request.get(altered.href)).status(),403);
      const key=(await pool.query('SELECT "objectKey" FROM "SnipersResource" WHERE id=$1',[mp3.resourceId])).rows[0].objectKey,old=new Date(Date.now()-130000),expired=await sdk.signRead(key,old,new Date(old.getTime()+120000));assert.equal((await learner.request.get(expired)).status(),403);
      assert.ok(fixture.requests.some(r=>r.valid&&r.range));
    });
    await check('descargas MP3/PDF directas con nombre seguro',async()=>{
      for(const type of ['MP3','PDF']){const waiting=learner.waitForEvent('download');await learner.getByRole('button',{name:`Descargar ${type}`,exact:true}).click();const download=await waiting;assert.match(download.suggestedFilename(),new RegExp(`^snipers-[a-f0-9-]+\\.${type.toLowerCase()}$`));assert.equal(await download.failure(),null);}
      assert.equal(await learner.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('X-Amz-')),false);
    });
    await check('renovación preventiva conserva posición y pausa',async()=>{
      await learner.locator('audio').evaluate(a=>{a.pause();a.currentTime=2;});const previous=await learner.locator('audio').getAttribute('src'),count=playActions;await expireClient(110000);
      await learner.locator('audio').evaluate(a=>{a.currentTime=3;});await learner.waitForFunction(old=>document.querySelector('audio').src!==old,previous);await learner.waitForFunction(()=>{const a=document.querySelector('audio');return a.readyState>=1&&a.currentTime>=2.9&&a.paused;});assert.equal(playActions,count+1);
    });
    await check('recuperación automática acotada a un intento y reintento manual',async()=>{
      const previous=await learner.locator('audio').getAttribute('src'),count=playActions;await expireClient(121000);await learner.locator('audio').evaluate(a=>a.dispatchEvent(new Event('error')));await learner.waitForFunction(old=>document.querySelector('audio').src!==old,previous);await learner.waitForFunction(()=>document.querySelector('audio').readyState>=1);assert.equal(playActions,count+1);
      await expireClient(121000);await learner.locator('audio').evaluate(a=>a.dispatchEvent(new Event('error')));await learner.getByText(/No se pudo reproducir el archivo/).waitFor();assert.equal(playActions,count+1);await learner.evaluate(()=>{Date.now=window.__realNow;});resetClock=false;
      await learner.getByRole('button',{name:'Reproducir MP3',exact:true}).click();await learner.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&a.currentTime>0;});
    });
    await check('desvincular bloquea nuevas descargas y muestra mensaje comprensible',async()=>{
      const c=await api.getEditorialClass(pool,editor,mp3.classId);await api.linkResource(pool,editor,{operationId:op(),classId:mp3.classId,resourceId:pdf.resourceId,expectedVersion:c.version,transition:'DETACH'});
      await learner.getByRole('button',{name:'Descargar PDF',exact:true}).click();await learner.getByText('Este archivo fue retirado o ya no está disponible.').waitFor();
      await pool.query(`UPDATE "SnipersMembership" SET status='SUSPENDED' WHERE id=$1`,[membership]);await learner.getByRole('button',{name:'Descargar MP3',exact:true}).click();await learner.getByText('Tu acceso cambió. Volvé al campus y verificá tu membresía.').waitFor();assert.equal(await learner.locator('audio').getAttribute('src'),null);
    });
    await check('móvil y cierre sin errores JavaScript inesperados',async()=>{
      await learner.setViewportSize({width:390,height:844});assert.equal(await learner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await learner.screenshot({path:'.local/snipers/phase3b2d/browser-mobile.png',fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(blocked,[]);
    });
    fs.writeFileSync('.local/snipers/phase3b2d/browser-results.json',JSON.stringify({passed:true,results,pageErrors,blocked,clock:'controlled browser expiration only',realR2Validated:false},null,2));
  }catch(error){if(current)await current.screenshot({path:`.local/snipers/phase3b2d/browser-failed-${Date.now()}.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`.local/snipers/phase3b2d/browser-failed-${Date.now()}.json`,JSON.stringify({results,pageErrors,blocked,error:error.message},null,2));throw error;}
  finally{if(browser)await browser.close();if(server)await server.stop();if(fixture)await fixture.stop();log.end();await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
