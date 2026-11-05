// Local developer launcher only. Does not import isolatedEnv (which reads .env*).
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { localProfile, verifyDatabase } from '../phase1/guard';
import { privateTestConfig } from './check';

export async function localR2Environment(file: string): Promise<NodeJS.ProcessEnv> {
  const local=localProfile();verifyDatabase(local);
  if(local.SNIPERS_ENABLED!=='false')throw Error('LOCAL_PERSISTENT_FLAG_MUST_REMAIN_FALSE');
  const info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink())throw Error('LOCAL_R2_PROFILE_INVALID');
  const text=fs.readFileSync(file,'utf8'),r2=privateTestConfig(text);
  const pool=new Pool({connectionString:local.DATABASE_URL,max:1,connectionTimeoutMillis:5000,
    options:'-c default_transaction_read_only=on -c statement_timeout=5000'});
  try {
    const actual=(await pool.query(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='snipers_file_check_resource'`)).rows[0]?.prosrc as string|undefined;
    const sql=fs.readFileSync('prisma/migrations/20261101000000_snipers_basic_files/migration.sql','utf8');
    const start=sql.indexOf('AS $$')+5,expected=sql.slice(start,sql.indexOf('$$;',start));
    const normalize=(s:string)=>s.replace(/\r\n/g,'\n').trim();
    if(!actual||normalize(actual)!==normalize(expected))throw Error('LOCAL_BASIC_POLICY_2_REQUIRED');
  } finally {await pool.end();}
  // Start from OS essentials, not the parent environment or the exposed .env.
  const env:NodeJS.ProcessEnv={NODE_ENV:'development'};
  for(const name of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,parseEnv(text),{
    DATABASE_URL:local.DATABASE_URL,DIRECT_URL:local.DATABASE_URL,
    NEXTAUTH_SECRET:randomBytes(32).toString('hex'),ENABLE_SINGLE_SESSION:'true',
    NEXTAUTH_URL:'http://localhost:3000',NEXT_PUBLIC_APP_URL:'http://localhost:3000',
    SNIPERS_ENABLED:'true',SNIPERS_UPLOAD_PROCESSOR_ENABLED:'false',SNIPERS_FILE_VALIDATION_ENABLED:'false',SNIPERS_STORAGE_CLEANUP_ENABLED:'false',
    PAYPAL_ENABLED:'false',PAYPAL_ENV:'sandbox',NOWPAYMENTS_ENV:'sandbox',NEXT_TELEMETRY_DISABLED:'1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.resolve('scripts/phase3a/font-responses.cjs'),
    SNIPERS_R2_LOCAL_PROCESS:'1',SNIPERS_R2_LOCAL_HOST:new URL(r2.endpoint).hostname,
    NODE_OPTIONS:`--require "${path.resolve('scripts/snipers-r2/local-runtime.cjs').replaceAll('\\','/')}"`,
  });
  return env;
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length<1||args.length>2||(args[1]&&args[1]!=='--check'))throw Error('LOCAL_R2_USAGE');
  const env=await localR2Environment(path.resolve(args[0]));
  if(args[1]==='--check'){console.log('LOCAL_R2_READY: snipers_dev; bucket de prueba; política 2; bandera true sólo en el proceso hijo. No se inició Next.');return;}
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3000'],{
    cwd:process.cwd(),env,stdio:'ignore',windowsHide:true,
  });
  console.log('LOCAL_R2_STARTING: http://localhost:3000; sin logs de Next ni carga automática de .env.');
  child.on('error',()=>{console.error('LOCAL_R2_START_FAILED');process.exitCode=1;});
  child.on('exit',code=>{console.log('LOCAL_R2_STOPPED');process.exitCode=code??1;});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/snipers-r2/local.ts')){
  main().catch(()=>{console.error('LOCAL_R2_CHECK_FAILED: revisar perfil privado, instancia local y política 2; sin detalles sensibles.');process.exitCode=1;});
}
