// Local verification only: snapshot source without private profiles/evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {localProfile,verifyDatabase} from '../phase1/guard';
import {isolatedEnv} from '../phase0/local';

const profile=localProfile();verifyDatabase(profile);
const root=process.cwd(),sourceRoot=path.resolve(process.argv[2]??root),directory=path.resolve('.local/snipers/integration-validation/storage-management');
const snapshot=path.join(directory,`app-${Date.now()}`);
fs.mkdirSync(snapshot,{recursive:true});
for(const name of ['src','public'])fs.cpSync(path.join(sourceRoot,name),path.join(snapshot,name),{recursive:true});
for(const name of ['package.json','tsconfig.json','next.config.ts','postcss.config.mjs'])
  fs.copyFileSync(path.join(sourceRoot,name),path.join(snapshot,name));
fs.symlinkSync(path.join(root,'node_modules'),path.join(snapshot,'node_modules'),'junction');
const sourceFiles=['src/lib/snipers/storage-cleanup.ts','src/lib/snipers/storage-management.ts',
  'src/lib/snipers/storage-management-contracts.ts','src/lib/snipers/storage-management-gateway.ts',
  'src/lib/snipers/storage-management-server.ts','src/app/actions/snipers-storage.ts',
  'src/app/mi-campus/snipers/gestion/archivos/page.tsx','src/components/snipers/StorageManagement.tsx',
  'src/lib/snipers/resource-discard.ts','src/lib/snipers/resource-retirement-proof.ts',
  'src/lib/snipers/resource-retirement.ts','src/lib/snipers/content.ts',
  'src/components/snipers/DiscardResourceButton.tsx','src/components/snipers/ClassEditor.tsx',
  'src/app/mi-campus/snipers/gestion/contenido/clases/[id]/page.tsx',
  'src/app/mi-campus/snipers/layout.tsx','src/lib/snipers/storage-deletions.ts',
  'src/lib/snipers/storage-deletion-cron.ts','src/app/api/snipers/storage-cleanup/route.ts',
  'src/lib/snipers/content-contracts.ts','src/lib/snipers/gateway.ts','src/lib/snipers/server.ts',
  'src/lib/snipers/resource-retirement-contracts.ts',
  'src/lib/snipers/single-object-upload.ts','src/lib/snipers/uploads.ts','src/lib/snipers/upload-processor.ts',
  'src/lib/snipers/basic-upload-processor.ts','src/lib/snipers/upload-server.ts','src/lib/snipers/upload-storage.ts',
  'src/lib/snipers/upload-gateway.ts','src/lib/snipers/upload-contracts.ts','src/components/snipers/PrivateUploads.tsx'];
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
const sourceUnchanged=sourceFiles.every(file=>hash(path.join(sourceRoot,file))===sourceHashes[file]);
const evidence={passed:result.status===0&&!result.error&&sourceUnchanged,exitCode:result.status,snapshot,sourceHashes,sourceUnchanged,
  isolatedSourceCopy:true,realR2:false,productionMutated:false};
fs.writeFileSync(path.join(directory,'build-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({passed:evidence.passed,sourceUnchanged,isolatedSourceCopy:true}));
process.exitCode=evidence.passed?0:1;
