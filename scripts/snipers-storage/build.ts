// Local verification only: snapshot source without private profiles/evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv} from '../phase0/local';

const profile=localProfile();verifyDatabase(profile);
const root=process.cwd(),directory=path.resolve('.local/snipers/storage-management');
const snapshot=path.join(directory,`app-${Date.now()}`);
fs.mkdirSync(snapshot,{recursive:true});
for(const name of ['src','public'])fs.cpSync(path.join(root,name),path.join(snapshot,name),{recursive:true});
for(const name of ['package.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts'])
  fs.copyFileSync(path.join(root,name),path.join(snapshot,name));
fs.symlinkSync(path.join(root,'node_modules'),path.join(snapshot,'node_modules'),'junction');
const sourceFiles=['src/lib/snipers/storage-cleanup.ts','src/lib/snipers/storage-management.ts',
  'src/lib/snipers/storage-management-contracts.ts','src/lib/snipers/storage-management-gateway.ts',
  'src/lib/snipers/storage-management-server.ts','src/app/actions/snipers-storage.ts',
  'src/app/mi-campus/snipers/gestion/archivos/page.tsx','src/components/snipers/StorageManagement.tsx',
  'src/app/mi-campus/snipers/layout.tsx'];
const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(path.join(snapshot,file))]));
const env:NodeJS.ProcessEnv={...isolatedEnv(profile),NODE_ENV:'production',SNIPERS_PHASE3A_LOCAL:'1',NEXT_TELEMETRY_DISABLED:'1',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.resolve('scripts/phase3a/font-responses.cjs'),
  SNIPERS_NETWORK_TRACE:path.join(directory,'build-network.jsonl'),
  NODE_OPTIONS:`--require "${path.resolve('scripts/phase3a/network-guard.cjs').replaceAll('\\','/')}"`};
const log=fs.openSync(path.join(directory,'build.log'),'w');
const result=spawnSync(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'build','--webpack'],{
  cwd:snapshot,env,stdio:['ignore',log,log],windowsHide:true,timeout:600000});
fs.closeSync(log);
const sourceUnchanged=sourceFiles.every(file=>hash(file)===sourceHashes[file]);
const evidence={passed:result.status===0&&!result.error&&sourceUnchanged,exitCode:result.status,snapshot,sourceHashes,sourceUnchanged,
  isolatedSourceCopy:true,realR2:false,productionMutated:false};
fs.writeFileSync(path.join(directory,'build-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({passed:evidence.passed,sourceUnchanged,isolatedSourceCopy:true}));
process.exitCode=evidence.passed?0:1;
