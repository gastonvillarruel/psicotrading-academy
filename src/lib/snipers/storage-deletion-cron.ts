import {createHash,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import type {CleanupStorage} from './upload-storage';
import {processPendingDeletions} from './storage-deletions';

export function createDeletionCronHandler(pool:Pool,storage:()=>CleanupStorage,
  config:()=>{secret?:string;enabled?:string;snipers?:string}){
  return async(request:Request)=>{
    const headers={'Cache-Control':'no-store'};
    if(request.method!=='GET')return Response.json({ok:false},{status:405,headers});
    const c=config();
    if(!c.secret)return Response.json({ok:false},{status:503,headers});
    const hash=(v:string)=>createHash('sha256').update(v).digest();
    if(!timingSafeEqual(hash(request.headers.get('authorization')??''),hash(`Bearer ${c.secret}`)))
      return Response.json({ok:false},{status:401,headers});
    if(c.enabled!=='true'||c.snipers!=='true')return Response.json({ok:true,enabled:false},{headers});
    try{return Response.json({ok:true,...await processPendingDeletions(pool,storage)},{headers});}
    catch{return Response.json({ok:false},{status:503,headers});}
  };
}
