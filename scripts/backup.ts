import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { defaultBin, fail, localUrl, pgEnv, profilePath, readProfile, root, runPg } from './phase0/local';
import { Pool } from 'pg';
import { launchConnection, launchPgEnv, privateDirectory, readLaunchProfile, verifyIdentity } from './snipers-launch/database';

export type PgRunner = typeof runPg;

export async function createBackup(envFile = profilePath, directory = path.join(root, 'backups', 'snipers-local'), runner: PgRunner = runPg) {
  const profile = readProfile(envFile);
  const value = profile.BACKUP_DATABASE_URL || profile.DIRECT_URL || profile.DATABASE_URL;
  const url = localUrl(value);
  const env = pgEnv(value);
  const bin = profile.PG_BIN ?? defaultBin;
  return writeArchive(env, directory, bin, runner, { environment: 'local', database: url.pathname.slice(1), host: url.hostname, port: url.port });
}

async function writeArchive(env: NodeJS.ProcessEnv, directory: string, bin: string, runner: PgRunner,
  identity: { environment: string; database: string; host: string; port: string }, extensions?: string[]) {
  const version = runner('pg_dump', ['--version'], env, bin).trim();
  privateDirectory(directory);
  const name = `${identity.environment}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.dump`;
  const archive = path.join(directory, name);
  const partial = archive + '.part';
  const manifest = archive + '.json';
  try {
    runner('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', ...(extensions ? ['--schema=public'] : []), '--file', partial], env, bin);
    if (fs.existsSync(partial)) fs.chmodSync(partial, 0o600);
    if (!fs.existsSync(partial) || fs.statSync(partial).size < 5) throw new Error('Backup vacío o incompleto.');
    const fd = fs.openSync(partial, 'r');
    const header = Buffer.alloc(5);
    try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
    if (header.toString() !== 'PGDMP') throw new Error('El archivo no es un respaldo custom de PostgreSQL.');
    runner('pg_restore', ['--list', partial], env, bin);
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(partial)) hash.update(chunk);
    const metadata = {
      format: extensions ? 2 : 1, createdAt: new Date().toISOString(), ...identity,
      pgDumpVersion: version, bytes: fs.statSync(partial).size, sha256: hash.digest('hex'),
      contents: 'schema-and-data', archiveListed: true, restorationTested: false,
      ...(extensions ? { scope: 'application-public', completeSupabaseBackup: false, extensions,
        migrationCompatibilityValidated: false, excludes: ['roles-and-grants', 'managed-auth-storage', 'R2-objects', 'provider-settings'] } : {}),
    };
    fs.renameSync(partial, archive);
    fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { archive, manifest };
  } catch (error) {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
    throw error;
  }
}

export async function createAuthorizedBackup(file: string, allowRemoteRead: boolean, directory = path.join(root, 'backups', 'snipers-launch')) {
  const profile = readLaunchProfile(file);
  const { mode } = launchConnection(profile);
  if (mode !== 'local' && !allowRemoteRead) throw new Error('Lectura remota no autorizada explícitamente.');
  const pool = new Pool({ connectionString: profile.SNIPERS_LAUNCH_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on -c statement_timeout=15000' });
  try {
    const client = await pool.connect();
    try {
      const identity = await verifyIdentity(client, profile);
      const extensions = (await client.query("SELECT extname FROM pg_extension WHERE extname<>'plpgsql' ORDER BY extname")).rows.map(r => r.extname as string);
      const env = launchPgEnv(profile);
      env.PGOPTIONS = '-c default_transaction_read_only=on';
      return await writeArchive(env, directory, profile.PG_BIN ?? defaultBin, runPg, identity, extensions);
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts', 'backup.ts')) {
  const args = process.argv.slice(2);
  if (args[0] === '--launch-profile' && (args.length === 2 || (args.length === 3 && args[2] === '--allow-remote-read'))) {
    createAuthorizedBackup(path.resolve(args[1]), args[2] === '--allow-remote-read')
      .then(result => console.log(JSON.stringify(result)))
      .catch(() => { console.error('Respaldo autorizado fallido; no se acredita restauración ni compatibilidad de migración.'); process.exitCode = 1; });
  } else if (args.length && (args.length !== 2 || args[0] !== '--env-file')) {
    fail(new Error('Uso: npm run db:backup -- [--env-file PERFIL_LOCAL]. No se permiten destinos remotos.'));
  } else {
    createBackup(args[1] ? path.resolve(args[1]) : profilePath)
      .then(result => console.log(JSON.stringify(result)))
      .catch(fail);
  }
}
