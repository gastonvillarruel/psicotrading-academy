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

  console.log('Agregando columnas isLeadCapture, whatsappGroupUrl y leadCaptureCtaText a la tabla Course...');
  await client.query('ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "isLeadCapture" BOOLEAN NOT NULL DEFAULT false;');
  await client.query('ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "whatsappGroupUrl" TEXT;');
  await client.query('ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "leadCaptureCtaText" TEXT;');
  console.log('✅ Columnas agregadas con éxito a Course.');

  // Configurar enlace real existente para taller-punto-de-quiebre
  await client.query(`
    UPDATE "Course"
    SET "whatsappGroupUrl" = 'https://chat.whatsapp.com/J5qzNR1I0NB03c6cQPD6JN?s=cl&p=a&mlu=4&ilr=4',
        "leadCaptureCtaText" = 'RESERVAR MI LUGAR GRATIS'
    WHERE "slug" = 'taller-punto-de-quiebre' AND ("whatsappGroupUrl" IS NULL OR "whatsappGroupUrl" = '');
  `);
  console.log('✅ Configuración inicial para taller-punto-de-quiebre lista.');

  await client.end();
}

main().catch((err) => {
  console.error('Error al actualizar tabla Course:', err);
  process.exit(1);
});
