/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises'),{encode}=require('next-auth/jwt');
const {chromium}=require('../../.local/snipers/browser-tools/node_modules/playwright');
const {assertPortFree,startServer}=require('../phase3a/server.cjs');
const {requireRunner,verifyDatabase,localPool}=require('../phase1/guard.ts');
const {changePermission}=require('../../src/lib/snipers/permissions.ts');
const {cancelUpload}=require('../../src/lib/snipers/uploads.ts');
const {createR2Storage}=require('../../src/lib/snipers/upload-storage.ts');
const {processUploadOnce}=require('../../src/lib/snipers/upload-processor.ts');
const {startStorageFixture}=require('./storage-fixture.cjs');
const {COUNTRY_STORAGE_KEY}=require('../../src/lib/countries.ts');

async function main(){
  assert.equal(process.env.SNIPERS_PHASE3B2B_LOCAL,'1');const profile=requireRunner();verifyDatabase(profile);await assertPortFree(3100);await assertPortFree(3101);
  const pool=localPool(),base='http://127.0.0.1:3100',results=[],errors=[],blocked=[];
  const root={userId:JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json','utf8')).userId,activeSessionId:null,singleSession:false};
  const userId=randomUUID(),sessionId=randomUUID(),classId=randomUUID();const actor={userId,activeSessionId:sessionId,singleSession:true};
  const env={...process.env,SNIPERS_R2_ENVIRONMENT:'test',SNIPERS_R2_TEST_ACCOUNT_ID:'a'.repeat(32),SNIPERS_R2_TEST_BUCKET:'snipers-test-fixture',SNIPERS_R2_TEST_ACCESS_KEY_ID:'local-test-key',SNIPERS_R2_TEST_SECRET_ACCESS_KEY:'local-test-secret',SNIPERS_UPLOAD_FIXTURE_ORIGIN:'http://127.0.0.1:3101'};
  let fixture,server,browser,page,loop,stopping=false,processing=true;const log=fs.createWriteStream('.local/snipers/phase3b2b/browser-server.log');
  async function check(name,work){server.assertRunning();await work();server.assertRunning();results.push({name,passed:true});console.log(`PASS browser: ${name}`);}
  async function rows(){return(await pool.query('SELECT u.*,r.status AS "resourceStatus",r."attachedAt",r."verifiedAt" FROM "SnipersUpload" u JOIN "SnipersResource" r ON r.id=u."resourceId" WHERE r."classId"=$1 ORDER BY u."createdAt"',[classId])).rows;}
  const storage=createR2Storage(env);
  try{
    await pool.query(`INSERT INTO "User" (id,email,role,"emailVerified","activeSessionId","updatedAt") VALUES ($1,$2,'STUDENT',clock_timestamp(),$3,clock_timestamp())`,[userId,`phase3b2b-browser-${userId}@local.invalid`,sessionId]);
    await changePermission(pool,root,userId,'SNIPERS_CONTENT_EDITOR',true);
    await pool.query(`INSERT INTO "SnipersClass" (id,title,body,"classDate","updatedAt") VALUES ($1,'Carga privada de prueba','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Clase de prueba de cargas."}]}]}',clock_timestamp(),clock_timestamp())`,[classId]);
    fixture=await startStorageFixture();
    loop=(async()=>{while(!stopping){if(processing)await processUploadOnce(pool,storage);await delay(100);}})();
    server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:process.cwd(),env:{...env,NODE_ENV:'production',SNIPERS_ENABLED:'true',NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base},windowsHide:true},3100,log);
    await server.waitReady();browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-features=msEdgeSidebarV2']});
    const context=await browser.newContext({viewport:{width:1280,height:1000}});
    await context.addInitScript(({key,origin})=>{if(location.origin===origin)localStorage.setItem(key,'AR');},{key:COUNTRY_STORAGE_KEY,origin:base});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if([base,'http://127.0.0.1:3101'].includes(url.origin)||url.protocol==='data:')return route.continue();if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:'/* offline */'});if(url.hostname==='flagcdn.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});blocked.push(url.origin);return route.abort();});
    const cookie=await encode({token:{id:userId,activeSessionId:sessionId,role:'STUDENT',emailVerified:new Date().toISOString()},secret:profile.NEXTAUTH_SECRET});
    await context.addCookies([{name:'next-auth.session-token',value:cookie,url:base,httpOnly:true,sameSite:'Lax'}]);
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
    await page.goto(`${base}/mi-campus/snipers/gestion/contenido/clases/${classId}`);const panel=page.getByRole('region',{name:'Archivos privados'});
    await check('interfaz editorial muestra límites y selecciona archivo sin enviar bytes a Next',async()=>{
      await panel.getByRole('heading',{name:'Carga privada'}).waitFor();
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles({name:'invalid.exe',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText(/Elegí un MP3 de hasta/).waitFor();assert.equal((await rows()).length,0);
    });
    await check('tres partes fallidas permiten reintento manual; multipart de dos partes concluye privado',async()=>{
      fixture.state.failPuts=3;
      const file=Buffer.alloc(9*1024*1024,65);file.write('%PDF-1.4\n');
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles({name:'prueba.pdf',mimeType:'application/pdf',buffer:file});
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText(/No se pudo subir esta parte/).waitFor();
      assert.equal(fixture.state.puts,3);assert.equal((await rows()).length,1);const creates=fixture.state.creates;
      await panel.getByRole('button',{name:'Reintentar carga',exact:true}).click();await panel.getByText(/Transferencia completada/).waitFor({timeout:60000});
      assert.equal(fixture.state.creates,creates);assert.equal(fixture.state.completes,1);assert.equal(fixture.state.puts,5);
      const r=(await rows())[0];assert.equal(r.status,'PROCESSING');assert.equal(r.resourceStatus,'PENDING');assert.equal(r.attachedAt,null);assert.equal(r.verifiedAt,null);
      assert.equal(await panel.getByRole('progressbar').getAttribute('value'),String(file.length));
      await panel.screenshot({path:'.local/snipers/phase3b2b/browser-transfer.png'});
    });
    await check('MP3 sintético de 250 MiB transfiere exactamente 32 partes sin pasar bytes por Next',async()=>{
      await panel.getByRole('button',{name:'Cargar otro archivo'}).click();
      const file=`.local/snipers/phase3b2b/max-${randomUUID()}.mp3`,fd=fs.openSync(file,'wx');
      try{fs.ftruncateSync(fd,262144000);}finally{fs.closeSync(fd);}
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles(file);const before=fixture.state.puts;
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText(/Transferencia completada/).waitFor({timeout:120000});
      assert.equal(fixture.state.puts-before,32);assert.equal(fixture.state.completes,2);
      const r=(await rows())[1];assert.equal(r.status,'PROCESSING');assert.equal(r.resourceStatus,'PENDING');assert.equal(r.verifiedAt,null);
      assert.equal(await panel.getByRole('progressbar').getAttribute('value'),'262144000');
    });
    await check('pausar y cancelar usa ConfirmModal; cancelación persiste sin procesador',async()=>{
      await panel.getByRole('button',{name:'Cargar otro archivo'}).click();processing=false;
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles({name:'cancelar.mp3',mimeType:'audio/mpeg',buffer:Buffer.alloc(1024,0)});
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText('Esperando al procesador de archivos…',{exact:true}).waitFor();
      await panel.getByRole('button',{name:'Pausar transferencia'}).click();await panel.getByRole('button',{name:'Cancelar carga',exact:true}).click();
      await page.getByRole('heading',{name:'Cancelar carga privada'}).waitFor();await page.getByRole('button',{name:'Confirmar',exact:true}).click();
      await panel.getByText('Carga cancelada. Podés seleccionar otro archivo.',{exact:true}).waitFor();assert.equal((await rows())[2].status,'CANCELLED');
    });
    await check('recargar descarta selección y no reanuda ni crea una carga adicional',async()=>{
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles({name:'interrumpida.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(1024,65)});
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText('Esperando al procesador de archivos…',{exact:true}).waitFor();
      assert.equal((await rows()).length,4);await page.reload();await panel.getByRole('heading',{name:'Carga privada'}).waitFor();
      assert.equal(await panel.getByLabel('Archivo MP3 o PDF').inputValue(),'');assert.equal(await panel.getByRole('button',{name:'Reintentar carga',exact:true}).count(),0);assert.equal((await rows()).length,4);
    });
    await check('R2 no configurado muestra un rechazo definitivo y libera el selector',async()=>{
      await server.stop();
      server=startServer(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',SNIPERS_ENABLED:'true',NEXTAUTH_URL:base,NEXT_PUBLIC_APP_URL:base},windowsHide:true},3100,log);
      await server.waitReady();await page.reload();await panel.getByRole('heading',{name:'Carga privada'}).waitFor();
      await panel.getByLabel('Archivo MP3 o PDF').setInputFiles({name:'sin-r2.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10,65)});
      await panel.getByRole('button',{name:'Subir archivo privado'}).click();await panel.getByText(/Falta conectar R2 de prueba/).waitFor();
      assert.equal(await panel.getByLabel('Archivo MP3 o PDF').isEnabled(),true);assert.equal((await rows()).length,4);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  }finally{
    stopping=true;if(loop)await loop;
    for(const row of await rows())if(['PREPARING','UPLOADING','COMPLETING'].includes(row.status))await cancelUpload(pool,actor,{operationId:randomUUID(),uploadId:row.id},()=>storage);
    if(page)await page.screenshot({path:'.local/snipers/phase3b2b/browser-final.png'}).catch(()=>{});
    if(browser)await browser.close();if(server)await server.stop();if(fixture)await fixture.stop();log.end();await pool.end();
    fs.writeFileSync('.local/snipers/phase3b2b/browser-results.json',JSON.stringify({results,errors,blocked,storage:'local HTTP S3-shaped fixture; not real R2',vpsValidated:false},null,2));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
