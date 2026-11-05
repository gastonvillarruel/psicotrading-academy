// Explicit alternative, never loaded by the application build. No dotenv/config.
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { execFileSync } from 'node:child_process';
import { readLaunchProfile } from './database';

if (!process.env.SNIPERS_LAUNCH_PROFILE) throw new Error('Falta perfil de lanzamiento explícito.');
const profile = readLaunchProfile(process.env.SNIPERS_LAUNCH_PROFILE);
if (process.argv.includes('migrate') && process.argv.includes('deploy')) {
  try { execFileSync(process.execPath, ['--import','tsx','scripts/snipers-launch/preflight.ts',process.env.SNIPERS_LAUNCH_PROFILE], {stdio:'pipe',windowsHide:true,timeout:30000}); }
  catch { throw new Error('Deploy bloqueado por el preflight obligatorio; no se reparó el historial.'); }
}
export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  migrations: { path: path.resolve('prisma/migrations') },
  datasource: { url: profile.SNIPERS_LAUNCH_DATABASE_URL },
});
