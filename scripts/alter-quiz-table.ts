import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No se encontró el archivo .env');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL="?([^"\n\r]+)"?/);
  if (!match) {
    console.error('No se encontró DATABASE_URL en .env');
    process.exit(1);
  }

  const connectionString = match[1];
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Agregando columna youtubeLiveUrl a la tabla Quiz...');
  await client.query('ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "youtubeLiveUrl" TEXT;');
  console.log('✅ ¡Columna youtubeLiveUrl agregada con éxito!');
  await client.end();
}

main().catch((err) => {
  console.error('Error al agregar columna:', err);
  process.exit(1);
});
