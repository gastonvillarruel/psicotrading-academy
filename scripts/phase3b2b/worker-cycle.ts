// Shared by the existing executor and focused tests. No connections or side effects.
export type WorkerMode={uploads:boolean;validation:boolean;cleanup:boolean};
export function workerMode(env:Readonly<Record<string,string|undefined>>):WorkerMode{
  const mode=env.SNIPERS_PROCESSOR_MODE??'uploads';
  if(!['uploads','cleanup'].includes(mode))throw new Error('Modo de procesador inválido.');
  const cleanup=env.SNIPERS_STORAGE_CLEANUP_ENABLED==='true';
  if(mode==='cleanup'){
    if(!cleanup)throw new Error('Limpieza deshabilitada.');
    return {uploads:false,validation:false,cleanup:true};
  }
  if(env.SNIPERS_UPLOAD_PROCESSOR_ENABLED!=='true')throw new Error('Procesador deshabilitado.');
  return {uploads:true,validation:env.SNIPERS_FILE_VALIDATION_ENABLED==='true',cleanup};
}
type Work={transfer:()=>Promise<boolean>;validate:()=>Promise<boolean>;maintain:()=>Promise<boolean>;
  clean:()=>Promise<boolean>;stopped:()=>boolean};
export async function runWorkerCycle(mode:WorkerMode,work:Work,maintenanceDue:boolean){
  const transferred=mode.uploads&&!work.stopped()?await work.transfer():false;
  const validated=mode.validation&&!work.stopped()?await work.validate():false;
  const maintained=mode.cleanup&&maintenanceDue&&!work.stopped()?await work.maintain():false;
  const cleaned=mode.cleanup&&!work.stopped()?await work.clean():false;
  return {transferred,validated,maintained,cleaned};
}
