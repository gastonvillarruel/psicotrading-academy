// Local-only verification. Reuse the established profile, identity, backup and network guards.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {localProfile,verifyDatabase,runnerEnv} from '../phase1/guard';
import {npmBackup,profilePath,runPg,pgEnv,root,fail} from '../phase0/local';

const allowed=[
  'src/lib/snipers/content-contracts.ts','src/lib/snipers/content.ts','src/lib/snipers/gateway.ts','src/lib/snipers/server.ts','src/lib/snipers/upload-storage.ts',
  'src/app/actions/snipers-content.ts','src/components/snipers/ClassEditor.tsx','src/components/snipers/EditorialManagement.tsx','src/components/snipers/PrivateUploads.tsx',
  'src/app/mi-campus/snipers/biblioteca/[id]/page.tsx','config/snipers-r2-cors.example.json','scripts/phase3b1/actions.test.cjs','scripts/phase3b2b/integration.test.ts',
];
const dir='.local/snipers/phase3b2d';
const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function main(){
  const action=process.argv[2];
  if(process.argv.length!==3||!['test','regression','build','browser','typecheck','lint'].includes(action))throw Error('Acción 3B-2D inválida.');
  const p=localProfile();verifyDatabase(p);
  const git=(args:string[])=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(r.status)throw Error('Git no disponible.');return r.stdout.trim();};
  const head=git(['rev-parse','HEAD']);
  if(git(['branch','--show-current'])!=='feature/snipers-campus'||head!=='977fc143e07dc7eaca128b600fb762b7a35c94c2'||p.SNIPERS_ENABLED!=='false')throw Error('Rama/HEAD/flag incorrectos.');
  const baseline=JSON.parse(fs.readFileSync(`${dir}/baseline.json`,'utf8')) as {head:string;files:Record<string,string>};
  if(baseline.head!==head)throw Error('Baseline de otro HEAD.');
  for(const [f,value] of Object.entries(baseline.files))if(!allowed.includes(f)&&hash(f)!==value)throw Error(`Archivo protegido modificado: ${f}`);
  const profiles=()=>fs.readdirSync(root).filter(f=>f.startsWith('.env')&&fs.statSync(f).isFile()).sort().join('|');
  const beforeProfiles=profiles();
  const files=Object.keys(baseline.files),beforeFiles=Object.fromEntries(files.map(f=>[f,hash(f)]));
  const schema=()=>runPg('pg_dump',['--schema-only','--no-owner','--no-privileges'],pgEnv(p.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm,'').replace(/\r\n/g,'\n');
  const before=schema(),prefix=`${dir}/${action}-${Date.now()}`;
  let backup:ReturnType<typeof npmBackup>|null=null;
  if(['test','regression','browser'].includes(action)){
    backup=npmBackup(profilePath);const m=JSON.parse(fs.readFileSync(backup.manifest,'utf8'));
    if(m.sha256!==hash(backup.archive)||m.bytes!==fs.statSync(backup.archive).size||!m.archiveListed||m.database!=='snipers_dev'||m.host!=='127.0.0.1'||m.port!=='55432')throw Error('Backup no verificado.');
  }
  const trace=path.join(root,`${prefix}-network.jsonl`);fs.writeFileSync(trace,'');
  const env={...runnerEnv(p),SNIPERS_PHASE3B2D_LOCAL:'1',SNIPERS_PHASE3B1_LOCAL:'1',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_PHASE3B2C_LOCAL:'1',SNIPERS_PHASE3A_LOCAL:'1',NEXT_TELEMETRY_DISABLED:'1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.join(root,'scripts/phase3a/font-responses.cjs'),SNIPERS_NETWORK_TRACE:trace,NODE_OPTIONS:`--require "${path.join(root,'scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"`};
  const tsx='node_modules/tsx/dist/cli.mjs';
  const commands=action==='test'?[[tsx,'--test','--test-concurrency=1','scripts/phase3b2d/integration.test.ts','scripts/phase3b2d/storage.test.ts','scripts/phase3b2d/actions.test.cjs']]
    :action==='regression'?[[tsx,'--test','--test-concurrency=1','scripts/phase3b1/unit.test.ts','scripts/phase3b1/integration.test.ts','scripts/phase3b1/actions.test.cjs','scripts/phase3b2b/integration.test.ts','scripts/phase3b2b/actions.test.cjs','scripts/phase3b2c/integration.test.ts','scripts/phase3b2c/storage.test.ts']]
    :action==='build'?[['node_modules/prisma/build/index.js','generate'],['node_modules/next/dist/bin/next','build','--webpack']]
    :action==='browser'?[[tsx,'scripts/phase3b2d/browser.cjs']]
    :action==='typecheck'?[['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']]
    :[['node_modules/eslint/bin/eslint.js','--max-warnings=0','scripts/phase3b2d',...allowed.filter(f=>/\.[ct]sx?$/.test(f)),'src/components/snipers/PrivateResources.tsx']];
  let passed=true,output='';
  for(const args of commands){const r=spawnSync(process.execPath,args,{cwd:root,env:{...env,NODE_ENV:action==='build'?'production':'development'},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16*1024*1024});output+=(r.stdout??'')+(r.stderr??'');if(r.status!==0||r.error){passed=false;break;}}
  fs.writeFileSync(`${prefix}.log`,output);process.stdout.write(output);
  const unchanged=schema()===before&&profiles()===beforeProfiles&&files.every(f=>hash(f)===beforeFiles[f]);
  const network=fs.readFileSync(trace,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s) as {allowed:boolean;host:string});
  const localOnly=network.every(n=>!n.allowed||['127.0.0.1','localhost','::1'].includes(n.host));
  fs.writeFileSync(`${prefix}-evidence.json`,JSON.stringify({action,head,passed,backup,unchanged,localOnly,persistentFlag:p.SNIPERS_ENABLED,realR2Validated:false},null,2));
  if(!passed||!unchanged||!localOnly)throw Error(`Falló ${action}. Evidencia: ${prefix}.log`);
}
let lock:number|undefined;const lockPath=path.join(root,'.local/snipers/phase3b2c-tests.lock');
try{fs.mkdirSync(dir,{recursive:true});lock=fs.openSync(lockPath,'wx',0o600);main();}catch(error){fail(error);}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(lockPath);}}
