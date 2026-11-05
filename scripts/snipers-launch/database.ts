// Explicit launch profiles only. No dotenv loading, default database, or production execution in tests.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { migrationName, migrationFile, assembleMigration, sha256 } from './prepare';

export type LaunchProfile = Record<string, string>;
// Static program: never interpolate a path or credential into shell code.
export const windowsPrivateAccessCheck = String.raw`
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ([string]::IsNullOrWhiteSpace($me) -or [string]::IsNullOrWhiteSpace($env:SNIPERS_ACL_PATH)) { throw 'Missing identity or path' }
  $allowed = @($me, 'S-1-5-18', 'S-1-5-32-544')
  $acl = Get-Acl -LiteralPath $env:SNIPERS_ACL_PATH -ErrorAction Stop
  if ($acl -isnot [System.Security.AccessControl.FileSystemSecurity]) { throw 'Unverifiable ACL' }
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0) { throw 'Missing DACL' }
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne $raw.DiscretionaryAcl.Count) { throw 'Incomplete ACL inspection' }
  foreach ($ace in $raw.DiscretionaryAcl) {
    if ($ace -isnot [System.Security.AccessControl.CommonAce] -or $ace.IsCallback) { throw 'Unsupported ACE' }
  }
  foreach ($rule in $rules) {
    if ($rule -isnot [System.Security.AccessControl.FileSystemAccessRule] -or [int]$rule.FileSystemRights -eq 0) { throw 'Unverifiable rule' }
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ([string]::IsNullOrWhiteSpace($sid)) { throw 'Unverifiable identity' }
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
      if ($sid -notin $allowed) { throw 'Non-private grant' }
    } elseif ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Deny) { throw 'Unverifiable permission' }
  }
  Write-Output 'SNIPERS_PRIVATE_ACL_OK'
} catch { exit 1 }
`;

export function assertWindowsPrivateAccess(file: string) {
  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsPrivateAccessCheck], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 10000,
      env: { NODE_ENV: 'production', SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, SNIPERS_ACL_PATH: path.resolve(file) },
    });
    if (result.trim() !== 'SNIPERS_PRIVATE_ACL_OK') throw new Error('Inspección incompleta.');
  } catch { throw new Error('ACL privada requerida: operador, SYSTEM y administradores.'); }
}

function assertPrivateAccess(file: string) {
  if (process.platform !== 'win32') {
    if (fs.statSync(file).mode & 0o077) throw new Error('Se requieren permisos privados.');
    return;
  }
  assertWindowsPrivateAccess(file);
}
export async function fileSha256(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function launchConnection(profile: LaunchProfile) {
  const mode = profile.SNIPERS_LAUNCH_ENVIRONMENT;
  if (!['local', 'staging', 'production'].includes(mode) || profile.SNIPERS_ENABLED !== 'false') throw new Error('Perfil de lanzamiento inválido.');
  let url: URL;
  try { url = new URL(profile.SNIPERS_LAUNCH_DATABASE_URL); } catch { throw new Error('Conexión explícita requerida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || !url.port || url.hash
    || !/^\/[a-z_][a-z0-9_]*$/.test(url.pathname)) throw new Error('Conexión de lanzamiento inválida.');
  const expected = { host: profile.SNIPERS_EXPECT_HOST, port: profile.SNIPERS_EXPECT_PORT,
    database: profile.SNIPERS_EXPECT_DATABASE, user: profile.SNIPERS_EXPECT_USER };
  if (!Object.values(expected).every(Boolean) || url.hostname !== expected.host || url.port !== expected.port
    || decodeURIComponent(url.pathname.slice(1)) !== expected.database || decodeURIComponent(url.username) !== expected.user) throw new Error('Destino distinto de la identidad esperada.');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert', 'schema'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Parámetro de conexión no permitido.');
  }
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') throw new Error('Sólo esquema public.');
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (mode === 'local' ? !loopback : loopback || url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Entorno/TLS incompatible.');
  if (url.port === '6543' || /pooler/i.test(url.hostname)) throw new Error('Lanzamiento requiere conexión directa.');
  return { url, mode, expected };
}
export function readLaunchProfile(file: string) {
  const profile = parseEnv(fs.readFileSync(file, 'utf8')) as LaunchProfile;
  const { mode } = launchConnection(profile);
  if (mode !== 'local') {
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Perfil privado regular requerido.');
    assertPrivateAccess(file);
  }
  return profile;
}

// For pg_dump/pg_restore only: never inherit PG*, service files, secrets or NODE_OPTIONS.
export function launchPgEnv(profile: LaunchProfile): NodeJS.ProcessEnv {
  const { url } = launchConnection(profile);
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { PGHOST: url.hostname === '[::1]' ? '::1' : url.hostname, PGPORT: url.port,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8',
    PGPASSFILE: path.resolve('.local/snipers/launch-a/no-pgpass'), PGSSLMODE: url.searchParams.get('sslmode') ?? 'disable' });
  if (url.searchParams.has('sslrootcert')) env.PGSSLROOTCERT = url.searchParams.get('sslrootcert')!;
  return env;
}

export function privateDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Directorio privado no puede ser enlace.');
  if (process.platform === 'win32') {
    const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = identity.match(/S-1-5-21-[\d-]+/)?.[0];
    if (!sid) throw new Error('No se pudo identificar el propietario del respaldo.');
    execFileSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
  } else { fs.chmodSync(directory, 0o700); }
  assertPrivateAccess(directory); // Reject remaining explicit broad ACLs, not only inherited grants.
}

export async function verifyIdentity(client: PoolClient, profile: LaunchProfile) {
  const { expected, mode } = launchConnection(profile);
  const row = (await client.query(`SELECT current_database() AS database,current_user AS "user",host(inet_server_addr()) AS address,
    inet_server_port() AS port,coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS tls`)).rows[0];
  if (row.database !== expected.database || row.user !== expected.user || (mode === 'local'
    ? !['127.0.0.1', '::1'].includes(row.address) || String(row.port) !== expected.port : !row.tls)) throw new Error('Identidad SQL/TLS inesperada.');
  return { ...expected, environment: mode, tls: row.tls as boolean };
}

export function historicalMigrations() {
  return fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== migrationName && d.name !== basicFilesMigration)
    .map(d => ({ name: d.name, checksum: sha256(fs.readFileSync(`prisma/migrations/${d.name}/migration.sql`)) })).sort((a,b) => a.name.localeCompare(b.name));
}
export const basicFilesMigration = '20261101000000_snipers_basic_files';
export async function verifyMigrationHistory(client: PoolClient, applied: boolean) {
  if (!fs.readFileSync(migrationFile).equals(Buffer.from(assembleMigration()))) throw new Error('Migración distinta del ensamblado revisado.');
  const expected = historicalMigrations();
  if (applied) expected.push({ name: migrationName, checksum: sha256(fs.readFileSync(migrationFile)) });
  const rows = (await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name')).rows;
  if (rows.some(r => r.migration_name === basicFilesMigration)) {
    if (!applied) throw new Error('Corrección Snipers sin migración base.');
    expected.push({ name: basicFilesMigration, checksum: sha256(fs.readFileSync(`prisma/migrations/${basicFilesMigration}/migration.sql`)) });
  }
  if (rows.length !== expected.length || expected.some(e => !rows.some(r => r.migration_name === e.name && r.checksum === e.checksum && r.finished_at && !r.rolled_back_at))) throw new Error('Historial Prisma incompatible: detenerse, sin reparación automática.');
}
