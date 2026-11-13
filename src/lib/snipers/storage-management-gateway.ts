import type {Pool} from 'pg';
import {actorFromSession} from './session';
import {previewKey} from './preview';
import {reject} from './errors';
import type {CleanupStorage} from './upload-storage';
import {listStorageResources,getStorageObjects,cleanStorageObject} from './storage-management';
import {discardResource} from './resource-discard';
import {getResourceRetirement,requestResourceRetirement} from './resource-retirement';

export function createStorageManagementGateway(pool:Pool,session:()=>Promise<Parameters<typeof actorFromSession>[0]>,
  config:()=>{enabled?:string;singleSession?:string;secret?:string},storage:()=>CleanupStorage){
  async function actor(){
    const c=config();
    if(c.enabled!=='true')reject('DISABLED','Snipers deshabilitado.');
    previewKey(c.secret);
    return actorFromSession(await session(),c.singleSession);
  }
  return {
    async discard(input:unknown){return discardResource(pool,await actor(),input,storage);},
    async list(input:unknown){return listStorageResources(pool,await actor(),input);},
    async objects(input:unknown){return getStorageObjects(pool,await actor(),input);},
    async clean(input:unknown){return cleanStorageObject(pool,await actor(),input,storage);},
    async retirement(input:unknown){return getResourceRetirement(pool,await actor(),input);},
    async retire(input:unknown){return requestResourceRetirement(pool,await actor(),input,storage);},
  };
}
