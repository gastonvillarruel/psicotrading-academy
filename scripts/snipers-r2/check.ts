// Explicit private-file input only. Never imports dotenv, Next, database or local profiles.
// Default: offline validation. --head: one read-only request to the pinned test bucket.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { r2TestConfig } from '../../src/lib/snipers/upload-storage';

const keys = ['SNIPERS_ENVIRONMENT','SNIPERS_R2_ENVIRONMENT','SNIPERS_R2_TEST_ACCOUNT_ID',
  'SNIPERS_R2_TEST_BUCKET','SNIPERS_R2_TEST_ACCESS_KEY_ID','SNIPERS_R2_TEST_SECRET_ACCESS_KEY'];

export function privateTestConfig(text: string) {
  const env = parseEnv(text);
  if (Object.keys(env).some(key => !keys.includes(key)) || keys.some(key => !env[key] || env[key].trim() !== env[key])
    || env.SNIPERS_ENVIRONMENT !== 'local' || env.SNIPERS_R2_ENVIRONMENT !== 'test'
    || env.SNIPERS_R2_TEST_BUCKET !== 'snipers-test-psicoemotrading') {
    throw new Error('R2_TEST_PROFILE_INVALID');
  }
  // Pass ONLY this file, never ambient process.env or another credential source.
  return r2TestConfig(env);
}

export async function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 2 || args[0].startsWith('--') || (args.length === 2 && args[1] !== '--head')) {
    throw new Error('R2_TEST_USAGE');
  }
  const file = path.resolve(args[0]);
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('R2_TEST_PROFILE_INVALID');
  const config = privateTestConfig(fs.readFileSync(file,'utf8'));
  if (args[1] !== '--head') {
    console.log('R2_TEST_CONFIG_OK: validación local; ninguna conexión realizada.');
    return;
  }
  const client = new S3Client({ region:'auto', endpoint:config.endpoint, credentials:config.credentials,
    forcePathStyle:true, maxAttempts:1,
    requestHandler:{connectionTimeout:5000,requestTimeout:10000,throwOnRequestTimeout:true} });
  try {
    await client.send(new HeadBucketCommand({Bucket:config.bucket}),{abortSignal:AbortSignal.timeout(10000)});
    console.log('R2_TEST_HEAD_OK: acceso al bucket de prueba confirmado; sin cambios en objetos.');
  } finally { client.destroy(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-r2/check.ts')) {
  main().catch(() => {
    // Never print SDK error objects, headers, URLs, file contents or credential values.
    console.error('R2_TEST_CHECK_FAILED: revisá ruta, perfil privado, permisos S3 y conectividad. No se muestran detalles sensibles.');
    process.exitCode = 1;
  });
}
