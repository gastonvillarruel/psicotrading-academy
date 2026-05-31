import { execSync } from 'child_process';

console.log('Iniciando ejecución de seed local con entorno controlado...');
try {
  // Ejecutar prisma db seed pasando ALLOW_SEED=true
  execSync('npx prisma db seed', {
    stdio: 'inherit',
    env: {
      ...process.env,
      ALLOW_SEED: 'true',
    }
  });
} catch (error: any) {
  console.error('Error al ejecutar el seed local.');
}
