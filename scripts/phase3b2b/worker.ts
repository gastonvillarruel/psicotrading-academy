import { Pool } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { createR2Storage } from '../../src/lib/snipers/upload-storage';
import { processUploadOnce } from '../../src/lib/snipers/upload-processor';
import { processValidationOnce } from '../../src/lib/snipers/file-processor';
import { createFileAnalyzer } from '../../src/lib/snipers/file-analyzers';
import { maintainStorageOnce, processCleanupOnce } from '../../src/lib/snipers/storage-cleanup';

async function main() {
  // Separate explicit switch: the web flag remains false in this delivery.
  if (process.env.SNIPERS_UPLOAD_PROCESSOR_ENABLED !== 'true') throw new Error('Procesador deshabilitado.');
  if (!process.env.DATABASE_URL) throw new Error('Falta conexión explícita.');
  const storage = createR2Storage();
  // Explicit opt-in until the Linux analyzer dependencies/isolation are integrated.
  const analyzer = process.env.SNIPERS_FILE_VALIDATION_ENABLED === 'true'
    ? createFileAnalyzer(process.env.SNIPERS_CLAMAV_DATABASE_DIRECTORY ?? '') : null;
  const scratch = process.env.SNIPERS_VALIDATION_TEMP_DIRECTORY;
  const cleanup = process.env.SNIPERS_STORAGE_CLEANUP_ENABLED === 'true';
  let nextMaintenance = 0;
  if (analyzer && (!scratch || !/^\/[a-zA-Z0-9_/-]+$/.test(scratch) || process.platform !== 'linux')) throw new Error('Falta directorio Linux de validación compartido con systemd.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=15000 -c lock_timeout=10000', application_name: 'snipers-upload-processor' });
  const shutdown = new AbortController();
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => shutdown.abort());
  const singleton = await pool.connect();
  singleton.on('error', () => shutdown.abort());
  try {
    if (!(await singleton.query('SELECT pg_try_advisory_lock(1397639505) AS acquired')).rows[0].acquired) throw new Error('Ya hay un procesador activo.');
    console.log(`Procesador privado iniciado; validación ${analyzer ? 'habilitada' : 'deshabilitada'}.`);
    while (!shutdown.signal.aborted) {
      // The dedicated connection owns the singleton lock; loss stops all remote operations.
      await singleton.query('SELECT 1');
      const transferred = await processUploadOnce(pool, storage, shutdown.signal);
      const validated = analyzer && !shutdown.signal.aborted ? await processValidationOnce(pool, storage, analyzer, shutdown.signal, undefined, scratch) : false;
      let maintained = false, cleaned = false;
      if (cleanup && !shutdown.signal.aborted) {
        if (Date.now() >= nextMaintenance) {
          maintained = await maintainStorageOnce(pool);
          nextMaintenance = Date.now() + 60000;
        }
        if (!shutdown.signal.aborted) cleaned = await processCleanupOnce(pool, storage, shutdown.signal);
      }
      if (!transferred && !validated && !maintained && !cleaned) await delay(2000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  } finally { shutdown.abort(); singleton.release(); await pool.end(); }
}
main().catch(() => { console.error('Procesador detenido. Revisá configuración y conectividad; no se muestran credenciales.'); process.exitCode = 1; });
