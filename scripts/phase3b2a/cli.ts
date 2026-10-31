import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fail, npmBackup, pgEnv, profilePath, root, runPg } from '../phase0/local';
import { localProfile, localSqlGuard, runnerEnv, verifyDatabase } from '../phase1/guard';

const head = 'c9132806f52f5be499471b72e0ee6943a9bd94b9';
const directory = '.local/snipers/phase3b2a';
const baselinePath = `${directory}/baseline.json`;
const mutable = new Set(['prisma/schema.prisma', 'scripts/phase1/integration.test.ts', 'scripts/phase3a/browser.cjs']);
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function git(args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('No se pudo comprobar Git.');
  return result.stdout.trim();
}
function verifiedBackup() {
  const result = npmBackup(profilePath);
  const manifest = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
  if (manifest.host !== '127.0.0.1' || manifest.port !== '55432' || manifest.database !== 'snipers_dev'
    || manifest.bytes !== fs.statSync(result.archive).size || manifest.sha256 !== hash(result.archive)
    || manifest.contents !== 'schema-and-data' || manifest.archiveListed !== true) throw new Error('Manifiesto de backup inválido.');
  return { ...result, sha256: manifest.sha256, bytes: manifest.bytes, restorationTested: false };
}
type Baseline = { hashes: Record<string, string>; schema: string; resources: string; backup: ReturnType<typeof verifiedBackup> };
function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['snapshot', 'check', 'prepare', 'harden', 'migrate', 'test', 'regression', 'browser', 'browser3b1', 'build', 'typecheck', 'lint', 'validate', 'diff'].includes(action)) throw new Error('Acción 3B-2A inválida.');
  const profile = localProfile(); verifyDatabase(profile);
  if (git(['branch', '--show-current']) !== 'feature/snipers-campus' || git(['rev-parse', 'HEAD']) !== head || profile.SNIPERS_ENABLED !== 'false') throw new Error('Rama, HEAD o flag persistente incorrectos.');
  const sql = (statement: string) => runPg('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], pgEnv(profile.DATABASE_URL), undefined, statement).trim();
  const chainSources: Record<string, string> = {
    '000_local_development_only': 'scripts/phase1/local-artifacts/init-local.sql', '001_snipers_phase1': 'prisma/snipers-review/phase1.sql',
    '002_snipers_phase3b1': 'prisma/snipers-review/phase3b1.sql', '003_snipers_phase3b2a': 'prisma/snipers-review/phase3b2a.sql',
    '004_snipers_phase3b2a_corrections': 'prisma/snipers-review/phase3b2a-corrections.sql', '005_snipers_phase3b2a_finalization': 'prisma/snipers-review/phase3b2a-finalization.sql',
    '006_snipers_phase3b2a_retention': 'prisma/snipers-review/phase3b2a-retention.sql',
    '007_snipers_phase3b2a_cleanup_guard': 'prisma/snipers-review/phase3b2a-cleanup-guard.sql',
  };
  for (const row of sql('SELECT migration_name||\'|\'||checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name;').split(/\r?\n/)) {
    const [name, checksum] = row.split('|'); const source = chainSources[name];
    if (!source || hash(source) !== checksum || hash(`.local/snipers/phase1-migrations/${name}/migration.sql`) !== checksum) throw new Error('Checksum o migración local inesperada.');
  }
  const schema = () => runPg('pg_dump', ['--schema-only', '--no-owner', '--no-privileges'], pgEnv(profile.DATABASE_URL)).replace(/^\\(?:un)?restrict .*\r?\n/gm, '').replace(/\r\n/g, '\n');
  const resourceData = () => sql('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),\'[]\'::jsonb)::text FROM "SnipersResource" r;');
  if (action === 'snapshot') {
    if (fs.existsSync(baselinePath)) throw new Error('La baseline existente no se sobrescribe.');
    const backup = verifiedBackup();
    const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean).filter(f => !mutable.has(f));
    const envFiles = fs.readdirSync(root).filter(f => f.startsWith('.env') && fs.statSync(f).isFile());
    const files = [...new Set([...tracked, ...envFiles, '.vscode/settings.json'])];
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync('prisma/schema.prisma', `${directory}/before.prisma`, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(baselinePath, JSON.stringify({ head, hashes: Object.fromEntries(files.map(f => [f, hash(f)])), schema: schema(), resources: resourceData(), backup }, null, 2), { flag: 'wx' });
    console.log('Baseline, identidad local y backup/manifiesto verificados.'); return;
  }
  const baseline: Baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  function preserve() {
    for (const [file, expected] of Object.entries(baseline.hashes)) if (!mutable.has(file) && hash(file) !== expected) throw new Error(`Cambió un archivo protegido: ${file}`);
    if (profile.SNIPERS_ENABLED !== 'false') throw new Error('Cambió el flag persistente.');
    const envNames = fs.readdirSync(root).filter(f => f.startsWith('.env') && fs.statSync(f).isFile()).sort();
    if (JSON.stringify(envNames) !== JSON.stringify(Object.keys(baseline.hashes).filter(f => f.startsWith('.env')).sort())) throw new Error('Cambió el inventario de perfiles.');
  }
  preserve();
  if (action === 'check') { console.log('Guardas 3B-2A y archivos protegidos correctos.'); return; }
  const backup = ['migrate', 'test', 'regression', 'browser', 'browser3b1'].includes(action) ? verifiedBackup() : null;
  const backups = backup ? [backup] : [];
  const trace = path.join(root, `${directory}/${action}-network.jsonl`);
  fs.writeFileSync(trace, '');
  const env = { ...runnerEnv(profile), SNIPERS_PHASE3B2A_LOCAL: '1', SNIPERS_PHASE2_LOCAL: '1', SNIPERS_PHASE3A_LOCAL: '1', SNIPERS_PHASE3B1_LOCAL: '1', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(root, 'scripts/phase3a/font-responses.cjs'), SNIPERS_NETWORK_TRACE: trace,
    NODE_OPTIONS: `--require "${path.join(root, 'scripts/phase3a/network-guard.cjs').replace(/\\/g, '/')}"` };
  const before = schema();
  let output = ''; let passed = true;
  function run(file: string, args: string[], production = false) {
    const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env: { ...env, NODE_ENV: production ? 'production' : 'development' }, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    output += (result.stdout || '') + (result.stderr || '');
    if (result.error || result.status !== 0) passed = false;
    return result.stdout || '';
  }
  const prisma = (args: string[]) => run('node_modules/prisma/build/index.js', [...args, '--config', 'scripts/phase1/snipers.local.config.ts']);
  const suite = (files: string[]) => run('node_modules/tsx/dist/cli.mjs', ['--test', '--test-concurrency=1', ...files]);
  if (action === 'prepare') {
    const ddl = prisma(['migrate', 'diff', '--from-schema', `${directory}/before.prisma`, '--to-schema', 'prisma/schema.prisma', '--script']);
    if (passed) {
      fs.writeFileSync(`${directory}/generated.sql`, ddl);
      const preflight = `DO $preflight$ BEGIN IF EXISTS (SELECT 1 FROM "SnipersResource" WHERE status IN ('VERIFIED','ARCHIVED')) THEN RAISE EXCEPTION 'Historical resources require review; no automatic repair'; END IF; END $preflight$;\n`;
      if (fs.existsSync('.local/snipers/phase1-migrations/003_snipers_phase3b2a/migration.sql')) throw new Error('El candidato aplicado no se reescribe.');
      fs.writeFileSync('prisma/snipers-review/phase3b2a.sql', '-- REVIEW CANDIDATE. 3B-2A LOCAL ONLY; no production migration.\nBEGIN;\n' + localSqlGuard + preflight + ddl + '\n' + fs.readFileSync('scripts/phase3b2a/constraints.sql', 'utf8') + '\nCOMMIT;\n');
    }
  } else if (action === 'harden') {
    const constraints = fs.readFileSync('scripts/phase3b2a/constraints.sql', 'utf8');
    const functions = constraints.slice(constraints.indexOf('CREATE FUNCTION snipers_file_require_serializable'), constraints.indexOf('DO $triggers$')).replaceAll('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    const content = '-- LOCAL REVIEW CANDIDATE. Corrective function definitions; no data repair.\nBEGIN;\n' + localSqlGuard + functions + '\nCOMMIT;\n';
    const file = 'prisma/snipers-review/phase3b2a-corrections.sql';
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== content) throw new Error('No se reescribe una corrección existente.');
    if (!fs.existsSync(file)) fs.writeFileSync(file, content, { flag: 'wx' });
  } else if (action === 'migrate') {
    const history = sql('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name;').split(/\r?\n/);
    if (history.some(n => !Object.hasOwn(chainSources, n))) throw new Error('Historial local inesperado.');
    const source = 'prisma/snipers-review/phase3b2a.sql';
    const target = '.local/snipers/phase1-migrations/003_snipers_phase3b2a/migration.sql';
    if (fs.existsSync(target) && hash(target) !== hash(source)) throw new Error('Migración existente distinta.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    const correction = 'prisma/snipers-review/phase3b2a-corrections.sql';
    const correctionTarget = '.local/snipers/phase1-migrations/004_snipers_phase3b2a_corrections/migration.sql';
    if (fs.existsSync(correction)) {
      if (fs.existsSync(correctionTarget) && hash(correctionTarget) !== hash(correction)) throw new Error('Corrección aplicada distinta.');
      fs.mkdirSync(path.dirname(correctionTarget), { recursive: true });
      if (!fs.existsSync(correctionTarget)) fs.copyFileSync(correction, correctionTarget, fs.constants.COPYFILE_EXCL);
    }
    const finalization = 'prisma/snipers-review/phase3b2a-finalization.sql';
    const finalizationTarget = '.local/snipers/phase1-migrations/005_snipers_phase3b2a_finalization/migration.sql';
    if (fs.existsSync(finalization)) {
      if (fs.existsSync(finalizationTarget) && hash(finalizationTarget) !== hash(finalization)) throw new Error('Finalización aplicada distinta.');
      fs.mkdirSync(path.dirname(finalizationTarget), { recursive: true });
      if (!fs.existsSync(finalizationTarget)) fs.copyFileSync(finalization, finalizationTarget, fs.constants.COPYFILE_EXCL);
    }
    const retention = 'prisma/snipers-review/phase3b2a-retention.sql';
    const retentionTarget = '.local/snipers/phase1-migrations/006_snipers_phase3b2a_retention/migration.sql';
    if (fs.existsSync(retentionTarget) && hash(retentionTarget) !== hash(retention)) throw new Error('Retención aplicada distinta.');
    fs.mkdirSync(path.dirname(retentionTarget), { recursive: true });
    if (!fs.existsSync(retentionTarget)) fs.copyFileSync(retention, retentionTarget, fs.constants.COPYFILE_EXCL);
    const cleanupGuard = 'prisma/snipers-review/phase3b2a-cleanup-guard.sql';
    const cleanupGuardTarget = '.local/snipers/phase1-migrations/007_snipers_phase3b2a_cleanup_guard/migration.sql';
    if (fs.existsSync(cleanupGuardTarget) && hash(cleanupGuardTarget) !== hash(cleanupGuard)) throw new Error('Guarda de limpieza aplicada distinta.');
    fs.mkdirSync(path.dirname(cleanupGuardTarget), { recursive: true });
    if (!fs.existsSync(cleanupGuardTarget)) fs.copyFileSync(cleanupGuard, cleanupGuardTarget, fs.constants.COPYFILE_EXCL);
    prisma(['migrate', 'deploy']);
  } else if (action === 'test') suite(['scripts/phase3b2a/contracts.test.ts', 'scripts/phase3b2a/integration.test.ts']);
  else if (action === 'regression') {
    const groups = [
      ['scripts/phase0/phase0.test.ts', 'scripts/phase1/isolation.test.ts', 'scripts/phase1/integration.test.ts'],
      ['scripts/phase2/unit.test.ts', 'scripts/phase2/integration.test.ts'],
      ['scripts/phase3a/unit.test.ts', 'scripts/phase3a/actions.test.cjs', 'scripts/phase3a/corrections.test.cjs'],
      ['scripts/phase3b1/unit.test.ts', 'scripts/phase3b1/integration.test.ts', 'scripts/phase3b1/actions.test.cjs'],
    ];
    for (const [index, files] of groups.entries()) { if (index) backups.push(verifiedBackup()); suite(files); if (!passed) break; }
  } else if (action === 'browser' || action === 'browser3b1') {
    const previous = `${directory}/prior-browser-artifacts`;
    fs.mkdirSync(previous, { recursive: true });
    for (const name of fs.readdirSync('.local/snipers').filter(name => /^phase3(a|b1)-browser/.test(name))) {
      const source = `.local/snipers/${name}`;
      if (fs.statSync(source).isFile() && !fs.existsSync(`${previous}/${name}`)) fs.copyFileSync(source, `${previous}/${name}`, fs.constants.COPYFILE_EXCL);
    }
    if (action === 'browser') run('node_modules/tsx/dist/cli.mjs', ['scripts/phase3a/browser.cjs']);
    if (passed) { if (action === 'browser') backups.push(verifiedBackup()); run('node_modules/tsx/dist/cli.mjs', ['scripts/phase3b1/browser.cjs']); }
  } else if (action === 'build') {
    run('node_modules/prisma/build/index.js', ['generate']);
    if (passed) run('node_modules/next/dist/bin/next', ['build', '--webpack'], true);
  } else if (action === 'typecheck') run('node_modules/typescript/bin/tsc', ['--noEmit', '--incremental', 'false']);
  else if (action === 'lint') run('node_modules/eslint/bin/eslint.js', ['--max-warnings=0', 'scripts/phase3b2a', 'src/lib/snipers/file-contracts.ts', 'src/lib/snipers/file-receipts.ts', 'scripts/phase1/integration.test.ts', 'scripts/phase3a/browser.cjs']);
  else if (action === 'validate') prisma(['validate']);
  else prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
  fs.writeFileSync(`${directory}/${action}.log`, output); process.stdout.write(output);
  preserve();
  const after = schema();
  if (action !== 'migrate' && before !== after) throw new Error('Cambio de estructura no autorizado durante un chequeo.');
  if (action === 'migrate') {
    // Compare the original columns only: the migration must not repair historical data.
    const columns = Object.keys(JSON.parse(baseline.resources)[0] ?? {});
    if (columns.length) {
      const projection = columns.map(k => `r.${'"' + k.replace(/"/g, '""') + '"'}`).join(',');
      const rows = sql(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb)::text FROM (SELECT ${projection} FROM "SnipersResource" r) r;`);
      if (rows !== baseline.resources) throw new Error('Cambió un recurso histórico.');
    }
  }
  const connections = fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { allowed: boolean; host: string; port: number });
  if (connections.some(c => c.allowed && !['127.0.0.1', '::1', 'localhost'].includes(c.host))) throw new Error('Conexión externa detectada.');
  fs.writeFileSync(`${directory}/${action}-evidence.json`, JSON.stringify({ action, passed, head, backup, backups, persistentFlag: profile.SNIPERS_ENABLED, protectedFilesPreserved: true, schemaBefore: before, schemaAfter: after, localOnly: true, allowedDestinations: [...new Set(connections.filter(c => c.allowed).map(c => `${c.host}:${c.port}`))] }, null, 2));
  if (!passed) throw new Error(`Falló ${action}; consultar ${directory}/${action}.log`);
}
try { main(); } catch (error) { fail(error); }
