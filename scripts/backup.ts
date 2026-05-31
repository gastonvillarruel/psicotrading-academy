import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Leer DATABASE_URL del archivo .env
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('Error: No se encontró el archivo .env.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL="?([^"\n\r]+)"?/);
if (!match) {
  console.error('Error: DATABASE_URL no está definida en el archivo .env.');
  process.exit(1);
}

const databaseUrl = match[1];

// Asegurar que la carpeta backups/ existe
const backupsDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Formatear timestamp local YYYYMMDD-HHMMSS
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupFile = `data-${timestamp}.sql`;
const backupPath = path.join(backupsDir, backupFile);

console.log(`Iniciando exportación de datos desde Supabase a backups/${backupFile}...`);
try {
  execSync(`pg_dump "${databaseUrl}" --data-only --inserts -f "${backupPath}"`, { stdio: 'inherit' });
  console.log('✅ ¡Backup exportado con éxito!');
} catch (error: any) {
  console.error('\n❌ Error al ejecutar pg_dump.');
  console.error('Verificá que pg_dump (PostgreSQL client tools) esté instalado en tu sistema y en el PATH.');
  console.error(`Detalles del error: ${error.message}\n`);
}
