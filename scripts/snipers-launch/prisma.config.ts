// Explicit alternative, never loaded by the application build. No dotenv/config.
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { execFileSync } from 'node:child_process';
import { readMigrationProfile, nativeMigrationUrl, assertMigrationCommand } from './migration-connection';

if (!process.env.SNIPERS_LAUNCH_PROFILE) throw new Error('Falta perfil de lanzamiento explícito.');
const profile = readMigrationProfile(process.env.SNIPERS_LAUNCH_PROFILE);
assertMigrationCommand(profile, process.argv);
if (process.argv.includes('migrate') && process.argv.includes('deploy')) {
  try { execFileSync(process.execPath, ['--import','tsx','scripts/snipers-launch/preflight.ts',process.env.SNIPERS_LAUNCH_PROFILE], {stdio:'pipe',windowsHide:true,timeout:30000}); }
  catch { throw new Error('Deploy bloqueado por el preflight obligatorio; no se reparó el historial.'); }
} else if (process.argv.includes('migrate') && process.argv.includes('resolve')) {
  try { execFileSync(process.execPath, ['--import','tsx','scripts/snipers-launch/migration-connection.ts',process.env.SNIPERS_LAUNCH_PROFILE], {stdio:'pipe',windowsHide:true,timeout:30000}); }
  catch { throw new Error('Conciliación bloqueada por identidad, TLS o permisos; no se reparó el historial.'); }
}
export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  migrations: { path: path.resolve('prisma/migrations') },
  datasource: { url: nativeMigrationUrl(profile) },
});
