import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

export const root = process.cwd();
export const localDir = path.join(root, '.local', 'snipers');
export const profilePath = path.join(root, '.env.snipers.local');
export const defaultBin = process.platform === 'win32' ? 'F:/PostgreSQL-Snipers/pgsql/bin' : '';
export type Profile = Record<string, string>;

const sslParameters: Record<string, string> = {
  sslmode: 'PGSSLMODE', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY',
  sslrootcert: 'PGSSLROOTCERT', sslcrl: 'PGSSLCRL', sslcrldir: 'PGSSLCRLDIR',
  sslpassword: 'PGSSLPASSWORD', sslnegotiation: 'PGSSLNEGOTIATION',
  channel_binding: 'PGCHANNELBINDING', connect_timeout: 'PGCONNECT_TIMEOUT',
  application_name: 'PGAPPNAME', options: 'PGOPTIONS', target_session_attrs: 'PGTARGETSESSIONATTRS',
};
const prismaParameters = new Set(['schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'socket_timeout']);

export function localUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('URL PostgreSQL inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Conexión rechazada: solo se permite PostgreSQL en loopback literal (127.0.0.1 o ::1).');
  }
  if (!url.username || !url.password || !/^\/[a-z_][a-z0-9_]*$/.test(url.pathname) || !url.port) {
    throw new Error('La conexión local requiere usuario, contraseña, base y puerto explícitos.');
  }
  for (const key of url.searchParams.keys()) {
    if (!Object.hasOwn(sslParameters, key) && !prismaParameters.has(key)) throw new Error(`Parámetro de conexión no permitido: ${key}.`);
  }
  return url;
}

export function readProfile(file = profilePath): Profile {
  if (!fs.existsSync(file)) throw new Error('Falta el perfil local explícito. Ejecutá npm run db:local -- setup.');
  const profile = parseEnv(fs.readFileSync(file, 'utf8')) as Profile;
  if (profile.SNIPERS_ENVIRONMENT !== 'local' || !profile.DATABASE_URL) {
    throw new Error('El perfil debe declarar SNIPERS_ENVIRONMENT=local y DATABASE_URL.');
  }
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'BACKUP_DATABASE_URL']) if (profile[key]) localUrl(profile[key]);
  return profile;
}

const externalKey = /^(PG|GOOGLE_|EMAIL_|SUPABASE_|R2_|BUNNY_|MERCADOPAGO_|MP_|PAYPAL_|NOWPAYMENTS_|STRIPE_|TERMINAL_|VERCEL_|DATABASE_|DIRECT_URL$|BACKUP_DATABASE_URL$|NEXT_PUBLIC_)/;

export function isolatedEnv(profile: Profile, directory = root): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Empty values prevent Next/dotenv from refilling secrets from the original .env*.
  for (const key of Object.keys(env)) if (externalKey.test(key)) env[key] = '';
  for (const name of fs.readdirSync(directory).filter(name => name.startsWith('.env'))) {
    const file = path.join(directory, name);
    if (!fs.statSync(file).isFile()) continue;
    for (const key of Object.keys(parseEnv(fs.readFileSync(file, 'utf8')))) {
      if (!['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].includes(key)) env[key] = '';
    }
  }
  for (const key of ['SNIPERS_ENVIRONMENT', 'DATABASE_URL', 'DIRECT_URL', 'BACKUP_DATABASE_URL',
    'NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'NEXTAUTH_SECRET', 'ENABLE_SINGLE_SESSION', 'PG_BIN']) {
    if (profile[key] !== undefined) env[key] = profile[key];
  }
  env.SNIPERS_ENABLED = 'false';
  env.PAYPAL_ENABLED = 'false';
  env.PAYPAL_ENV = 'sandbox';
  env.NOWPAYMENTS_ENV = 'sandbox';
  env.NODE_ENV = 'development';
  return env;
}

export function pgEnv(value: string): NodeJS.ProcessEnv {
  const url = localUrl(value);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/.test(key)) delete env[key];
  Object.assign(env, {
    PGHOST: url.hostname === '[::1]' ? '::1' : url.hostname,
    PGPORT: url.port, PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8', PGPASSFILE: path.join(localDir, 'unused.pgpass'),
  });
  for (const [key, value] of url.searchParams) if (Object.hasOwn(sslParameters, key)) env[sslParameters[key]] = value;
  return env;
}

export function runPg(tool: string, args: string[], env: NodeJS.ProcessEnv, bin = defaultBin, input?: string): string {
  const executable = bin ? path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')) : tool;
  const result = spawnSync(executable, args, {
    env, input, encoding: 'utf8', windowsHide: true, shell: false,
    timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    let diagnostic = (result.stderr || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL omitida]')
      .replace(/PASSWORD\s+'[^']*'/gi, 'PASSWORD [omitida]');
    for (const [key, value] of Object.entries(env)) {
      if (/SECRET|TOKEN|PASSWORD|_KEY/.test(key) && value) {
        diagnostic = diagnostic.split(value).join('[omitido]').split(encodeURIComponent(value)).join('[omitido]');
      }
    }
    throw new Error(`${tool} falló (${result.error ? 'no ejecutable o tiempo agotado' : `código ${result.status}`}). ${diagnostic.trim().slice(0, 700)}`);
  }
  return result.stdout;
}

export function npmBackup(file: string): { archive: string; manifest: string } {
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const result = spawnSync(process.execPath, [cli, 'run', 'db:backup', '--', '--env-file', file], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000,
  });
  if (result.error || result.status !== 0) throw new Error('npm run db:backup falló. No se continuará con escrituras locales.');
  const line = result.stdout.trim().split(/\r?\n/).findLast(line => line.startsWith('{'));
  if (!line) throw new Error('El backup no devolvió un resultado verificable.');
  const output = JSON.parse(line);
  console.log(`Respaldo local verificado: ${path.relative(root, output.archive)}`);
  return output;
}

export function writePrivate(file: string, content: string): void {
  fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
}

export function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : 'Operación local fallida.');
  process.exitCode = 1;
}
