import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fail, npmBackup, profilePath, root } from '../phase0/local';
import { localProfile, localSqlGuard, queryLocal, runnerEnv, verifyDatabase } from './guard';
import { existingStructure } from './evidence';

const config = 'scripts/phase1/snipers.local.config.ts';
const artifacts = 'scripts/phase1/local-artifacts';
const candidate = 'prisma/snipers-review/phase1.sql';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function main() {
  if (process.argv.length !== 3) throw new Error('Uso: tsx scripts/phase1/cli.ts check|prepare|validate|generate|migrate|status|catalog|bootstrap|test|typecheck|lint');
  const action = process.argv[2];
  const allowed = ['check', 'prepare', 'validate', 'generate', 'migrate', 'status', 'catalog', 'bootstrap', 'test', 'typecheck', 'lint'];
  if (!allowed.includes(action)) throw new Error('Acción no admitida.');
  const profile = localProfile();
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
  if (branch.status !== 0 || branch.stdout.trim() !== 'feature/snipers-campus') throw new Error('Rama incorrecta.');
  verifyDatabase(profile);
  const env = runnerEnv(profile);
  function run(file: string, args: string[], capture = false): string {
    const r = spawnSync(process.execPath, [file, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true,
      stdio: capture ? 'pipe' : 'inherit', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    if (r.error || r.status !== 0) throw new Error(`Falló ${path.basename(file)} (salida ${r.status ?? 'no disponible'}).`);
    return r.stdout || '';
  }
  const prisma = (args: string[], capture = false) => run('node_modules/prisma/build/index.js', [...args, '--config', config], capture);
  if (action === 'check') { console.log('Destino local y rama verificados; no se escribió la base.'); return; }
  if (action === 'validate' || action === 'generate') { prisma([action]); return; }
  if (action === 'status') { prisma(['migrate', 'status']); return; }
  if (action === 'typecheck') { run('node_modules/typescript/bin/tsc', ['--noEmit', '--incremental', 'false']); return; }
  if (action === 'lint') { run('node_modules/eslint/bin/eslint.js', ['scripts/phase1', 'src/lib/snipers']); return; }
  if (action === 'prepare') {
    const frozen = spawnSync('git', ['show', '599510d:prisma/schema.prisma'], { encoding: 'utf8', windowsHide: true });
    if (frozen.status !== 0 || frozen.stdout.replace(/\r\n/g, '\n') !== fs.readFileSync(`${artifacts}/pre-snipers.prisma`, 'utf8').replace(/\r\n/g, '\n')) {
      throw new Error('El esquema congelado no coincide con 599510d.');
    }
    npmBackup(profilePath);
    const base = prisma(['migrate', 'diff', '--from-empty', '--to-schema', `${artifacts}/pre-snipers.prisma`, '--script'], true);
    const delta = prisma(['migrate', 'diff', '--from-schema', `${artifacts}/pre-snipers.prisma`, '--to-schema', 'prisma/schema.prisma', '--script'], true);
    // Every existing object must remain unchanged. ALTER is permitted only on newly created tables.
    const tables = new Set([...delta.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]));
    if (/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(delta.replace(/ON (DELETE|UPDATE) RESTRICT/g, ''))) throw new Error('SQL no estrictamente aditivo.');
    for (const m of delta.matchAll(/ALTER TABLE "([^"]+)"/g)) if (!tables.has(m[1])) throw new Error('ALTER sobre estructura preexistente.');
    if ([...tables].some(t => !t.startsWith('Snipers') && t !== 'UserPermission') || tables.size !== 10) throw new Error('Conjunto inesperado de tablas.');
    const constraints = fs.readFileSync(`${artifacts}/constraints.sql`, 'utf8');
    fs.mkdirSync('prisma/snipers-review', { recursive: true });
    fs.writeFileSync(`${artifacts}/init-local.sql`, '-- LOCAL DEVELOPMENT ONLY. NEVER DEPLOY. Source schema: 599510d.\nBEGIN;\n' + localSqlGuard + base + '\nCOMMIT;\n');
    fs.writeFileSync(candidate, '-- REVIEW CANDIDATE ONLY. Production compatibility unverified.\nBEGIN;\n' + delta + '\n' + constraints + '\nCOMMIT;\n');
    console.log('Artefactos preparados; ninguna migración ejecutada.');
    return;
  }
  if (action === 'migrate') {
    npmBackup(profilePath);
    const chain = '.local/snipers/phase1-migrations';
    fs.mkdirSync(chain, { recursive: true });
    const baselineFile = '.local/snipers/phase1-baseline.json';
    const beforeCount = queryLocal(profile, "SELECT count(*) FROM pg_tables WHERE schemaname='public';");
    if (beforeCount === '0' && (fs.existsSync(baselineFile) || fs.existsSync(`${chain}/001_snipers_phase1/migration.sql`))) {
      throw new Error('Base vacía con evidencia/cadena previa: no se reinicializa automáticamente.');
    }
    if (beforeCount !== '0' && queryLocal(profile, "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;") !== 't') throw new Error('Base no vacía sin historial local reconocido.');
    if (beforeCount !== '0') {
      const names = queryLocal(profile, 'SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name;').split(/\r?\n/);
      if (names.some(n => !['000_local_development_only', '001_snipers_phase1'].includes(n))) throw new Error('Historial inesperado.');
    }
    for (const [name, source] of [['000_local_development_only', `${artifacts}/init-local.sql`], ['001_snipers_phase1', candidate]]) {
      const dest = `${chain}/${name}/migration.sql`;
      const content = fs.readFileSync(source);
      if (fs.existsSync(dest) && hash(fs.readFileSync(dest)) !== hash(content)) throw new Error('Cadena local existente distinta: no se sobrescribe.');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, content, { flag: 'wx' });
      fs.writeFileSync(`${chain}/migration_lock.toml`, 'provider = "postgresql"\n');
      prisma(['migrate', 'deploy']);
      if (name === '000_local_development_only' && !fs.existsSync(baselineFile)) {
        if (queryLocal(profile, `SELECT to_regclass('public."SnipersPlan"') IS NOT NULL;`) === 't') throw new Error('Falta evidencia previa al delta: detenerse.');
        fs.writeFileSync(baselineFile, JSON.stringify({ sourceCommit: '599510d', ...existingStructure(profile) }, null, 2), { flag: 'wx' });
      }
    }
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const after = existingStructure(profile);
    if (after.structure !== baseline.structure) throw new Error('Cambió una estructura preexistente: detenerse.');
    prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
    fs.writeFileSync('.local/snipers/phase1-migration-evidence.json', JSON.stringify({ sourceCommit: '599510d',
      beforeSha256: baseline.sha256, afterSha256: after.sha256, tables: after.tables, identical: true,
      additiveSha256: hash(fs.readFileSync(candidate)), localCopySha256: hash(fs.readFileSync(`${chain}/001_snipers_phase1/migration.sql`)) }, null, 2));
    console.log('Cadena exclusivamente local aplicada; SQL canónico verificado por hash.');
    return;
  }
  npmBackup(profilePath);
  if (action === 'test') {
    run('node_modules/tsx/dist/cli.mjs', ['--test', '--test-concurrency=1', 'scripts/phase0/phase0.test.ts', 'scripts/phase1/isolation.test.ts', 'scripts/phase1/integration.test.ts']);
  } else {
    run('node_modules/tsx/dist/cli.mjs', ['scripts/phase1/initialize.ts', action]);
  }
}

try { main(); } catch (error) { fail(error); }
