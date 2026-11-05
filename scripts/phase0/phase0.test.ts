import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createBackup, type PgRunner } from '../backup';
import { isolatedEnv, localDir, localUrl, pgEnv, readProfile, runPg } from './local';

const url = 'postgresql://local_user:synthetic_password@127.0.0.1:55432/phase0_test?schema=public&sslmode=require';
fs.mkdirSync(localDir, { recursive: true });
const temporary = () => fs.mkdtempSync(path.join(localDir, 'unit-'));
function fixture(directory: string, value = url) {
  const file = path.join(directory, 'profile.env');
  fs.writeFileSync(file, `SNIPERS_ENVIRONMENT=local\nDATABASE_URL="${value}"\n`);
  return file;
}

for (const value of [
  'postgresql://user:password@remote.example:5432/app',
  'postgresql://user:password@localhost:5432/app',
  'postgresql://user:password@127.0.0.1:55432/app?host=remote.example',
  'postgresql://user:password@127.0.0.1:55432/app?hostaddr=203.0.113.1',
  'postgresql://user:password@127.0.0.1:55432/app?service=production',
  'postgresql://user:password@127.0.0.1:55432/app?__proto__=remote',
  'https://127.0.0.1:55432/app',
  'postgresql://user@127.0.0.1:55432/app',
]) {
  test(`rechaza conexión insegura ${new URL(value).hostname} / ${new URL(value).searchParams.keys().next().value || 'url'}`, () => {
    assert.throws(() => localUrl(value));
  });
}

test('preserva TLS y separa parámetros Prisma; no usa host heredado', () => {
  const previous = process.env.PGHOST;
  process.env.PGHOST = 'remote.example';
  try {
    const env = pgEnv(url + '&sslrootcert=C%3A%2Fcerts%2Fca.pem');
    assert.equal(env.PGHOST, '127.0.0.1');
    assert.equal(env.PGSSLMODE, 'require');
    assert.equal(env.PGSSLROOTCERT, 'C:/certs/ca.pem');
    assert.equal(env.PGDATABASE, 'phase0_test');
    assert.equal(env.PGCLIENTENCODING, 'UTF8');
  } finally {
    if (previous === undefined) delete process.env.PGHOST; else process.env.PGHOST = previous;
  }
});

test('rechaza perfil ausente y DIRECT_URL remoto aunque DATABASE_URL sea local', () => {
  const dir = temporary();
  assert.throws(() => readProfile(path.join(dir, 'absent.env')));
  const file = fixture(dir);
  fs.appendFileSync(file, 'DIRECT_URL="postgresql://user:password@remote.example:5432/app"\n');
  assert.throws(() => readProfile(file), /rechazada/);
});

test('secrets de .env y procesos heredados quedan vacíos; no se reintroducen desde el perfil', () => {
  const dir = temporary();
  fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=remote\nSUPABASE_SERVICE_ROLE_KEY=synthetic-secret\nCUSTOM_REMOTE_TOKEN=synthetic-secret\nNEXTAUTH_SECRET=remote-session\n');
  const env = isolatedEnv({ DATABASE_URL: url, NEXTAUTH_SECRET: 'isolated-session', R2_ACCESS_KEY_ID: 'must-not-propagate' }, dir);
  assert.equal(env.DATABASE_URL, url);
  assert.equal(env.NEXTAUTH_SECRET, 'isolated-session');
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, '');
  assert.equal(env.CUSTOM_REMOTE_TOKEN, '');
  assert.ok(!env.R2_ACCESS_KEY_ID);
  assert.equal(env.PAYPAL_ENABLED, 'false');
  assert.equal(env.SNIPERS_ENABLED, 'false');
});

test('backup remoto es rechazado antes de ejecutar herramientas', async () => {
  const dir = temporary();
  let calls = 0;
  const runner: PgRunner = () => { calls++; return ''; };
  await assert.rejects(createBackup(fixture(dir, 'postgresql://user:password@remote.example:5432/app'), path.join(dir, 'out'), runner), /rechazada/);
  assert.equal(calls, 0);
});

test('Next no repuebla credenciales desde .env después de aislar el entorno', () => {
  const env = isolatedEnv({ DATABASE_URL: url, DIRECT_URL: url, NEXTAUTH_SECRET: 'synthetic-local-secret' });
  const child = spawnSync(process.execPath, ['-e', `
    require('@next/env').loadEnvConfig(process.cwd(), true);
    const assert = require('node:assert/strict');
    assert.equal(process.env.DATABASE_URL, ${JSON.stringify(url)});
    assert.equal(process.env.DIRECT_URL, ${JSON.stringify(url)});
    assert.equal(process.env.NEXTAUTH_SECRET, 'synthetic-local-secret');
    for (const key of ['SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_SECRET','MP_ACCESS_TOKEN','BUNNY_STREAM_API_KEY','EMAIL_SERVER_PASSWORD','R2_SECRET_ACCESS_KEY']) assert.ok(!process.env[key]);
  `], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0, 'Next reintrodujo configuración externa o falló la carga aislada.');
});

for (const failure of ['nonzero', 'missing-output', 'empty', 'invalid-format', 'invalid-toc']) {
  test(`backup no confirma éxito ante ${failure}`, async () => {
    const dir = temporary();
    const output = path.join(dir, 'out');
    const runner: PgRunner = (tool, args) => {
      if (args[0] === '--version') return 'pg_dump synthetic';
      if (tool === 'pg_dump') {
        if (failure === 'missing-output') return '';
        fs.writeFileSync(args[args.indexOf('--file') + 1], failure === 'empty' ? '' : failure === 'invalid-format' ? 'bad-format' : 'PGDMPsynthetic');
        if (failure === 'nonzero') throw new Error('synthetic pg_dump failure');
      }
      if (tool === 'pg_restore' && failure === 'invalid-toc') throw new Error('synthetic TOC failure');
      return '';
    };
    await assert.rejects(createBackup(fixture(dir), output, runner));
    assert.deepEqual(fs.readdirSync(output), []);
  });
}

test('backup genera manifiesto verificable sin password y sin afirmar restauración', async () => {
  const dir = temporary();
  const runner: PgRunner = (tool, args, env) => {
    assert.equal(env.PGHOST, '127.0.0.1');
    if (args[0] === '--version') return 'pg_dump synthetic';
    if (tool === 'pg_dump') fs.writeFileSync(args[args.indexOf('--file') + 1], 'PGDMPsynthetic');
    return 'synthetic TOC';
  };
  const result = await createBackup(fixture(dir), path.join(dir, 'out'), runner);
  const content = fs.readFileSync(result.manifest, 'utf8');
  const manifest = JSON.parse(content);
  assert.equal(manifest.sha256, createHash('sha256').update(fs.readFileSync(result.archive)).digest('hex'));
  assert.equal(manifest.contents, 'schema-and-data');
  assert.equal(manifest.restorationTested, false);
  assert.ok(!content.includes('synthetic_password'));
});

test('ejecutable ausente produce fallo sin exponer contraseña', () => {
  assert.throws(() => runPg('missing-phase0-tool', [], pgEnv(url), path.join(temporary(), 'absent-bin')), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes('synthetic_password'));
    return true;
  });
});
