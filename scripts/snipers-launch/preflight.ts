// Read-only gate. Called automatically before migrate deploy through the launch config.
import path from 'node:path';
import { Pool } from 'pg';
import { readLaunchProfile, verifyIdentity, verifyMigrationHistory } from './database';
import { assembleMigration, migrationName, sha256 } from './prepare';

export async function preflight(file: string) {
  const profile=readLaunchProfile(file);
  const pool=new Pool({connectionString:profile.SNIPERS_LAUNCH_DATABASE_URL,max:1,connectionTimeoutMillis:5000,
    options:'-c default_transaction_read_only=on -c statement_timeout=10000 -c search_path=public,pg_catalog'});
  try {
    const client=await pool.connect();
    try {
      await verifyIdentity(client,profile);
      const applied=!!(await client.query('SELECT 1 FROM public._prisma_migrations WHERE migration_name=$1',[migrationName])).rowCount;
      await verifyMigrationHistory(client,applied);
      if(!applied) {
        const collisions=await client.query(`SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND (relname LIKE 'Snipers%' OR relname='UserPermission')
          UNION ALL SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace AND typname LIKE 'Snipers%'
          UNION ALL SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'snipers%' LIMIT 1`);
        if(collisions.rowCount)throw new Error('Objetos Snipers previos sin migración acreditada.');
      }
      return {historyAccepted:true,migrationApplied:applied,migrationSha256:sha256(assembleMigration()),productionCompatibilityValidated:false};
    } finally {client.release();}
  } finally {await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/snipers-launch/preflight.ts')) {
  const [file,...rest]=process.argv.slice(2);
  if(!file||rest.length){console.error('Uso: preflight.ts PERFIL_EXPLICITO');process.exitCode=1;}
  else preflight(file).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Preflight rechazado: identidad, TLS, artefacto o historial incompatible. No se reparó nada.');process.exitCode=1;});
}
