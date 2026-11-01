// Reuse closed suites without editing their historical HEAD-pinned launchers.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isolatedEnv, readProfile, npmBackup, profilePath } from '../phase0/local';
import { verifyDatabase } from '../phase1/guard';
import { privateDirectory } from './database';

const profile = readProfile(); verifyDatabase(profile);
const directory = path.resolve('.local/snipers/launch-a'); privateDirectory(directory);
const backup = npmBackup(profilePath);
const prefix = path.join(directory, `regression-${Date.now()}`);
const env: NodeJS.ProcessEnv = { ...isolatedEnv(profile), SNIPERS_PHASE1_LOCAL:'1', SNIPERS_PHASE2_LOCAL:'1', SNIPERS_PHASE3A_LOCAL:'1',
  SNIPERS_PHASE3B1_LOCAL:'1', SNIPERS_PHASE3B2A_LOCAL:'1', SNIPERS_PHASE3B2B_LOCAL:'1', SNIPERS_PHASE3B2C_LOCAL:'1',
  SNIPERS_PHASE3B2D_LOCAL:'1', SNIPERS_PHASE3B2E_LOCAL:'1', SNIPERS_STORAGE_CLEANUP_ENABLED:'false',
  SNIPERS_UPLOAD_PROCESSOR_ENABLED:'false', SNIPERS_FILE_VALIDATION_ENABLED:'false',
  SNIPERS_NETWORK_TRACE:prefix+'-network.jsonl', NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replace(/\\/g,'/')}"` };
const suites = ['scripts/phase0/phase0.test.ts','scripts/phase1/isolation.test.ts','scripts/phase1/integration.test.ts',
  'scripts/phase2/unit.test.ts','scripts/phase2/integration.test.ts','scripts/phase3a/unit.test.ts',
  'scripts/phase3a/actions.test.cjs','scripts/phase3a/corrections.test.cjs',
  'scripts/phase3b1/unit.test.ts','scripts/phase3b1/integration.test.ts','scripts/phase3b1/actions.test.cjs',
  'scripts/phase3b2a/contracts.test.ts','scripts/phase3b2a/integration.test.ts','scripts/phase3b2b/integration.test.ts',
  'scripts/phase3b2b/actions.test.cjs','scripts/phase3b2c/validation.test.ts','scripts/phase3b2c/integration.test.ts',
  'scripts/phase3b2c/storage.test.ts','scripts/phase3b2d/integration.test.ts','scripts/phase3b2d/storage.test.ts',
  'scripts/phase3b2d/actions.test.cjs','scripts/phase3b2e/integration.test.ts','scripts/phase3b2e/storage.test.ts'];
const log=fs.openSync(prefix+'.log','wx',0o600);
// Native runner also bounds a historical test whose own cleanup might wait indefinitely.
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1','--test-timeout=180000',...suites],
  {env,stdio:['ignore',log,log],windowsHide:true,timeout:900000});fs.closeSync(log);
const evidence={passed:result.status===0&&!result.error,exitCode:result.status,error:result.error?.message,suites,backup,persistentFlag:profile.SNIPERS_ENABLED,
  realR2Validated:false,realLinuxValidated:false,log:prefix+'.log'};
fs.writeFileSync(prefix+'.json',JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify(evidence));process.exitCode=evidence.passed?0:1;
