import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { defaultBin, runPg, readProfile } from '../phase0/local';
import { verifyDatabase } from '../phase1/guard';
import { fileSha256, launchConnection, launchPgEnv, privateDirectory, readLaunchProfile, verifyIdentity, type LaunchProfile } from './database';

export async function verifyArchive(archive: string) {
  const metadata = JSON.parse(fs.readFileSync(archive + '.json', 'utf8'));
  if (metadata.format !== 2 || metadata.scope !== 'application-public' || metadata.completeSupabaseBackup !== false
    || metadata.bytes !== fs.statSync(archive).size || metadata.sha256 !== await fileSha256(archive) || metadata.archiveListed !== true) throw new Error('Respaldo de aplicación no verificable.');
  return metadata as { host: string; port: string; database: string; sha256: string; extensions: string[] };
}

export async function restoreVerify(archive: string, profile: LaunchProfile, report: string) {
  const { mode, expected } = launchConnection(profile);
  if (mode !== 'local' || expected.host !== '127.0.0.1' || expected.port !== '55432' || expected.user !== 'snipers_local'
    || !/^snipers_launch_restore_[a-f0-9]{8}$/.test(expected.database)) throw new Error('Restauración limitada a destino local dedicado.');
  verifyDatabase(readProfile()); // Reuse phase-0/1 postmaster, data-directory and listener identity checks.
  const metadata = await verifyArchive(archive);
  if (metadata.host === expected.host && metadata.port === expected.port && metadata.database === expected.database) throw new Error('Origen y destino coinciden.');
  if (!Array.isArray(metadata.extensions) || metadata.extensions.some(e => e !== 'btree_gist')) throw new Error('Dependencias de extensiones requieren revisión manual.');
  privateDirectory(path.dirname(report));
  if (fs.existsSync(report)) throw new Error('El informe no se sobrescribe.');
  const pool = new Pool({ connectionString: profile.SNIPERS_LAUNCH_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      const identity = await verifyIdentity(client, profile);
      // Never create/drop/reset a destination. Extension-only objects are permitted, application tables are not.
      const objects = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1`);
      if (objects.rowCount) throw new Error('Destino no vacío; no se restauró.');
      const installed = (await client.query('SELECT extname FROM pg_extension')).rows.map(r => r.extname);
      if (metadata.extensions.some(e => !installed.includes(e))) throw new Error('Falta extensión previamente autorizada en el destino.');
      const env = launchPgEnv(profile);
      const toc = runPg('pg_restore', ['--list', archive], env, profile.PG_BIN ?? defaultBin);
      // Fresh PostgreSQL databases already contain public. Skip only its CREATE SCHEMA container,
      // never objects/data/constraints, and never DROP the existing schema.
      const entries = toc.split('\n');
      if (entries.some(line => /^\d+; \d+ \d+ SCHEMA /.test(line) && !/^\d+; \d+ \d+ SCHEMA - public /.test(line))) throw new Error('Esquema inesperado en el respaldo.');
      const tocFile = report + '.toc';
      fs.writeFileSync(tocFile, entries.filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'), { flag: 'wx', mode: 0o600 });
      runPg('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--use-list', tocFile, '--dbname', expected.database, archive], env, profile.PG_BIN ?? defaultBin);
      const inventory = (await client.query(`SELECT 'table' AS kind,tablename AS name FROM pg_tables WHERE schemaname='public'
        UNION ALL SELECT 'constraint',conname FROM pg_constraint WHERE connamespace='public'::regnamespace
        UNION ALL SELECT 'sequence',sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY kind,name`)).rows;
      fs.writeFileSync(report, JSON.stringify({ archiveSha256: metadata.sha256, destination: identity, restorationSucceeded: true,
        migrationCompatibilityValidated: false, completeSupabaseBackup: false, inventory }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      return { restorationSucceeded: true, migrationCompatibilityValidated: false, objects: inventory.length };
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-launch/restore-verify.ts')) {
  const [archive, profile, report, ...rest] = process.argv.slice(2);
  if (!archive || !profile || !report || rest.length) { console.error('Uso: restore-verify.ts ARCHIVO PERFIL_LOCAL INFORME_NUEVO'); process.exitCode = 1; }
  else Promise.resolve().then(() => restoreVerify(archive, readLaunchProfile(profile), report)).then(r => console.log(JSON.stringify(r))).catch(() => { console.error('Restauración rechazada o fallida; no se acredita compatibilidad de migración.'); process.exitCode = 1; });
}
