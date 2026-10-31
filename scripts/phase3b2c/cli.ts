// Controlled local verification only. Never load production profiles or execute analyzers unsandboxed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { localProfile, verifyDatabase, runnerEnv } from '../phase1/guard';
import { npmBackup, profilePath, runPg, pgEnv, root, fail } from '../phase0/local';

function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['test','test-transfer','typecheck','lint'].includes(action)) throw new Error('Acción 3B-2C inválida.');
  const p = localProfile(); verifyDatabase(p);
  const git = (args: string[]) => {
    const result = spawnSync('git',args,{encoding:'utf8',windowsHide:true});
    if (result.status) throw new Error('Git no disponible.'); return result.stdout.trim();
  };
  if (git(['branch','--show-current']) !== 'feature/snipers-campus' || git(['rev-parse','HEAD']) !== '9a2ea7e71afe0ea20b15290eccbf0e0f9f1eb3bc' || p.SNIPERS_ENABLED !== 'false') throw new Error('Rama, HEAD o flag inesperado.');
  const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const files = [...new Set([...git(['ls-files','-z']).split('\0').filter(Boolean), ...fs.readdirSync(root).filter(f => f.startsWith('.env') && fs.statSync(f).isFile())])];
  const beforeFiles = Object.fromEntries(files.map(f => [f,hash(f)]));
  const schema = () => runPg('pg_dump',['--schema-only','--no-owner','--no-privileges'],pgEnv(p.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm,'').replace(/\r\n/g,'\n');
  const before = schema();
  const dir = '.local/snipers/phase3b2c'; fs.mkdirSync(dir,{recursive:true});
  const prefix = `${dir}/${action}-${Date.now()}`;
  let backup: ReturnType<typeof npmBackup> | null = null;
  if (action === 'test' || action === 'test-transfer') {
    backup = npmBackup(profilePath);
    const m = JSON.parse(fs.readFileSync(backup.manifest,'utf8'));
    if (m.sha256 !== hash(backup.archive) || m.bytes !== fs.statSync(backup.archive).size || !m.archiveListed
      || m.database !== 'snipers_dev' || m.host !== '127.0.0.1' || m.port !== '55432') throw new Error('Backup no verificado.');
  }
  const env = { ...runnerEnv(p), SNIPERS_PHASE3B2C_LOCAL:'1', SNIPERS_PHASE3B2B_LOCAL:'1', SNIPERS_PHASE3A_LOCAL:'1', NEXT_TELEMETRY_DISABLED:'1',
    SNIPERS_NETWORK_TRACE:path.join(root,`${prefix}-network.jsonl`),
    NODE_OPTIONS:`--require "${path.join(root,'scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"` };
  fs.writeFileSync(env.SNIPERS_NETWORK_TRACE,'');
  const args = action === 'test' ? ['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','scripts/phase3b2c/validation.test.ts','scripts/phase3b2c/integration.test.ts','scripts/phase3b2c/storage.test.ts']
    : action === 'test-transfer' ? ['node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1','scripts/phase3b2b/integration.test.ts']
    : action === 'typecheck' ? ['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']
    : ['node_modules/eslint/bin/eslint.js','--max-warnings=0','scripts/phase3b2c','src/lib/snipers/file-validation.ts','src/lib/snipers/file-analyzers.ts','src/lib/snipers/file-processor.ts','src/lib/snipers/upload-storage.ts','src/lib/snipers/upload-processor.ts','scripts/phase3b2b/worker.ts'];
  const r = spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:8*1024*1024});
  const output = (r.stdout ?? '')+(r.stderr ?? ''); fs.writeFileSync(`${prefix}.log`,output); process.stdout.write(output);
  const unchanged = schema() === before && files.every(f => hash(f) === beforeFiles[f]);
  const network = fs.readFileSync(env.SNIPERS_NETWORK_TRACE,'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { allowed:boolean; host:string });
  const localOnly = network.every(n => !n.allowed || ['127.0.0.1','::1','localhost'].includes(n.host));
  fs.writeFileSync(`${prefix}-evidence.json`,JSON.stringify({action,passed:r.status===0&&!r.error,backup,schemaAndProfilesUnchanged:unchanged,persistentFlag:p.SNIPERS_ENABLED,localOnly,realAnalyzersValidated:false,realR2Validated:false,realVpsValidated:false},null,2));
  if (!unchanged || !localOnly) throw new Error('Cambió esquema/perfil/archivo o hubo red externa.');
  if (r.error || r.status !== 0) throw new Error(`Falló ${action}; consultar ${prefix}.log`);
}
const lockPath=path.join(root,'.local/snipers/phase3b2c-tests.lock');
let lock: number | undefined;
try {
  if (['test','test-transfer'].includes(process.argv[2])) {
    fs.mkdirSync(path.dirname(lockPath),{recursive:true});
    lock=fs.openSync(lockPath,'wx',0o600);
  }
  main();
} catch (error) { fail(error); }
finally { if(lock!==undefined) {fs.closeSync(lock);fs.unlinkSync(lockPath);} }
