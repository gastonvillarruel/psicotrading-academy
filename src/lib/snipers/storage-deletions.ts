// Bounded request/cron entry point; durable CLEAN_OBJECT jobs own all remote retries.
import type {Pool} from 'pg';
import type {CleanupStorage} from './upload-storage';
import {maintainStorageOnce,processCleanupOnce} from './storage-cleanup';

export async function processPendingDeletions(pool:Pool,storage:()=>CleanupStorage,
  {resourceIds,limit=20,budgetMs=45000}:{resourceIds?:string[];limit?:number;budgetMs?:number}={}){
  if(!Number.isInteger(limit)||limit<1||limit>20||budgetMs<1||budgetMs>45000)throw Error('Invalid cleanup bounds');
  const singleton=await pool.connect(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),budgetMs);let acquired=false,processed=0;
  const disconnected=()=>controller.abort();singleton.on('error',disconnected);
  try{
    acquired=(await singleton.query('SELECT pg_try_advisory_lock(1397639505) AS acquired')).rows[0].acquired;
    if(!acquired)return {busy:true,processed};
    // Automatic visits exclude historical inventory awaiting separate reconciliation.
    if(!resourceIds)for(let i=0;i<limit&&!controller.signal.aborted;i++)if(!await maintainStorageOnce(pool,undefined,undefined,true))break;
    const targets=(await pool.query(`SELECT j."storageObjectId" AS id FROM "SnipersFileJob" j
      WHERE j.kind='CLEAN_OBJECT' AND ($1::text[] IS NULL OR j."resourceId"=ANY($1))
      AND ($1::text[] IS NOT NULL OR EXISTS (
        SELECT 1 FROM "SnipersResource" r JOIN "SnipersUpload" u ON u."resourceId"=r.id
        WHERE r.id=j."resourceId" AND (u."singleObject" OR r."deletionRequestedAt" IS NOT NULL)))
      AND j."availableAt"<=clock_timestamp() AND (j.status IN ('READY','WAIT_RETRY') OR (j.status='RUNNING' AND j."leaseUntil"<=clock_timestamp()))
      ORDER BY j."availableAt",j.id LIMIT $2`,[resourceIds??null,limit])).rows;
    if(!targets.length)return {busy:false,processed};
    const adapter=storage();
    for(const target of targets){
      if(controller.signal.aborted)break;
      if(await processCleanupOnce(pool,adapter,controller.signal,target.id))processed++;
    }
    return {busy:false,processed};
  }finally{
    clearTimeout(timer);controller.abort();singleton.off('error',disconnected);
    try{if(acquired)await singleton.query('SELECT pg_advisory_unlock(1397639505)');}finally{singleton.release();}
  }
}
