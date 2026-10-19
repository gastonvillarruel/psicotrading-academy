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

  console.log('Creando tabla SiteSetting si no existe...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "SiteSetting" (
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
    );
  `);

  console.log('Insertando configuración por defecto para promoBannerEnabled si no existe...');
  await client.query(`
    INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
    VALUES ('promoBannerEnabled', 'true', CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO NOTHING;
  `);

  console.log('✅ Tabla SiteSetting lista.');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
