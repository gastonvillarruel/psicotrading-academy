// Local-only runner. No historical launcher, profile or migration is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {localProfile,verifyDatabase,runnerEnv} from '../phase1/guard';
import {npmBackup,profilePath,runPg,pgEnv,root,fail} from '../phase0/local';

const dir='.local/snipers/phase3b2e';
const expectedHead='2091e5c2dd1b2508bee8ca8df526a61cbaec639b';
const allowed=['src/lib/snipers/storage-cleanup.ts','src/lib/snipers/upload-storage.ts','src/lib/snipers/upload-processor.ts',
  'src/lib/snipers/file-contracts.ts','scripts/phase3b2b/worker.ts','config/snipers-uploads.env.example',
  'scripts/phase1/integration.test.ts','scripts/phase3b2b/integration.test.ts','docs/snipers-phase3b2e.md'];
const mutable=(f:string)=>allowed.includes(f)||f.startsWith('scripts/phase3b2e/');
const hash=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function git(args:string[]){const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(r.status)throw Error('Git no disponible.');return r.stdout.trim();}
function main(){
  const action=process.argv[2];
  if(process.argv.length!==3||!['init','test','regression','typecheck','lint','build','verify'].includes(action))throw Error('Acción 3B-2E inválida.');
  const p=localProfile();verifyDatabase(p);
  if(git(['branch','--show-current'])!=='feature/snipers-campus'||git(['rev-parse','HEAD'])!==expectedHead||p.SNIPERS_ENABLED!=='false')throw Error('Rama, HEAD o flag incorrectos.');
  const chain:Record<string,string>={
    '000_local_development_only':'scripts/phase1/local-artifacts/init-local.sql','001_snipers_phase1':'prisma/snipers-review/phase1.sql',
    '002_snipers_phase3b1':'prisma/snipers-review/phase3b1.sql','003_snipers_phase3b2a':'prisma/snipers-review/phase3b2a.sql',
    '004_snipers_phase3b2a_corrections':'prisma/snipers-review/phase3b2a-corrections.sql',
    '005_snipers_phase3b2a_finalization':'prisma/snipers-review/phase3b2a-finalization.sql',
    '006_snipers_phase3b2a_retention':'prisma/snipers-review/phase3b2a-retention.sql',
    '007_snipers_phase3b2a_cleanup_guard':'prisma/snipers-review/phase3b2a-cleanup-guard.sql'};
  const applied=runPg('psql',['-X','-At','-v','ON_ERROR_STOP=1'],pgEnv(p.DATABASE_URL),undefined,
    'SELECT migration_name||\'|\'||checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name;').trim().split(/\r?\n/);
  if(applied.length!==Object.keys(chain).length)throw Error('Cadena local inesperada.');
  for(const row of applied){const [name,checksum]=row.split('|');if(!chain[name]||hash(chain[name])!==checksum||hash(`.local/snipers/phase1-migrations/${name}/migration.sql`)!==checksum)throw Error('Checksum local inesperado.');}
  const inventory=()=>[...new Set([...git(['ls-files','-z']).split('\0').filter(Boolean),...fs.readdirSync(root).filter(f=>f.startsWith('.env')&&fs.statSync(f).isFile())])].sort();
  const schema=()=>runPg('pg_dump',['--schema-only','--no-owner','--no-privileges'],pgEnv(p.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm,'').replace(/\r\n/g,'\n');
  const backup=()=>{
    const b=npmBackup(profilePath),m=JSON.parse(fs.readFileSync(b.manifest,'utf8'));
    if(m.sha256!==hash(b.archive)||m.bytes!==fs.statSync(b.archive).size||!m.archiveListed||m.database!=='snipers_dev'||m.host!=='127.0.0.1'||m.port!=='55432')throw Error('Backup no verificado.');
    return b;
  };
  const baselinePath=`${dir}/baseline.json`;
  if(action==='init'){
    if(fs.existsSync(baselinePath))throw Error('Baseline existente: no se sobrescribe.');
    const b=backup();
    fs.writeFileSync(baselinePath,JSON.stringify({head:expectedHead,files:Object.fromEntries(inventory().map(f=>[f,hash(f)])),schema:schema(),backup:b},null,2),{flag:'wx'});
    console.log('Baseline y backup local verificados.');return;
  }
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')) as {head:string;files:Record<string,string>;schema:string};
  const verify=()=>{
    if(baseline.head!==expectedHead||schema()!==baseline.schema)throw Error('Cambió HEAD o esquema.');
    for(const [f,h] of Object.entries(baseline.files))if(!mutable(f)&&hash(f)!==h)throw Error(`Archivo protegido modificado: ${f}`);
    if(inventory().filter(f=>f.startsWith('.env')).join('|')!==Object.keys(baseline.files).filter(f=>f.startsWith('.env')).join('|'))throw Error('Cambió el inventario de perfiles.');
    for(const f of git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean))if(!mutable(f))throw Error(`Archivo nuevo fuera del alcance: ${f}`);
  };
  verify();
  const before=Object.fromEntries([...inventory(),...git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean)].map(f=>[f,hash(f)]));
  const b=['test','regression'].includes(action)?backup():null;
  const prefix=`${dir}/${action}-${Date.now()}`,trace=path.join(root,`${prefix}-network.jsonl`);fs.writeFileSync(trace,'');
  const env={...runnerEnv(p),SNIPERS_PHASE3B2E_LOCAL:'1',SNIPERS_PHASE3B2A_LOCAL:'1',SNIPERS_PHASE3B2B_LOCAL:'1',SNIPERS_PHASE3B2C_LOCAL:'1',SNIPERS_PHASE3B2D_LOCAL:'1',SNIPERS_PHASE3B1_LOCAL:'1',SNIPERS_PHASE3A_LOCAL:'1',
    SNIPERS_STORAGE_CLEANUP_ENABLED:'false',SNIPERS_UPLOAD_PROCESSOR_ENABLED:'false',SNIPERS_FILE_VALIDATION_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.join(root,'scripts/phase3a/font-responses.cjs'),SNIPERS_NETWORK_TRACE:trace,
    NODE_OPTIONS:`--require "${path.join(root,'scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"`};
  const tsx='node_modules/tsx/dist/cli.mjs';
  const tests=['scripts/phase3b2a/contracts.test.ts','scripts/phase3b2a/integration.test.ts','scripts/phase3b2b/integration.test.ts','scripts/phase3b2b/actions.test.cjs',
    'scripts/phase3b2c/validation.test.ts','scripts/phase3b2c/integration.test.ts','scripts/phase3b2c/storage.test.ts','scripts/phase3b2d/integration.test.ts','scripts/phase3b2d/storage.test.ts','scripts/phase3b2d/actions.test.cjs','scripts/phase1/integration.test.ts'];
  const commands=action==='test'?[[tsx,'--test','--test-concurrency=1','scripts/phase3b2e/integration.test.ts','scripts/phase3b2e/storage.test.ts']]
    :action==='regression'?[[tsx,'--test','--test-concurrency=1',...tests]]
    :action==='typecheck'?[['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']]
    :action==='lint'?[['node_modules/eslint/bin/eslint.js','--max-warnings=0','scripts/phase3b2e',...allowed.filter(f=>/\.[ct]s$/.test(f))]]
    :action==='build'?[['node_modules/prisma/build/index.js','generate'],['node_modules/next/dist/bin/next','build','--webpack']]:[];
  let passed=true,output='';
  for(const args of commands){const r=spawnSync(process.execPath,args,{cwd:root,env:{...env,NODE_ENV:action==='build'?'production':'development'},encoding:'utf8',windowsHide:true,timeout:900000,maxBuffer:24*1024*1024});output+=(r.stdout??'')+(r.stderr??'');if(r.status!==0||r.error){passed=false;break;}}
  fs.writeFileSync(`${prefix}.log`,output);process.stdout.write(output);
  verify();
  const unchanged=Object.entries(before).every(([f,h])=>hash(f)===h);
  const network=fs.readFileSync(trace,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s) as {allowed:boolean;host:string});
  const localOnly=network.every(n=>!n.allowed||['127.0.0.1','localhost','::1'].includes(n.host));
  fs.writeFileSync(`${prefix}-evidence.json`,JSON.stringify({action,head:expectedHead,passed,backup:b,unchanged,localOnly,protectedFilesPreserved:true,schemaUnchanged:true,persistentFlag:p.SNIPERS_ENABLED,realR2Validated:false},null,2));
  if(!passed||!unchanged||!localOnly)throw Error(`Falló ${action}. Evidencia: ${prefix}.log`);
}
let lock:number|undefined;const lockPath='.local/snipers/phase3b2c-tests.lock';
try{fs.mkdirSync(dir,{recursive:true});lock=fs.openSync(lockPath,'wx',0o600);main();}catch(error){fail(error);}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(lockPath);}}
