import { Pool } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { createR2Storage } from '../../src/lib/snipers/upload-storage';
import { processUploadOnce } from '../../src/lib/snipers/upload-processor';

async function main() {
  // Separate explicit switch: the web flag remains false in this delivery.
  if (process.env.SNIPERS_UPLOAD_PROCESSOR_ENABLED !== 'true') throw new Error('Procesador deshabilitado.');
  if (!process.env.DATABASE_URL) throw new Error('Falta conexión explícita.');
  const storage = createR2Storage();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=15000 -c lock_timeout=10000', application_name: 'snipers-upload-processor' });
  const shutdown = new AbortController();
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => shutdown.abort());
  const singleton = await pool.connect();
  singleton.on('error', () => shutdown.abort());
  try {
    if (!(await singleton.query('SELECT pg_try_advisory_lock(1397639505) AS acquired')).rows[0].acquired) throw new Error('Ya hay un procesador activo.');
    console.log('Procesador de transferencias iniciado; no valida ni publica archivos.');
    while (!shutdown.signal.aborted) {
      // The dedicated connection owns the singleton lock; loss stops all remote operations.
      await singleton.query('SELECT 1');
      if (!await processUploadOnce(pool, storage, shutdown.signal)) await delay(2000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  } finally { shutdown.abort(); singleton.release(); await pool.end(); }
}
main().catch(() => { console.error('Procesador detenido. Revisá configuración y conectividad; no se muestran credenciales.'); process.exitCode = 1; });
