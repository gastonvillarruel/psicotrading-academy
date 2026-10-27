import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertLocalContext, validateProfile, localSqlGuard } from './guard';
import { defaultBin } from '../phase0/local';
import { validateExistingPlans } from './catalog';

const profile = { SNIPERS_ENVIRONMENT: 'local', PG_BIN: defaultBin,
  DATABASE_URL: 'postgresql://snipers_local:synthetic@127.0.0.1:55432/snipers_dev?schema=public&sslmode=disable' };

test('perfil exacto: rechazo de base, puerto, rol, destino secundario y parámetros alternativos', () => {
  validateProfile(profile);
  for (const url of [profile.DATABASE_URL.replace('snipers_dev', 'postgres'), profile.DATABASE_URL.replace('55432', '5432'),
    profile.DATABASE_URL.replace('snipers_local', 'postgres'), profile.DATABASE_URL.replace('127.0.0.1', 'remote.example'),
    profile.DATABASE_URL + '&options=-csearch_path%3Dother', profile.DATABASE_URL.replace('schema=public', 'schema=other')]) {
    assert.throws(() => validateProfile({ ...profile, DATABASE_URL: url }));
    assert.throws(() => validateProfile({ ...profile, DIRECT_URL: url }));
    assert.throws(() => validateProfile({ ...profile, BACKUP_DATABASE_URL: url }));
  }
  assert.throws(() => validateProfile({ ...profile, PG_BIN: 'other' }));
});

test('producción/CI rechazados antes de aislar variables', () => {
  const environments: Partial<NodeJS.ProcessEnv>[] = [{ NODE_ENV: 'production' }, { CI: 'true' }, { VERCEL: '1' }, { GITHUB_ACTIONS: 'true' }];
  for (const env of environments) assert.throws(() => assertLocalContext(env));
});

test('config experimental exige lanzador; no se puede seleccionar desde CI', () => {
  for (const overrides of [{ SNIPERS_PHASE1_LOCAL: '' }, { CI: 'true' }]) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', "require('./scripts/phase1/snipers.local.config.ts')"],
      { env: { ...process.env, ...overrides }, encoding: 'utf8', windowsHide: true });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /lanzador local|producción\/CI/);
  }
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/phase1/cli.ts', 'migrate', '--config', 'prisma.config.ts'],
    { env: process.env, encoding: 'utf8', windowsHide: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Uso:/);
});

test('flujos normales y configuración heredada sin selección experimental', () => {
  const original = JSON.parse(spawnSync('git', ['show', '599510d:package.json'], { encoding: 'utf8', windowsHide: true }).stdout);
  const current = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const [name, command] of Object.entries(original.scripts)) assert.equal(current.scripts[name], command);
  const config = fs.readFileSync('prisma.config.ts', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(config, spawnSync('git', ['show', '599510d:prisma.config.ts'], { encoding: 'utf8', windowsHide: true }).stdout.replace(/\r\n/g, '\n'));
  const changed = spawnSync('git', ['diff', '--name-only', '599510d', '--', 'prisma/migrations'], { encoding: 'utf8', windowsHide: true });
  assert.equal(changed.stdout.trim(), '');
  assert.match(localSqlGuard, /snipers_dev/);
  assert.match(fs.readFileSync('scripts/phase1/local-artifacts/init-local.sql', 'utf8'), /LOCAL DEVELOPMENT ONLY/);
});

test('SQL aditivo solamente modifica tablas nuevas; copia local idéntica', () => {
  const sql = fs.readFileSync('prisma/snipers-review/phase1.sql', 'utf8');
  const created = new Set([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]));
  assert.equal(created.size, 10);
  for (const m of sql.matchAll(/ALTER TABLE "([^"]+)"/g)) assert.ok(created.has(m[1]));
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|DROP TYPE|TRUNCATE TABLE|ALTER TYPE|DELETE FROM|UPDATE "User"|INSERT INTO "User")\b/);
  assert.equal(sql, fs.readFileSync('.local/snipers/phase1-migrations/001_snipers_phase1/migration.sql', 'utf8'));
});

test('catálogo detecta conflictos sin confundir cambios comerciales válidos', () => {
  const row = { code: 'SNIPERS_LEVEL_1', name: 'Nombre personalizado', priceCents: 4700, durationDays: 40, version: 2 };
  validateExistingPlans([row]);
  for (const rows of [[row, row], [{ ...row, code: ' snipers_level_1 ' }], [{ ...row, priceCents: 0 }], [{ ...row, durationDays: 1.5 }]]) {
    assert.throws(() => validateExistingPlans(rows), /Conflicto/);
  }
});
