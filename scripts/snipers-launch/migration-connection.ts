// Migration-specific opt-in. Backup exceptions never authorize this transport.
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { parseEnv } from 'node:util';
import { checkServerIdentity, type TLSSocket } from 'node:tls';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { assertPrivateAccess, launchConnection, readLaunchProfile, verifyIdentity, type LaunchProfile } from './database';

const project = 'qvakwkvfbsqprzcdywsi';
const role = 'postgres';
const database = 'postgres';
const rootSha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';

export function migrationConnection(profile: LaunchProfile) {
  const transport = profile.SNIPERS_MIGRATION_TRANSPORT ?? 'direct';
  if (transport === 'direct') return { ...launchConnection(profile), transport };
  if (transport !== 'session-pooler' || profile.SNIPERS_LAUNCH_ENVIRONMENT !== 'production'
    || profile.SNIPERS_ENABLED !== 'false' || profile.SNIPERS_MIGRATION_INTERNAL_TLS_POLICY !== 'supabase-managed'
    || profile.SNIPERS_MIGRATION_PROJECT_REF !== project || profile.SNIPERS_MIGRATION_SQL_ROLE !== role
    || profile.SNIPERS_BACKUP_TRANSPORT || profile.SNIPERS_BACKUP_INTERNAL_TLS_POLICY) throw new Error('Modo de migración no autorizado para este destino.');
  let url: URL;
  try { url = new URL(profile.SNIPERS_LAUNCH_DATABASE_URL); } catch { throw new Error('Conexión explícita requerida.'); }
  const expected = { host: profile.SNIPERS_EXPECT_HOST, port: profile.SNIPERS_EXPECT_PORT,
    database: profile.SNIPERS_EXPECT_DATABASE, user: profile.SNIPERS_EXPECT_USER };
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password || url.hash
    || !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) || url.port !== '5432'
    || url.pathname !== `/${database}` || decodeURIComponent(url.username) !== `${role}.${project}`
    || expected.host !== url.hostname || expected.port !== '5432' || expected.database !== database || expected.user !== `${role}.${project}`) throw new Error('Identidad de migración incompatible.');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert', 'schema'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Parámetro de migración no permitido.');
  }
  if (url.searchParams.get('sslmode') !== 'verify-full' || !url.searchParams.get('sslrootcert')
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) throw new Error('CA explícita y verify-full requeridos.');
  return { url, expected, mode: 'production', transport };
}

function migrationCa(profile: LaunchProfile) {
  const connection = migrationConnection(profile);
  const file = connection.url.searchParams.get('sslrootcert');
  if (!file) {
    if (connection.transport === 'session-pooler') throw new Error('CA requerida.');
    return undefined;
  }
  if (!path.isAbsolute(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('CA regular de ruta absoluta requerida.');
  const pem = fs.readFileSync(file, 'utf8');
  const cert = new X509Certificate(pem);
  if (!cert.ca || !cert.verify(cert.publicKey) || Date.now() < Date.parse(cert.validFrom) || Date.now() > Date.parse(cert.validTo)
    || (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1
    || (connection.transport === 'session-pooler' && cert.fingerprint256.replace(/:/g, '').toLowerCase() !== rootSha256)) throw new Error('CA inválida o distinta de la raíz aprobada.');
  return { file, pem };
}

export function readMigrationProfile(file: string) {
  const profile = parseEnv(fs.readFileSync(file, 'utf8')) as LaunchProfile;
  if (!profile.SNIPERS_MIGRATION_TRANSPORT || profile.SNIPERS_MIGRATION_TRANSPORT === 'direct') return readLaunchProfile(file);
  migrationConnection(profile);
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Perfil privado regular requerido.');
  assertPrivateAccess(file);
  migrationCa(profile);
  return profile;
}

export function migrationClientOptions(profile: LaunchProfile): PoolConfig {
  const { url, transport } = migrationConnection(profile);
  if (transport === 'direct') return { connectionString: profile.SNIPERS_LAUNCH_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 };
  return { host: url.hostname, port: 5432, database, user: `${role}.${project}`, password: decodeURIComponent(url.password),
    max: 1, connectionTimeoutMillis: 5000,
    ssl: { ca: migrationCa(profile)!.pem, rejectUnauthorized: true, servername: url.hostname, checkServerIdentity, minVersion: 'TLSv1.2' } };
}

export function nativeMigrationUrl(profile: LaunchProfile) {
  const { url, mode } = migrationConnection(profile);
  if (mode === 'local') return profile.SNIPERS_LAUNCH_DATABASE_URL;
  const ca = migrationCa(profile), native = new URL(url);
  // Prisma Migrate's native connector uses sslcert/sslaccept, not pg's sslrootcert/verify-full.
  native.searchParams.delete('sslrootcert');
  native.searchParams.set('sslmode', 'require');
  native.searchParams.set('sslaccept', 'strict');
  if (ca) native.searchParams.set('sslcert', ca.file);
  return native.toString();
}

export function assertMigrationCommand(profile: LaunchProfile, args: string[]) {
  if (migrationConnection(profile).transport !== 'session-pooler') return;
  const index = args.indexOf('migrate'), action = args[index + 1];
  if (index < 0 || args.some(arg => arg === '--schema' || arg.startsWith('--schema='))) throw new Error('Modo Session Pooler reservado al procedimiento Snipers.');
  if (action === 'deploy') return;
  const applied = args.indexOf('--applied');
  if (action === 'resolve' && applied >= 0 && args[applied + 1] === '20261019_add_course_lead_capture_fields' && !args.includes('--rolled-back')) return;
  throw new Error('Sólo se permite conciliar octubre como aplicada o desplegar las migraciones revisadas.');
}

export async function beginMigrationRead(client: PoolClient) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('SET LOCAL search_path = public, pg_catalog');
}

export async function verifyMigrationIdentity(client: PoolClient, profile: LaunchProfile) {
  const connection = migrationConnection(profile);
  const stream = (client as PoolClient & { connection?: { stream?: Partial<TLSSocket> } }).connection?.stream;
  if (connection.transport === 'session-pooler' && (stream?.encrypted !== true || stream.authorized !== true)) throw new Error('TLS cliente/CA/hostname no acreditado.');
  if ((await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0]?.read_only !== 'on') throw new Error('Preflight requiere READ ONLY explícito.');
  if (connection.transport === 'direct') return verifyIdentity(client, profile);
  const row = (await client.query(`SELECT current_database() AS database,current_user AS "user",
    coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS upstream_tls`)).rows[0];
  if (row.database !== database || row.user !== role || typeof row.upstream_tls !== 'boolean') throw new Error('Identidad SQL de migración inesperada.');
  return { ...connection.expected, user: role, environment: connection.mode, tls: true, upstreamTls: row.upstream_tls,
    transport: connection.transport, internalTlsPolicy: 'supabase-managed' };
}

export async function verifyMigrationPermissions(client: PoolClient) {
  const row = (await client.query(`SELECT
    has_schema_privilege('public','USAGE') AND has_schema_privilege('public','CREATE') AS schema_allowed,
    has_column_privilege(format('public.%I','User'),'id','REFERENCES') AS reference_allowed,
    has_table_privilege('public._prisma_migrations','SELECT') AND has_table_privilege('public._prisma_migrations','INSERT')
      AND has_table_privilege('public._prisma_migrations','UPDATE') AS history_allowed,
    has_language_privilege('plpgsql','USAGE') AS language_allowed,
    has_function_privilege('pg_catalog.pg_advisory_lock(bigint)','EXECUTE')
      AND has_function_privilege('pg_catalog.pg_advisory_unlock(bigint)','EXECUTE') AS locks_allowed,
    EXISTS(SELECT 1 FROM pg_extension WHERE extname='btree_gist') OR (
      has_database_privilege(current_database(),'CREATE') AND EXISTS(
        SELECT 1 FROM pg_available_extensions a JOIN pg_available_extension_versions v
        ON v.name=a.name AND v.version=a.default_version WHERE a.name='btree_gist' AND v.trusted
      )) AS extension_allowed`)).rows[0];
  if (!row || ['schema_allowed','reference_allowed','history_allowed','language_allowed','locks_allowed','extension_allowed'].some(key => row[key] !== true)) throw new Error('Permisos de migración insuficientes.');
}

// Connection/permission check only, before the separately authorized October reconciliation.
// It never claims that the still-pending historical migration has been applied.
export async function checkMigrationConnection(file: string) {
  const profile = readMigrationProfile(file), pool = new Pool(migrationClientOptions(profile));
  try {
    const client = await pool.connect();
    try {
      await beginMigrationRead(client);
      const identity = await verifyMigrationIdentity(client, profile);
      await verifyMigrationPermissions(client);
      return { connectionAccepted: true, permissionsAccepted: true, snipersEnabled: false,
        transport: migrationConnection(profile).transport, clientTlsVerified: identity.tls,
        upstreamTls: 'upstreamTls' in identity ? identity.upstreamTls : identity.tls };
    } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-launch/migration-connection.ts')) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file || rest.length) { console.error('Uso: migration-connection.ts PERFIL_PRIVADO'); process.exitCode = 1; }
  else checkMigrationConnection(file).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Conexión de migración rechazada; no se modificó producción.'); process.exitCode = 1;
  });
}
