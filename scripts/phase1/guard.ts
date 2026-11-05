import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { defaultBin, isolatedEnv, localUrl, pgEnv, readProfile, root, runPg, type Profile } from '../phase0/local';

export function assertLocalContext(env: Partial<NodeJS.ProcessEnv> = process.env): void {
  if (env.NODE_ENV === 'production' || [env.CI, env.VERCEL, env.GITHUB_ACTIONS].some(v => v && v !== 'false' && v !== '0')) {
    throw new Error('Fase 1 experimental prohibida en producción/CI.');
  }
}

export function validateProfile(profile: Profile): void {
  assert.equal(profile.SNIPERS_ENVIRONMENT, 'local', 'Se requiere perfil local.');
  assert.equal(profile.PG_BIN, defaultBin, 'Binarios PostgreSQL inesperados.');
  let password: string | undefined;
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'BACKUP_DATABASE_URL']) {
    if (key !== 'DATABASE_URL' && !profile[key]) continue;
    const url = localUrl(profile[key]);
    assert.equal(url.hostname, '127.0.0.1', 'Host local inesperado.');
    assert.equal(url.port, '55432', 'Puerto local inesperado.');
    assert.equal(url.pathname, '/snipers_dev', 'Base local inesperada.');
    assert.equal(url.username, 'snipers_local', 'Rol local inesperado.');
    for (const [name, value] of url.searchParams) {
      if (!((name === 'schema' && value === 'public') || (name === 'sslmode' && value === 'disable'))) {
        throw new Error('Parámetro de conexión no admitido en Fase 1.');
      }
    }
    if (password !== undefined && url.password !== password) throw new Error('Credenciales secundarias inconsistentes.');
    password = url.password;
  }
}

export function localProfile(): Profile {
  assertLocalContext();
  const profile = readProfile();
  validateProfile(profile);
  return profile;
}

export function requireRunner(): Profile {
  const profile = localProfile();
  if (process.env.SNIPERS_PHASE1_LOCAL !== '1') throw new Error('Usá exclusivamente el lanzador local de Fase 1.');
  if (process.env.DATABASE_URL !== profile.DATABASE_URL) throw new Error('Entorno efectivo distinto del perfil validado.');
  return profile;
}

export function runnerEnv(profile: Profile): NodeJS.ProcessEnv {
  validateProfile(profile);
  return { ...isolatedEnv(profile), SNIPERS_PHASE1_LOCAL: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
}

export function queryLocal(profile: Profile, sql: string): string {
  validateProfile(profile);
  return runPg('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], pgEnv(profile.DATABASE_URL), defaultBin, sql).trim();
}

export function verifyDatabase(profile: Profile): void {
  const identity = queryLocal(profile, `SELECT current_database(),inet_server_addr(),inet_server_port(),current_user,
    current_setting('server_version'),rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname=current_user;`);
  if (identity !== 'snipers_dev|127.0.0.1|55432|snipers_local|18.6|f|f|f|f|f') throw new Error('Identidad o privilegios de PostgreSQL inesperados.');
  const expected = JSON.parse(fs.readFileSync(path.join(root, '.local/snipers/server-identity.json'), 'utf8'));
  assert.equal(expected.address, '127.0.0.1');
  assert.equal(expected.port, 55432);
  assert.equal(path.resolve(expected.dataDirectory), path.join(root, '.local/snipers/postgres'));
  // Match the live postmaster file to the Phase 0 data directory; SQL verifies the listener.
  const pid = fs.readFileSync(path.join(expected.dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  assert.equal(path.resolve(pid[1]), path.resolve(expected.dataDirectory));
  assert.equal(pid[3], '55432');
  assert.equal(pid[5], '127.0.0.1');
}

export function localPool(): Pool {
  const p = requireRunner();
  const u = localUrl(p.DATABASE_URL);
  return new Pool({ host: '127.0.0.1', port: 55432, database: 'snipers_dev', user: 'snipers_local',
    password: decodeURIComponent(u.password), ssl: false, max: 8, connectionTimeoutMillis: 5000,
    options: '-c timezone=UTC -c statement_timeout=15000 -c lock_timeout=10000', application_name: 'snipers-phase1-local' });
}

export const localSqlGuard = `DO $local_only$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
   RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY: destination rejected';
 END IF;
END $local_only$;\n`;
