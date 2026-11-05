// Narrow local launcher; never loads the production .env or changes the persistent flag.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { localProfile, verifyDatabase, runnerEnv } from '../phase1/guard';
import { npmBackup, profilePath, runPg, pgEnv, root, fail } from '../phase0/local';

function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['test','typecheck','lint','build','browser'].includes(action)) throw new Error('Acción 3B-2B inválida.');
  const p = localProfile(); verifyDatabase(p);
  const git = (args: string[]) => { const r = spawnSync('git', args, { encoding: 'utf8', windowsHide: true }); if (r.status) throw new Error('Git no disponible.'); return r.stdout.trim(); };
  if (git(['branch','--show-current']) !== 'feature/snipers-campus' || git(['rev-parse','HEAD']) !== '1fab14edf6191984a4a466f546553821e4b3cac0' || p.SNIPERS_ENABLED !== 'false') throw new Error('Rama, HEAD o flag inesperado.');
  const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const protectedFiles = [...new Set([...git(['ls-files','-z']).split('\0').filter(Boolean), ...fs.readdirSync(root).filter(f => f.startsWith('.env') && fs.statSync(f).isFile())])];
  const beforeFiles = Object.fromEntries(protectedFiles.map(f => [f, hash(f)]));
  const schema = () => runPg('pg_dump', ['--schema-only','--no-owner','--no-privileges'], pgEnv(p.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm,'').replace(/\r\n/g,'\n');
  const before = schema();
  const dir = '.local/snipers/phase3b2b'; fs.mkdirSync(dir, { recursive: true });
  for (const suffix of ['.log','-evidence.json','-network.jsonl']) {
    const file = `${dir}/${action}${suffix}`;
    if (fs.existsSync(file)) fs.copyFileSync(file, `${dir}/${action}-${Date.now()}-previous${suffix}`, fs.constants.COPYFILE_EXCL);
  }
  let backup: ReturnType<typeof npmBackup> | null = null;
  if (['test','browser'].includes(action)) {
    backup = npmBackup(profilePath);
    const m = JSON.parse(fs.readFileSync(backup.manifest,'utf8'));
    if (m.sha256 !== hash(backup.archive) || m.bytes !== fs.statSync(backup.archive).size || m.database !== 'snipers_dev' || m.host !== '127.0.0.1' || m.port !== '55432' || !m.archiveListed) throw new Error('Backup no verificado.');
  }
  const env = { ...runnerEnv(p), SNIPERS_PHASE3B2B_LOCAL: '1', SNIPERS_PHASE3A_LOCAL: '1', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(root,'scripts/phase3a/font-responses.cjs'),
    SNIPERS_NETWORK_TRACE: path.join(root,dir,`${action}-network.jsonl`),
    NODE_OPTIONS: `--require "${path.join(root,'scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"` } as NodeJS.ProcessEnv;
  for (const key of Object.keys(env)) if (key.startsWith('SNIPERS_R2_') || key.startsWith('SNIPERS_UPLOAD_')) env[key] = '';
  fs.writeFileSync(env.SNIPERS_NETWORK_TRACE!, '');
  const args = action === 'test' ? ['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','scripts/phase3b2b/integration.test.ts','scripts/phase3b2b/actions.test.cjs']
    : action === 'typecheck' ? ['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']
    : action === 'lint' ? ['node_modules/eslint/bin/eslint.js','--max-warnings=0','scripts/phase3b2b','scripts/phase1/integration.test.ts','src/lib/snipers/upload-contracts.ts','src/lib/snipers/upload-storage.ts','src/lib/snipers/uploads.ts','src/lib/snipers/upload-processor.ts','src/lib/snipers/upload-gateway.ts','src/lib/snipers/upload-server.ts','src/lib/snipers/upload-client.ts','src/app/actions/snipers-uploads.ts','src/components/snipers/PrivateUploads.tsx','src/app/mi-campus/snipers/gestion/contenido/clases/[id]/page.tsx']
    : action === 'browser' ? ['node_modules/tsx/dist/cli.mjs','scripts/phase3b2b/browser.cjs']
    : ['node_modules/next/dist/bin/next','build','--webpack'];
  const r = spawnSync(process.execPath,args,{cwd:root,env:{...env,NODE_ENV:action==='build'?'production':'development'},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16*1024*1024});
  const output = (r.stdout ?? '')+(r.stderr ?? ''); fs.writeFileSync(`${dir}/${action}.log`,output);process.stdout.write(output);
  const unchanged = schema()===before && protectedFiles.every(f=>hash(f)===beforeFiles[f]);
  const network = fs.readFileSync(env.SNIPERS_NETWORK_TRACE!,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line) as {allowed:boolean;host:string});
  const localOnly=network.every(n=>!n.allowed||['127.0.0.1','::1','localhost'].includes(n.host));
  fs.writeFileSync(`${dir}/${action}-evidence.json`,JSON.stringify({action,passed:r.status===0&&!r.error,backup,schemaUnchanged:unchanged,persistentFlag:p.SNIPERS_ENABLED,localOnly,realR2Validated:false,realVpsValidated:false},null,2));
  if(!unchanged||!localOnly)throw new Error('Cambió un archivo protegido/esquema o salió una conexión externa.');
  if(r.error||r.status!==0)throw new Error(`Falló ${action}; consultar ${dir}/${action}.log`);
}
try { main(); } catch(error) { fail(error); }
