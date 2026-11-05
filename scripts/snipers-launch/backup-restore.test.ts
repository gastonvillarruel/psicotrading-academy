import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { after, before, mock, test } from 'node:test';
import type { PoolClient } from 'pg';
import { createAuthorizedBackup } from '../backup';
import { launchConnection, launchPgEnv, privateDirectory, type LaunchProfile } from './database';
import { assertBackupPolicy, backupClientOptions, backupConnection, backupPgEnv, beginBackupRead, readBackupProfile, verifyBackupIdentity } from './backup-connection';
import { extensionPlan, restoreObjectsSql, verifyExtensionToc, verifyRestoreExtensions,
  type ExtensionEntry, type ExtensionMetadata, type ExtensionReview } from './extension-dependencies';

// No PostgreSQL, pg_dump or pg_restore is run by this suite. Socket attempts fail immediately.
before(() => { mock.method(net.Socket.prototype, 'connect', () => { throw new Error('Network forbidden in offline backup tests.'); }); });
after(() => { mock.restoreAll(); });
const caFile = path.resolve('scripts/snipers-launch/fixtures/supabase-root-2021.crt'); // Public trust anchor, not a credential.
function profile(): LaunchProfile {
  const url = new URL('postgresql://reader.abcdefghijklmnopqrst:synthetic_password@aws-0-test.pooler.supabase.com:5432/app');
  url.searchParams.set('sslmode', 'verify-full'); url.searchParams.set('sslrootcert', caFile);
  return { SNIPERS_ENABLED: 'false', SNIPERS_LAUNCH_ENVIRONMENT: 'production', SNIPERS_BACKUP_TRANSPORT: 'session-pooler',
    SNIPERS_LAUNCH_DATABASE_URL: url.toString(), SNIPERS_EXPECT_HOST: url.hostname, SNIPERS_EXPECT_PORT: '5432',
    SNIPERS_EXPECT_DATABASE: 'app', SNIPERS_EXPECT_USER: 'reader.abcdefghijklmnopqrst',
    SNIPERS_BACKUP_EXPECT_ROLE: 'reader', SNIPERS_BACKUP_EXPECT_PROJECT_REF: 'abcdefghijklmnopqrst', SNIPERS_BACKUP_INTERNAL_TLS_POLICY: 'require' };
}
function changedUrl(change: (url: URL) => void) {
  const p = profile(), url = new URL(p.SNIPERS_LAUNCH_DATABASE_URL); change(url); p.SNIPERS_LAUNCH_DATABASE_URL = url.toString(); return p;
}
function client(query: (sql: string) => unknown[], authorized = true): PoolClient {
  return { connection: { stream: { encrypted: true, authorized } }, query: async (sql: string) => ({ rows: query(sql) }) } as unknown as PoolClient;
}
const identity = { database: 'app', user: 'reader', read_only: 'on', upstream_tls: true };

test('backup Session Pooler validates a separate identity and never opens launch guards', () => {
  assert.equal(backupConnection(profile()).transport, 'session-pooler');
  assert.throws(() => launchConnection(profile()), /conexión directa/);
  assert.throws(() => launchPgEnv(profile()), /conexión directa/);
  const direct = { ...profile(), SNIPERS_BACKUP_TRANSPORT: 'direct', SNIPERS_LAUNCH_ENVIRONMENT: 'local',
    SNIPERS_LAUNCH_DATABASE_URL: 'postgresql://reader:synthetic@127.0.0.1:55432/app',
    SNIPERS_EXPECT_HOST: '127.0.0.1', SNIPERS_EXPECT_PORT: '55432', SNIPERS_EXPECT_USER: 'reader' };
  assert.equal(backupConnection(direct).transport, 'direct');
  assert.equal(backupClientOptions(direct).connectionString, direct.SNIPERS_LAUNCH_DATABASE_URL);
  assert.deepEqual(backupPgEnv(direct), launchPgEnv(direct));
});

test('backup rejects transaction pooling, crossed identity, unsafe SSL parameters and unknown transports', () => {
  const invalid = [
    changedUrl(u => { u.port = '6543'; }), changedUrl(u => { u.hostname = 'attacker.example'; }),
    changedUrl(u => { u.username = 'reader.otherproject'; }), changedUrl(u => { u.pathname = '/another'; }),
    changedUrl(u => { u.searchParams.set('sslmode', 'require'); }), changedUrl(u => { u.searchParams.delete('sslrootcert'); }),
    changedUrl(u => { u.searchParams.append('sslmode', 'verify-full'); }), changedUrl(u => { u.searchParams.set('options', 'unsafe'); }),
    { ...profile(), SNIPERS_BACKUP_EXPECT_ROLE: 'other' }, { ...profile(), SNIPERS_BACKUP_EXPECT_PROJECT_REF: '' },
    { ...profile(), SNIPERS_EXPECT_HOST: 'other.pooler.supabase.com' }, { ...profile(), SNIPERS_EXPECT_PORT: '6543' },
    { ...profile(), SNIPERS_ENABLED: 'true' }, { ...profile(), SNIPERS_LAUNCH_ENVIRONMENT: 'local' },
    { ...profile(), SNIPERS_BACKUP_TRANSPORT: 'unknown' },
  ];
  for (const p of invalid) assert.throws(() => backupConnection(p));
});

test('pending or permissive internal TLS policy blocks before creating any database connection or archive', async () => {
  const directory = path.resolve('.local/snipers/backup-prep-tests', `policy-${Date.now()}`);
  privateDirectory(directory);
  for (const policy of ['pending', '', 'allow', 'accept-provider-network']) {
    const p = { ...profile(), SNIPERS_BACKUP_INTERNAL_TLS_POLICY: policy };
    assert.throws(() => assertBackupPolicy(p), /TLS interno pendiente/);
    assert.throws(() => backupClientOptions(p), /TLS interno pendiente/);
    assert.throws(() => backupPgEnv(p), /TLS interno pendiente/);
    const file = path.join(directory, `synthetic-${policy || 'empty'}.profile`);
    fs.writeFileSync(file, Object.entries(p).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'), { flag: 'wx', mode: 0o600 });
    assert.equal(readBackupProfile(file).SNIPERS_BACKUP_INTERNAL_TLS_POLICY, policy);
    await assert.rejects(createAuthorizedBackup(file, true, path.join(directory, 'must-not-exist')), /TLS interno pendiente/);
  }
  assert.equal(fs.existsSync(path.join(directory, 'must-not-exist')), false);
});

test('explicit public CA and hostname verification reach both Node and libpq without URL overrides', () => {
  const p = profile(), options = backupClientOptions(p);
  assert.equal(options.connectionString, undefined);
  const ssl = options.ssl as tls.ConnectionOptions;
  assert.equal(ssl.rejectUnauthorized, true); assert.equal(ssl.servername, p.SNIPERS_EXPECT_HOST);
  assert.equal(ssl.checkServerIdentity, tls.checkServerIdentity); assert.equal(ssl.minVersion, 'TLSv1.2');
  assert.ok(tls.checkServerIdentity(p.SNIPERS_EXPECT_HOST, { subject: { CN: 'wrong.example' } } as tls.PeerCertificate));
  const env = backupPgEnv(p);
  assert.equal(env.PGSSLMODE, 'verify-full'); assert.equal(env.PGSSLROOTCERT, caFile);
  assert.equal(env.PGUSER, p.SNIPERS_EXPECT_USER); assert.equal(env.PGPORT, '5432');
  assert.equal(env.PGSERVICE, undefined); assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.PGOPTIONS, undefined);
});

test('CA validation rejects another trust anchor, bundled extra roots, relative paths and expiry', t => {
  const originalRead = fs.readFileSync, ca = originalRead(caFile, 'utf8');
  for (const replacement of [tls.rootCertificates[0], ca + ca]) {
    const read = t.mock.method(fs, 'readFileSync', new Proxy(originalRead, { apply(target, thisArg, args) {
      return args[0] === caFile ? replacement : Reflect.apply(target, thisArg, args);
    } }));
    try { assert.throws(() => backupClientOptions(profile()), /CA Supabase distinta/); }
    finally { read.mock.restore(); }
  }
  assert.throws(() => backupClientOptions(changedUrl(u => { u.searchParams.set('sslrootcert', 'relative.crt'); })), /ruta absoluta/);
  t.mock.method(Date, 'now', () => Date.UTC(2032, 0, 1));
  assert.throws(() => backupClientOptions(profile()), /fuera de vigencia/);
});

test('READ ONLY is established explicitly and verified independently of startup options', async () => {
  const calls: string[] = [];
  await beginBackupRead(client(sql => { calls.push(sql); return [{ read_only: 'on' }]; }));
  assert.deepEqual(calls, ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    "SET LOCAL statement_timeout = '15s'", "SET LOCAL lock_timeout = '5s'", "SELECT current_setting('transaction_read_only') AS read_only"]);
  await assert.rejects(beginBackupRead(client(() => [{ read_only: 'off' }])), /READ ONLY/);
});

test('identity verifies current SQL role, database, live client TLS, readonly and upstream TLS separately', async () => {
  const result = await verifyBackupIdentity(client(() => [identity]), profile());
  assert.equal(result.user, 'reader'); assert.equal(result.tls, true);
  assert.ok(!JSON.stringify(result).includes('synthetic_password'));
  for (const change of [{ database: 'wrong' }, { user: profile().SNIPERS_EXPECT_USER }, { read_only: 'off' }, { upstream_tls: false }]) {
    await assert.rejects(verifyBackupIdentity(client(() => [{ ...identity, ...change }]), profile()));
  }
  await assert.rejects(verifyBackupIdentity(client(() => { throw new Error('SQL must not be reached'); }, false), profile()), /TLS cliente/);
});

test('explicit Supabase-managed upstream exception is restricted to verified backup sessions', async () => {
  const p = { ...profile(), SNIPERS_BACKUP_INTERNAL_TLS_POLICY: 'supabase-managed' };
  assert.doesNotThrow(() => backupClientOptions(p));
  assert.equal(backupPgEnv(p).PGSSLMODE, 'verify-full');
  const result = await verifyBackupIdentity(client(() => [{ ...identity, upstream_tls: false }]), p);
  assert.equal(result.tls, true); assert.equal('upstreamTls' in result && result.upstreamTls, false);
  assert.equal('internalTlsPolicy' in result && result.internalTlsPolicy, 'supabase-managed');
  await assert.rejects(verifyBackupIdentity(client(() => [{ ...identity, upstream_tls: null }]), p));
  await assert.rejects(verifyBackupIdentity(client(() => [identity], false), p), /TLS cliente/);
  await assert.rejects(verifyBackupIdentity(client(() => [{ ...identity, user: 'wrong' }]), p));
  assert.throws(() => backupClientOptions({ ...changedUrl(u => { u.searchParams.set('sslmode', 'require'); }), SNIPERS_BACKUP_INTERNAL_TLS_POLICY: 'supabase-managed' }));
  assert.throws(() => launchConnection(p), /conexión directa/);
  assert.throws(() => launchPgEnv(p), /conexión directa/);
});

const source: ExtensionEntry[] = [
  { name: 'pgcrypto', schema: 'extensions', version: '1.3', catalogRequired: true },
  { name: 'uuid-ossp', schema: 'extensions', version: '1.1', catalogRequired: false },
  { name: 'pg_stat_statements', schema: 'extensions', version: '1.11', catalogRequired: false },
  { name: 'supabase_vault', schema: 'vault', version: '0.3.1', catalogRequired: false },
];
function metadata(): ExtensionMetadata { return { sha256: 'a'.repeat(64), extensions: source.map(e => e.name), extensionInventory: structuredClone(source) }; }
function review(): ExtensionReview { return { archiveSha256: 'a'.repeat(64), publicSqlReviewed: true,
  extensions: source.map(e => ({ name: e.name, schema: e.schema, version: e.version,
    disposition: e.name === 'pgcrypto' || e.name === 'uuid-ossp' ? 'required' : 'inventory-only' })) }; }

test('extension planning retains inventory and distinguishes catalog and reviewed SQL dependencies', () => {
  const m = metadata(), before = structuredClone(m), plan = extensionPlan(m, review());
  assert.deepEqual(m, before);
  assert.deepEqual(plan.filter(e => e.required).map(e => e.name), ['pgcrypto', 'uuid-ossp']);
  assert.deepEqual(plan.filter(e => !e.required).map(e => e.name), ['pg_stat_statements', 'supabase_vault']);
});

test('missing, unbound or incomplete extension reviews never bypass dependencies', () => {
  assert.throws(() => extensionPlan(metadata()), /Revisión/);
  for (const r of [{ ...review(), archiveSha256: 'b'.repeat(64) }, { ...review(), publicSqlReviewed: false },
    { ...review(), extensions: review().extensions.slice(1) },
    { ...review(), extensions: [...review().extensions.slice(0, -1), review().extensions[0]] }]) assert.throws(() => extensionPlan(metadata(), r));
  for (const change of [{ disposition: 'inventory-only' as const }, { version: 'other' }, { schema: 'public' }]) {
    const r = review(); Object.assign(r.extensions[0], change); assert.throws(() => extensionPlan(metadata(), r), /Dependencia real/);
  }
  const m = metadata(); m.extensionInventory![3].catalogRequired = true;
  assert.throws(() => extensionPlan(m, review()), /Dependencia real/);
});

test('unknown extensions and inconsistent inventories are rejected; legacy btree_gist remains strict', () => {
  assert.throws(() => extensionPlan({ sha256: '', extensions: ['unknown'] }));
  assert.throws(() => extensionPlan({ ...metadata(), extensions: [...metadata().extensions, 'pgcrypto'] }));
  assert.throws(() => extensionPlan({ ...metadata(), extensionInventory: source.slice(1) }, review()));
  assert.throws(() => extensionPlan({ sha256: '', extensions: ['pgcrypto'] }), /histórico/);
  assert.deepEqual(extensionPlan({ sha256: '', extensions: ['btree_gist'] }), [{ name: 'btree_gist', required: true }]);
  assert.deepEqual(extensionPlan({ sha256: '', extensions: [], extensionInventory: [] }), []);
});

function destination(change: { installed?: Array<{ name: string; schema: string; version: string }>;
  objects?: Array<{ extension: string | null; kind?: string; schema?: string; name?: string; row_security?: boolean }>;
  libraries?: string; populated?: boolean } = {}) {
  return client(sql => {
    if (sql.includes('FROM pg_extension e JOIN')) return change.installed ?? [
      { name: 'plpgsql', schema: 'pg_catalog', version: '1.0' }, ...source.filter(e => ['pgcrypto', 'uuid-ossp'].includes(e.name))];
    if (sql === restoreObjectsSql) return change.objects ?? [{ extension: 'pgcrypto' }, { extension: 'uuid-ossp' }];
    if (sql.includes('shared_preload_libraries')) return [{ libraries: change.libraries ?? '' }];
    if (sql.startsWith('SELECT EXISTS (SELECT 1 FROM ')) return [{ populated: change.populated ?? false }];
    throw new Error('Unexpected SQL in fake destination.');
  });
}

test('isolated destination accepts only proven extension members with approved schemas and versions', async () => {
  const plan = extensionPlan(metadata(), review());
  await verifyRestoreExtensions(destination(), plan);
  await assert.rejects(verifyRestoreExtensions(destination({ objects: [{ extension: null }] }), plan), /no vacío/);
  await assert.rejects(verifyRestoreExtensions(destination({ objects: [{ extension: 'supabase_vault' }] }), plan), /no vacío/);
  await assert.rejects(verifyRestoreExtensions(destination({ installed: [] }), plan), /Falta extensión/);
  for (const change of [{ schema: 'wrong' }, { version: 'wrong' }]) {
    const installed = source.filter(e => ['pgcrypto', 'uuid-ossp'].includes(e.name)).map(e => ({ ...e })); Object.assign(installed[0], change);
    await assert.rejects(verifyRestoreExtensions(destination({ installed }), plan), /esquema\/versión/);
  }
  await assert.rejects(verifyRestoreExtensions(destination({ installed: [...source] }), plan), /no aprobada/);
});

test('pg_stat_statements preload and real Vault requirements cannot be silently skipped', async () => {
  const r = review(); r.extensions[2].disposition = 'required';
  const plan = extensionPlan(metadata(), r), installed = source.filter(e => e.name !== 'supabase_vault');
  await assert.rejects(verifyRestoreExtensions(destination({ installed }), plan), /preload/);
  await verifyRestoreExtensions(destination({ installed, libraries: 'other, pg_stat_statements' }), plan);
  r.extensions[3].disposition = 'required';
  await assert.rejects(verifyRestoreExtensions(destination({ installed }), extensionPlan(metadata(), r)), /Falta extensión/);
});

test('approved extension tables must be empty, local and observable without RLS', async () => {
  const plan = extensionPlan(metadata(), review());
  const table = { extension: 'pgcrypto', schema: 'extensions', name: 'synthetic_table', kind: 'r', row_security: false };
  await verifyRestoreExtensions(destination({ objects: [table] }), plan);
  await assert.rejects(verifyRestoreExtensions(destination({ objects: [table], populated: true }), plan), /contiene datos/);
  await assert.rejects(verifyRestoreExtensions(destination({ objects: [{ ...table, kind: 'f' }] }), plan), /objetos externos/);
  await assert.rejects(verifyRestoreExtensions(destination({ objects: [{ ...table, row_security: true }] }), plan), /RLS/);
});

test('TOC is never filtered to hide source-only or unknown extensions', () => {
  const plan = extensionPlan(metadata(), review());
  const good = '1; 0 0 EXTENSION - pgcrypto\n2; 0 0 COMMENT - EXTENSION uuid-ossp';
  assert.doesNotThrow(() => verifyExtensionToc(good, plan));
  for (const line of ['3; 0 0 EXTENSION - supabase_vault', '4; 0 0 COMMENT - EXTENSION pg_stat_statements', '5; 0 0 EXTENSION - unknown']) {
    assert.throws(() => verifyExtensionToc(good + '\n' + line, plan), /TOC/);
  }
});
