// Backup-only transport. Migration/launch profiles continue to require a direct connection.
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { parseEnv } from 'node:util';
import { checkServerIdentity, type TLSSocket } from 'node:tls';
import type { PoolClient, PoolConfig } from 'pg';
import { assertPrivateAccess, launchConnection, launchPgEnv, readLaunchProfile, verifyIdentity, type LaunchProfile } from './database';

const supabaseRootSha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';

export function backupConnection(profile: LaunchProfile) {
  const transport = profile.SNIPERS_BACKUP_TRANSPORT ?? 'direct';
  if (transport === 'direct') return { ...launchConnection(profile), transport, role: profile.SNIPERS_EXPECT_USER };
  if (transport !== 'session-pooler' || profile.SNIPERS_LAUNCH_ENVIRONMENT !== 'production' || profile.SNIPERS_ENABLED !== 'false') throw new Error('Transporte de respaldo inválido.');
  let url: URL;
  try { url = new URL(profile.SNIPERS_LAUNCH_DATABASE_URL); } catch { throw new Error('Conexión explícita requerida.'); }
  const expected = { host: profile.SNIPERS_EXPECT_HOST, port: profile.SNIPERS_EXPECT_PORT,
    database: profile.SNIPERS_EXPECT_DATABASE, user: profile.SNIPERS_EXPECT_USER };
  const role = profile.SNIPERS_BACKUP_EXPECT_ROLE;
  const project = profile.SNIPERS_BACKUP_EXPECT_PROJECT_REF;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password || url.hash
    || !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) || url.port !== '5432'
    || !/^[a-z_][a-z0-9_]*$/.test(role ?? '') || !/^[a-z0-9]{20}$/.test(project ?? '')
    || !/^\/[a-z_][a-z0-9_]*$/.test(url.pathname)
    || !Object.values(expected).every(Boolean) || expected.host !== url.hostname || expected.port !== url.port
    || expected.database !== decodeURIComponent(url.pathname.slice(1)) || expected.user !== decodeURIComponent(url.username)
    || expected.user !== `${role}.${project}`) throw new Error('Identidad de Session Pooler incompatible.');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert', 'schema'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Parámetro de respaldo no permitido.');
  }
  if (url.searchParams.get('sslmode') !== 'verify-full' || !url.searchParams.get('sslrootcert')
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) throw new Error('CA explícita y verify-full requeridos.');
  return { url, expected, mode: 'production', transport, role };
}

export function assertBackupPolicy(profile: LaunchProfile) {
  if (backupConnection(profile).transport === 'session-pooler' && !['require', 'supabase-managed'].includes(profile.SNIPERS_BACKUP_INTERNAL_TLS_POLICY)) {
    throw new Error('Respaldo bloqueado: decisión de TLS interno pendiente o política desconocida.');
  }
}

export function readBackupProfile(file: string) {
  const profile = parseEnv(fs.readFileSync(file, 'utf8')) as LaunchProfile;
  if (!profile.SNIPERS_BACKUP_TRANSPORT || profile.SNIPERS_BACKUP_TRANSPORT === 'direct') return readLaunchProfile(file);
  backupConnection(profile);
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Perfil privado regular requerido.');
  assertPrivateAccess(file);
  return profile;
}

function verifiedCa(profile: LaunchProfile) {
  const { url } = backupConnection(profile);
  const file = url.searchParams.get('sslrootcert')!;
  if (!path.isAbsolute(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('CA regular de ruta absoluta requerida.');
  const ca = fs.readFileSync(file, 'utf8');
  const cert = new X509Certificate(ca);
  if ((ca.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1 || !cert.ca
    || cert.fingerprint256.replace(/:/g, '').toLowerCase() !== supabaseRootSha256
    || !cert.verify(cert.publicKey) || Date.now() < Date.parse(cert.validFrom) || Date.now() > Date.parse(cert.validTo)) throw new Error('CA Supabase distinta de la raíz verificada o fuera de vigencia.');
  return ca;
}

export function backupClientOptions(profile: LaunchProfile): PoolConfig {
  const { url, transport } = backupConnection(profile);
  assertBackupPolicy(profile);
  if (transport === 'direct') return { connectionString: profile.SNIPERS_LAUNCH_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 };
  return { host: url.hostname, port: 5432, database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), max: 1, connectionTimeoutMillis: 5000,
    ssl: { ca: verifiedCa(profile), rejectUnauthorized: true, servername: url.hostname, checkServerIdentity, minVersion: 'TLSv1.2' } };
}

export function backupPgEnv(profile: LaunchProfile): NodeJS.ProcessEnv {
  const { url, transport } = backupConnection(profile);
  assertBackupPolicy(profile);
  if (transport === 'direct') return launchPgEnv(profile);
  verifiedCa(profile); // libpq independently verifies the same CA and hostname.
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { PGHOST: url.hostname, PGPORT: '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5',
    PGCLIENTENCODING: 'UTF8', PGPASSFILE: path.resolve('.local/snipers/launch-a/no-pgpass'),
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: url.searchParams.get('sslrootcert')! });
  return env;
}

export async function beginBackupRead(client: PoolClient) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  if ((await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0]?.read_only !== 'on') throw new Error('Transacción de respaldo no acreditada como READ ONLY.');
}

export async function verifyBackupIdentity(client: PoolClient, profile: LaunchProfile) {
  const connection = backupConnection(profile);
  assertBackupPolicy(profile);
  if (connection.transport === 'direct') return verifyIdentity(client, profile);
  const stream = (client as PoolClient & { connection?: { stream?: Partial<TLSSocket> } }).connection?.stream;
  if (stream?.encrypted !== true || stream.authorized !== true) throw new Error('TLS cliente/CA/hostname no acreditado.');
  const row = (await client.query(`SELECT current_database() AS database,current_user AS "user",
    current_setting('transaction_read_only') AS read_only,
    coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS upstream_tls`)).rows[0];
  if (row.database !== connection.expected.database || row.user !== connection.role || row.read_only !== 'on') throw new Error('Identidad SQL o READ ONLY inesperados.');
  if (typeof row.upstream_tls !== 'boolean' || (profile.SNIPERS_BACKUP_INTERNAL_TLS_POLICY === 'require' && !row.upstream_tls)) throw new Error('Respaldo bloqueado: el enlace pooler/PostgreSQL no acredita TLS.');
  return { ...connection.expected, user: connection.role, environment: connection.mode, tls: true, upstreamTls: row.upstream_tls,
    internalTlsPolicy: profile.SNIPERS_BACKUP_INTERNAL_TLS_POLICY,
    transport: connection.transport, caSha256: supabaseRootSha256 };
}
