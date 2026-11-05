// MUTATING smoke: do not run until the operator explicitly authorizes PUT and DELETE.
// Exactly one new synthetic object; never lists objects or touches application resources.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { createR2Storage } from '../../src/lib/snipers/upload-storage';
import { inspectBytes } from '../../src/lib/snipers/file-validation';
import { privateTestConfig } from './check';

async function main(){
  const [file,ack,...extra]=process.argv.slice(2);
  if(!file||ack!=='--approve-test-object-write-delete'||extra.length)throw Error('EXPLICIT_OBJECT_WRITE_DELETE_APPROVAL_REQUIRED');
  const info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink())throw Error('PRIVATE_PROFILE_REQUIRED');
  const text=fs.readFileSync(file,'utf8');privateTestConfig(text);
  const storage=createR2Storage(parseEnv(text));
  const id=randomUUID(),key=`snipers/connectivity-check/${id}/probe.pdf`;
  const head='%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
  const bytes=Buffer.from(`${head}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${Buffer.byteLength(head)}\n%%EOF\n`);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'snipers-r2-probe-')),input=path.join(directory,'input.pdf');
  fs.writeFileSync(input,bytes,{flag:'wx',mode:0o600});
  let phase='PUT',uploaded=false,readVerified=false,deleteAcknowledged=false;
  console.log(`R2_TEST_OBJECT_KEY: ${key}`);
  try {
    await storage.putNew(key,input,bytes.length,'application/pdf',id,AbortSignal.timeout(15000));
    uploaded=true;
    console.log('R2_TEST_OBJECT_PUT_OK');
    phase='GET_SHA256';
    const readSignal=AbortSignal.timeout(15000);
    await inspectBytes(await storage.read(key,readSignal),{type:'PDF',mimeType:'application/pdf',sizeBytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex')},readSignal);
    readVerified=true;
    console.log(`R2_TEST_OBJECT_READ_OK: ${bytes.length} bytes; SHA-256 coincide.`);
    phase='DELETE';
    await storage.deleteObject(key,AbortSignal.timeout(15000));
    deleteAcknowledged=true;
    phase='VERIFY_ABSENCE';
    if(await storage.head(key,AbortSignal.timeout(15000)))throw Error('OBJECT_STILL_PRESENT');
    console.log('R2_TEST_OBJECT_DELETE_OK: HEAD confirma objeto ausente.');
  } catch(error) {
    // Stop on the FIRST error. No cleanup request, retry, listing or second object.
    const status=(error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
    console.error(JSON.stringify({result:'R2_TEST_OBJECT_STOPPED',key,phase,uploaded,readVerified,deleteAcknowledged,
      httpStatus:Number.isInteger(status)?status:null,absenceConfirmed:false}));
    throw error;
  } finally {
    fs.unlinkSync(input);fs.rmdirSync(directory);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/snipers-r2/object-probe.ts')){
  main().catch(()=>{console.error('R2_TEST_OBJECT_PROBE_FAILED: sin detalles sensibles; no repetir automáticamente.');process.exitCode=1;});
}
