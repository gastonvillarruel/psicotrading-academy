import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { after, before, mock, test } from 'node:test';
import type { PoolClient } from 'pg';
import { launchConnection, launchPgEnv, type LaunchProfile } from './database';
import { migrationConnection, migrationClientOptions, nativeMigrationUrl, beginMigrationRead,
  verifyMigrationIdentity, verifyMigrationPermissions, assertMigrationCommand } from './migration-connection';

before(() => { mock.method(net.Socket.prototype, 'connect', () => { throw new Error('No network in migration unit tests.'); }); });
after(() => { mock.restoreAll(); });
const ca = path.resolve('scripts/snipers-launch/fixtures/supabase-root-2021.crt');
function profile(): LaunchProfile {
  const url = new URL('postgresql://postgres.qvakwkvfbsqprzcdywsi:synthetic@aws-0-test.pooler.supabase.com:5432/postgres');
  url.searchParams.set('sslmode', 'verify-full'); url.searchParams.set('sslrootcert', ca); url.searchParams.set('schema', 'public');
  return { SNIPERS_ENABLED: 'false', SNIPERS_LAUNCH_ENVIRONMENT: 'production', SNIPERS_MIGRATION_TRANSPORT: 'session-pooler',
    SNIPERS_MIGRATION_INTERNAL_TLS_POLICY: 'supabase-managed', SNIPERS_MIGRATION_PROJECT_REF: 'qvakwkvfbsqprzcdywsi',
    SNIPERS_MIGRATION_SQL_ROLE: 'postgres', SNIPERS_LAUNCH_DATABASE_URL: url.toString(), SNIPERS_EXPECT_HOST: url.hostname,
    SNIPERS_EXPECT_PORT: '5432', SNIPERS_EXPECT_DATABASE: 'postgres', SNIPERS_EXPECT_USER: 'postgres.qvakwkvfbsqprzcdywsi' };
}
function urlChange(change: (url: URL) => void) { const p = profile(), url = new URL(p.SNIPERS_LAUNCH_DATABASE_URL); change(url); return { ...p, SNIPERS_LAUNCH_DATABASE_URL: url.toString() }; }
function client(query: (sql: string) => unknown[], authorized = true): PoolClient {
  return { query: async (sql: string) => ({ rows: query(sql) }), connection: { stream: { encrypted: true, authorized } } } as unknown as PoolClient;
}

test('migration opt-in never changes direct launch guards or accepts backup authorization', () => {
  const p = profile(); assert.equal(migrationConnection(p).transport, 'session-pooler');
  assert.throws(() => launchConnection(p), /conexión directa/); assert.throws(() => launchPgEnv(p), /conexión directa/);
  for (const key of ['SNIPERS_BACKUP_TRANSPORT', 'SNIPERS_BACKUP_INTERNAL_TLS_POLICY']) assert.throws(() => migrationConnection({ ...p, [key]: 'supabase-managed' }));
  const direct = { ...p, SNIPERS_MIGRATION_TRANSPORT: 'direct', SNIPERS_LAUNCH_ENVIRONMENT: 'local',
    SNIPERS_LAUNCH_DATABASE_URL: 'postgresql://snipers_local:synthetic@127.0.0.1:55432/snipers_dev',
    SNIPERS_EXPECT_HOST: '127.0.0.1', SNIPERS_EXPECT_PORT: '55432', SNIPERS_EXPECT_DATABASE: 'snipers_dev', SNIPERS_EXPECT_USER: 'snipers_local' };
  assert.equal(nativeMigrationUrl(direct), direct.SNIPERS_LAUNCH_DATABASE_URL);
});

test('only the approved production project, role, database, session port and explicit policy are accepted', () => {
  const invalid = [
    { ...profile(), SNIPERS_MIGRATION_INTERNAL_TLS_POLICY: 'pending' }, { ...profile(), SNIPERS_MIGRATION_INTERNAL_TLS_POLICY: '' },
    { ...profile(), SNIPERS_MIGRATION_PROJECT_REF: 'abcdefghijklmnopqrst' }, { ...profile(), SNIPERS_MIGRATION_SQL_ROLE: 'other' },
    { ...profile(), SNIPERS_LAUNCH_ENVIRONMENT: 'staging' }, { ...profile(), SNIPERS_ENABLED: 'true' },
    { ...profile(), SNIPERS_MIGRATION_TRANSPORT: 'unknown' }, { ...profile(), SNIPERS_EXPECT_HOST: 'other.pooler.supabase.com' },
    urlChange(u => { u.port = '6543'; }), urlChange(u => { u.pathname = '/other'; }), urlChange(u => { u.username = 'other.qvakwkvfbsqprzcdywsi'; }),
    urlChange(u => { u.hostname = 'untrusted.example'; }), urlChange(u => { u.searchParams.set('sslmode', 'require'); }),
    urlChange(u => { u.searchParams.delete('sslrootcert'); }), urlChange(u => { u.searchParams.append('sslmode', 'verify-full'); }),
    urlChange(u => { u.searchParams.set('sslaccept', 'accept_invalid_certs'); }), urlChange(u => { u.searchParams.set('options', 'unsafe'); }),
    urlChange(u => { u.searchParams.set('pgbouncer', 'true'); }),
  ];
  for (const p of invalid) assert.throws(() => migrationConnection(p));
});

test('Node TLS and native Prisma TLS use their own strict parameters without changing identity', () => {
  const p = profile(), before = structuredClone(p), options = migrationClientOptions(p), ssl = options.ssl as tls.ConnectionOptions;
  assert.equal(options.connectionString, undefined); assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.checkServerIdentity, tls.checkServerIdentity); assert.equal(ssl.servername, p.SNIPERS_EXPECT_HOST);
  const canonical = new URL(p.SNIPERS_LAUNCH_DATABASE_URL), native = new URL(nativeMigrationUrl(p));
  for (const key of ['hostname', 'port', 'pathname', 'username', 'password'] as const) assert.equal(native[key], canonical[key]);
  assert.equal(native.searchParams.get('sslmode'), 'require'); assert.equal(native.searchParams.get('sslaccept'), 'strict');
  assert.equal(native.searchParams.get('sslcert'), ca); assert.equal(native.searchParams.has('sslrootcert'), false);
  assert.equal(native.searchParams.get('schema'), 'public'); assert.equal(native.searchParams.has('pgbouncer'), false);
  assert.deepEqual(p, before);
});

test('both connection consumers reject a wrong CA, extra roots or an expired trust anchor', t => {
  const original = fs.readFileSync, correct = original(ca, 'utf8');
  for (const replacement of [tls.rootCertificates[0], correct + correct]) {
    const read = t.mock.method(fs, 'readFileSync', new Proxy(original, { apply(target, thisArg, args) { return args[0] === ca ? replacement : Reflect.apply(target, thisArg, args); } }));
    try { assert.throws(() => migrationClientOptions(profile())); assert.throws(() => nativeMigrationUrl(profile())); }
    finally { read.mock.restore(); }
  }
  t.mock.method(Date, 'now', () => Date.UTC(2032, 0, 1));
  assert.throws(() => nativeMigrationUrl(profile()));
});

test('session migration config cannot authorize reset, dev, db push or arbitrary history repair', () => {
  const p = profile();
  assert.doesNotThrow(() => assertMigrationCommand(p, ['node', 'prisma', 'migrate', 'deploy', '--config', 'scripts/snipers-launch/prisma.config.ts']));
  assert.doesNotThrow(() => assertMigrationCommand(p, ['migrate', 'resolve', '--applied', '20261019_add_course_lead_capture_fields']));
  for (const args of [['db', 'push'], ['migrate', 'reset'], ['migrate', 'dev'], ['migrate', 'resolve', '--applied', 'other'],
    ['migrate', 'resolve', '--rolled-back', '20261019_add_course_lead_capture_fields'], ['migrate', 'deploy', '--schema=other.prisma']]) assert.throws(() => assertMigrationCommand(p, args));
});

test('preflight begins a real READ ONLY transaction with existing limits', async () => {
  const calls: string[] = []; await beginMigrationRead(client(sql => { calls.push(sql); return []; }));
  assert.equal(calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(calls.includes("SET LOCAL statement_timeout = '10s'")); assert.ok(calls.includes("SET LOCAL lock_timeout = '5s'"));
});

test('live TLS, server identity and READ ONLY are mandatory even with the managed-upstream policy', async () => {
  const query = (sql: string) => sql.includes('transaction_read_only') ? [{ read_only: 'on' }] : [{ database: 'postgres', user: 'postgres', upstream_tls: false }];
  const result = await verifyMigrationIdentity(client(query), profile());
  assert.equal(result.tls, true); assert.equal('upstreamTls' in result && result.upstreamTls, false);
  await assert.rejects(verifyMigrationIdentity(client(() => { throw new Error('SQL must not execute'); }, false), profile()), /TLS cliente/);
  await assert.rejects(verifyMigrationIdentity(client(() => [{ read_only: 'off' }]), profile()), /READ ONLY/);
  for (const change of [{ database: 'other' }, { user: 'other' }, { upstream_tls: null }]) {
    await assert.rejects(verifyMigrationIdentity(client(sql => sql.includes('transaction_read_only') ? [{ read_only: 'on' }] : [{ database: 'postgres', user: 'postgres', upstream_tls: false, ...change }]), profile()), /Identidad SQL/);
  }
});

test('missing DDL, FK, history, language, advisory lock or extension privileges remain blocking', async () => {
  const allowed = { schema_allowed: true, reference_allowed: true, history_allowed: true, language_allowed: true, locks_allowed: true, extension_allowed: true };
  await verifyMigrationPermissions(client(() => [allowed]));
  for (const key of Object.keys(allowed)) await assert.rejects(verifyMigrationPermissions(client(() => [{ ...allowed, [key]: false }])), /Permisos/);
});
