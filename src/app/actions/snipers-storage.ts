'use server';
import {snipersStorage} from '@/lib/snipers/storage-management-server';
import {respond} from '@/lib/snipers/action-result';

export async function discardSnipersResource(input:unknown){return respond(()=>snipersStorage.discard(input));}
export async function getSnipersStorageObjects(input:unknown){return respond(()=>snipersStorage.objects(input));}
export async function getSnipersResourceRetirement(input:unknown){return respond(()=>snipersStorage.retirement(input));}
export async function requestSnipersResourceRetirement(input:unknown){
  const result=await respond(()=>snipersStorage.retire(input));
  return !result.ok&&result.code==='INVALID_STATE'
    ?{...result,message:'El archivo no admite retiro en su estado actual. Consultá el estado para conocer el motivo.'}:result;
}
export async function cleanSnipersStorageObject(input:unknown){
  const result=await respond(()=>snipersStorage.clean(input));
  return !result.ok&&result.code==='INVALID_STATE'
    ?{...result,message:'El objeto no es elegible para limpieza. Actualizá el estado para consultar el motivo.'}:result;
}
