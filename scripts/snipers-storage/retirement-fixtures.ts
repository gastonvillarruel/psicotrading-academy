import type {Pool} from 'pg';
import type {Actor} from '../../src/lib/snipers/permissions';
import {transaction} from '../../src/lib/snipers/permissions';
import {digest} from '../../src/lib/snipers/preview';
import {resourceRetirementAuditSchema} from '../../src/lib/snipers/resource-retirement-contracts';
import {verified} from '../phase3b2d/fixtures';
import {CleanupDouble,op} from './fixtures';

// Test-only historical seed. Set initial proof/retention timestamps before they
// become immutable, through the real validator and all current SQL constraints.
// This is not a production clock option and never decreases persisted deadlines.
export async function historicalRetirement(pool:Pool,actor:Actor,{intent=true,type='PDF' as 'MP3'|'PDF'}={}){
  const historical={query:pool.query.bind(pool),async connect(){
    const client=await pool.connect();
    return {release:()=>client.release(),query:(sql:string,args?:unknown[])=>{
      if(sql.includes('"sourceSha256"=$2,"sourceSizeBytes"=$3')){
        args=[...args!];args[4]=new Date((args[4] as Date).getTime()-10*86400000);
      }
      if(sql.includes('"activatedAt"=statement_timestamp()')||sql.includes('"retiredAt"=coalesce("retiredAt",statement_timestamp()')||sql.includes('"formatCheckedAt"=statement_timestamp()'))
        sql=sql.replaceAll('statement_timestamp()',"(statement_timestamp()-interval '10 days')");
      return client.query(sql,args);
    }};
  }} as unknown as Pool;
  const storage=new CleanupDouble(),f={...await verified(historical,actor,type,storage),storage};
  const row=(await pool.query(`SELECT o.id,o.key,o."activatedAt" FROM "SnipersStorageObject" o WHERE o."resourceId"=$1 AND o.kind='FINAL'`,[f.resourceId])).rows[0];
  storage.uploadIds.set(row.key,f.uploadId);
  const operationId=op(),requestedAt=new Date(row.activatedAt.getTime()+86400000);
  await transaction(pool,async tx=>{
    await tx.query(`UPDATE "SnipersResource" SET status='ARCHIVED',"archivedAt"=$2 WHERE id=$1`,[f.resourceId,requestedAt]);
    await tx.query(`UPDATE "SnipersStorageObject" SET "retiredAt"=$2,"cleanupAfter"=$2::timestamptz+interval '7 days',
      "nextProbeAt"=$2::timestamptz+interval '7 days' WHERE id=$1`,[row.id,requestedAt]);
    if(intent){
      const result={kind:'RESOURCE_RETIREMENT_REQUEST' as const,operationId,resourceId:f.resourceId,finalObjectId:row.id,
        requestedAt:requestedAt.toISOString(),cleanupObjectId:null,cleanupOperationId:null};
      const payload=resourceRetirementAuditSchema.parse({formatVersion:5,
        commandHash:digest({kind:result.kind,operationId,resourceId:f.resourceId}),result});
      await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,'FILE_FOUNDATION_CHANGED','SnipersResource',$3,$4::jsonb)`,[operationId,actor.userId,f.resourceId,JSON.stringify(payload)]);
    }
  });
  storage.calls=[];
  return {...f,finalObjectId:row.id as string,finalKey:row.key as string,operationId};
}
