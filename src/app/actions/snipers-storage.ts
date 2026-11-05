'use server';
import {snipersStorage} from '@/lib/snipers/storage-management-server';
import {respond} from '@/lib/snipers/action-result';

export async function getSnipersStorageObjects(input:unknown){return respond(()=>snipersStorage.objects(input));}
export async function cleanSnipersStorageObject(input:unknown){
  const result=await respond(()=>snipersStorage.clean(input));
  return !result.ok&&result.code==='INVALID_STATE'
    ?{...result,message:'El objeto no es elegible para limpieza. Actualizá el estado para consultar el motivo.'}:result;
}
