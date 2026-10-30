import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fail, npmBackup, profilePath, root, runPg, pgEnv } from '../phase0/local';
import { localProfile, verifyDatabase, runnerEnv } from '../phase1/guard';
import { existingStructure } from '../phase1/evidence';

const head = '6d7d727edc40f5cfe47f598121e231c3bff823cf';
const baselineFile = '.local/snipers/phase3b1-baseline.json';
const hash = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const protectedFiles = ['.env', '.env.snipers.local', '.vscode/settings.json', 'src/lib/snipers/operations.ts',
  'src/lib/snipers/permissions.ts', 'src/lib/snipers/commercial.ts',
  'src/lib/snipers/preview.ts', 'src/lib/snipers/session.ts', 'prisma/snipers-review/phase1.sql'];
function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['snapshot','check','migrate','test','browser','build','typecheck','lint','validate','diff'].includes(action)) throw new Error('Acción 3B-1 inválida.');
  const p = localProfile(); verifyDatabase(p);
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error('No se pudo verificar Git.');
    return r.stdout.trim();
  };
  if (git(['branch','--show-current']) !== 'feature/snipers-campus' || git(['rev-parse','HEAD']) !== head || p.SNIPERS_ENABLED !== 'false') throw new Error('Rama, HEAD o flag persistente incorrectos.');
  const schema = () => runPg('pg_dump', ['--schema-only','--no-owner','--no-privileges'], pgEnv(p.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm, '').replace(/\r\n/g,'\n');
  if (action === 'snapshot') {
    npmBackup(profilePath);
    fs.writeFileSync(baselineFile, JSON.stringify({ head, hashes: Object.fromEntries(protectedFiles.map(f=>[f,hash(f)])), campus: existingStructure(p), schema: schema() }, null, 2), { flag: 'wx' });
    console.log('Baseline y backup local verificados.'); return;
  }
  const baseline = JSON.parse(fs.readFileSync(baselineFile,'utf8'));
  // The authorized academic-helper extraction changes queries.ts. Freeze its current
  // revision throughout each check; keep all other original baseline checks intact.
  const academicQueryHash = hash('src/lib/snipers/queries.ts');
  function preserve() {
    if (!protectedFiles.every(f=>hash(f)===baseline.hashes[f])) throw new Error('Cambió un archivo protegido.');
    if (hash('src/lib/snipers/queries.ts') !== academicQueryHash) throw new Error('Cambió la consulta académica durante la verificación.');
    if (existingStructure(p).structure !== baseline.campus.structure) throw new Error('Cambió el esquema anterior del campus.');
  }
  preserve();
  if (action === 'check') { console.log('3B-1: identidad, rama, HEAD, flag y archivos protegidos verificados.'); return; }
  if (['migrate','test','browser'].includes(action)) npmBackup(profilePath);
  const networkTrace = path.join(root,`.local/snipers/phase3b1-${action}-network.jsonl`);
  fs.writeFileSync(networkTrace,'');
  const env = { ...runnerEnv(p), SNIPERS_PHASE3B1_LOCAL:'1', SNIPERS_PHASE3A_LOCAL:'1', NEXT_TELEMETRY_DISABLED:'1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.join(root,'scripts/phase3a/font-responses.cjs'),
    SNIPERS_NETWORK_TRACE:networkTrace,
    NODE_OPTIONS:`--require "${path.join(root,'scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"` };
  const before = schema();
  const commands: [string,string[]][] = [];
  if (action === 'migrate') {
    const source = 'prisma/snipers-review/phase3b1.sql';
    const target = '.local/snipers/phase1-migrations/002_snipers_phase3b1/migration.sql';
    if (fs.existsSync(target) && hash(source)!==hash(target)) throw new Error('Migración local distinta; no se sobrescribe.');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if (!fs.existsSync(target)) fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    commands.push(['node_modules/prisma/build/index.js',['migrate','deploy','--config','scripts/phase1/snipers.local.config.ts']]);
  } else if (action==='test') commands.push(['node_modules/tsx/dist/cli.mjs',['--test','--test-concurrency=1','scripts/phase3b1/unit.test.ts','scripts/phase3b1/integration.test.ts','scripts/phase3b1/actions.test.cjs']]);
  else if (action==='browser') commands.push(['node_modules/tsx/dist/cli.mjs',['scripts/phase3b1/browser.cjs']]);
  else if (action==='build') commands.push(['node_modules/prisma/build/index.js',['generate']],['node_modules/next/dist/bin/next',['build','--webpack']]);
  else if (action==='typecheck') commands.push(['node_modules/typescript/bin/tsc',['--noEmit','--incremental','false']]);
  else if (action==='validate') commands.push(['node_modules/prisma/build/index.js',['validate','--config','scripts/phase1/snipers.local.config.ts']]);
  else if (action==='diff') commands.push(['node_modules/prisma/build/index.js',['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code','--config','scripts/phase1/snipers.local.config.ts']]);
  else commands.push(['node_modules/eslint/bin/eslint.js',['--max-warnings=0','scripts/phase3b1','src/lib/snipers','src/components/snipers','src/app/actions/snipers-content.ts','src/app/mi-campus/snipers','scripts/phase1/integration.test.ts']]);
  let passed=true; let output='';
  for (const [file,args] of commands) {
    const r=spawnSync(process.execPath,[file,...args],{cwd:root,env:{...env,NODE_ENV:action==='build'?'production':'development'},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:32*1024*1024});
    output+=(r.stdout||'')+(r.stderr||'');
    if(r.error||r.status!==0){passed=false;break;}
  }
  fs.writeFileSync(`.local/snipers/phase3b1-${action}.log`,output); process.stdout.write(output);
  preserve(); const after=schema();
  if(action!=='migrate'&&before!==after)throw new Error('Cambió el esquema durante una verificación.');
  const connections=fs.readFileSync(networkTrace,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l) as {host:string;port:number;allowed:boolean});
  const localOnly=connections.every(c=>!c.allowed||['127.0.0.1','::1','localhost'].includes(c.host));
  fs.writeFileSync(`.local/snipers/phase3b1-${action}-evidence.json`,JSON.stringify({action,passed,head,protectedFiles:Object.fromEntries(protectedFiles.map(f=>[f,baseline.hashes[f]])),academicQueryHash,previousAcademicQueryHash:baseline.hashes['src/lib/snipers/queries.ts'],campusPreserved:true,schemaBefore:before,schemaAfter:after,localOnly,destination:'127.0.0.1:55432/snipers_dev',persistentFlag:p.SNIPERS_ENABLED,allowedDestinations:[...new Set(connections.filter(c=>c.allowed).map(c=>`${c.host}:${c.port}`))]},null,2));
  if(!localOnly||!passed)throw new Error(`Falló ${action}; consultar evidencia local.`);
}
try {main();} catch(error){fail(error);}
