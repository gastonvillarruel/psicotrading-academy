import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { defaultBin, fail, localUrl, pgEnv, profilePath, readProfile, root, runPg } from './phase0/local';

export type PgRunner = typeof runPg;

export async function createBackup(envFile = profilePath, directory = path.join(root, 'backups', 'snipers-local'), runner: PgRunner = runPg) {
  const profile = readProfile(envFile);
  const value = profile.BACKUP_DATABASE_URL || profile.DIRECT_URL || profile.DATABASE_URL;
  const url = localUrl(value);
  const env = pgEnv(value);
  const bin = profile.PG_BIN ?? defaultBin;
  const version = runner('pg_dump', ['--version'], env, bin).trim();
  fs.mkdirSync(directory, { recursive: true });
  const name = `local-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.dump`;
  const archive = path.join(directory, name);
  const partial = archive + '.part';
  const manifest = archive + '.json';
  try {
    runner('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', partial], env, bin);
    if (!fs.existsSync(partial) || fs.statSync(partial).size < 5) throw new Error('Backup vacío o incompleto.');
    const fd = fs.openSync(partial, 'r');
    const header = Buffer.alloc(5);
    try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
    if (header.toString() !== 'PGDMP') throw new Error('El archivo no es un respaldo custom de PostgreSQL.');
    runner('pg_restore', ['--list', partial], env, bin);
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(partial)) hash.update(chunk);
    const metadata = {
      format: 1, createdAt: new Date().toISOString(), environment: 'local',
      database: url.pathname.slice(1), host: url.hostname, port: url.port,
      pgDumpVersion: version, bytes: fs.statSync(partial).size, sha256: hash.digest('hex'),
      contents: 'schema-and-data', archiveListed: true, restorationTested: false,
    };
    fs.renameSync(partial, archive);
    fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { archive, manifest };
  } catch (error) {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts', 'backup.ts')) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--env-file')) {
    fail(new Error('Uso: npm run db:backup -- [--env-file PERFIL_LOCAL]. No se permiten destinos remotos.'));
  } else {
    createBackup(args[1] ? path.resolve(args[1]) : profilePath)
      .then(result => console.log(JSON.stringify(result)))
      .catch(fail);
  }
}
