import type {PoolClient} from 'pg';
import {digest} from './preview';
import {resourceRetirementAuditSchema} from './resource-retirement-contracts';
import {resourceDiscardAuditSchema} from './storage-management-contracts';

// The same immutable byte/provenance proof is used for delivery and explicit retirement.
// The database additionally certifies the historical validation receipt and retention floors.
export const finalResourceIdentity=`FROM "SnipersResource" r
  JOIN "SnipersUpload" u ON u."resourceId"=r.id
  JOIN "SnipersStorageObject" o ON o.id=r."finalObjectId" AND o."resourceId"=r.id
  JOIN "SnipersFileJob" j ON j.id=o."producerJobId" AND j."resourceId"=r.id AND j."uploadId"=u.id
  WHERE r."verifiedAt" IS NOT NULL
  AND u.status='SUCCEEDED' AND o.kind='FINAL' AND o."writeState"='BYTES_VERIFIED'
  AND o."activatedAt"=r."verifiedAt" AND o."bytesVerifiedAt" IS NOT NULL
  AND o.key=r."objectKey" AND o."verifiedSha256"=r.checksum AND o."verifiedSizeBytes"=r."sizeBytes"
  AND j.kind='PROCESS_UPLOAD' AND j.status='SUCCEEDED' AND j."completedGeneration"=o."producerGeneration"
  AND j.generation=o."producerGeneration" AND u."validationGeneration"=o."producerGeneration"`;

// Only a strictly validated, durable administrative intent can release the resource's
// own historical reference. Archiving/detaching alone never grants this authority.
export async function hasResourceRetirement(tx:PoolClient,resourceId:string,objectId?:string):Promise<boolean>{
  const r=(await tx.query(`SELECT r."finalObjectId",o."retiredAt" ${finalResourceIdentity}
    AND r.id=$1 AND r.status='ARCHIVED' AND r."attachedAt" IS NULL
    AND r."archivedAt"=o."retiredAt" AND o."retiredAt" IS NOT NULL
    AND o."retiredAt">=o."activatedAt"
    AND o."cleanupAfter">=o."retiredAt"+interval '7 days'
    AND ($2::text IS NULL OR o.id=$2)`,[resourceId,objectId??null])).rows[0];
  if(!r)return false;
  const events=(await tx.query(`SELECT id,"actorUserId",payload FROM "SnipersAuditEvent"
    WHERE action='FILE_FOUNDATION_CHANGED' AND "entityType"='SnipersResource' AND "entityId"=$1
    AND ((payload->>'formatVersion'='5' AND payload->'result'->>'kind'='RESOURCE_RETIREMENT_REQUEST')
      OR (payload->>'formatVersion'='6' AND payload->'result'->>'kind'='ADMIN_RESOURCE_DISCARD'))`,[resourceId])).rows;
  return events.some(a=>{
    const p=a.payload?.formatVersion===6?resourceDiscardAuditSchema.safeParse(a.payload):resourceRetirementAuditSchema.safeParse(a.payload);
    if(!p.success||!a.actorUserId)return false;
    const v=p.data.result;
    return v.operationId===a.id&&v.resourceId===resourceId&&v.finalObjectId===r.finalObjectId
      &&v.requestedAt===r.retiredAt.toISOString()
      &&p.data.commandHash===digest({kind:v.kind,operationId:v.operationId,resourceId});
  });
}

// Candidate selection is deliberately broader than authority. Every candidate is
// validated above again under aggregate locks before scheduling/claim/remote I/O.
export const retirementCandidate=`EXISTS(SELECT 1 FROM "SnipersAuditEvent" a
  WHERE a.action='FILE_FOUNDATION_CHANGED' AND a."entityType"='SnipersResource'
  AND a."entityId"=o."resourceId"
  AND ((a.payload->>'formatVersion'='5' AND a.payload->'result'->>'kind'='RESOURCE_RETIREMENT_REQUEST')
    OR (a.payload->>'formatVersion'='6' AND a.payload->'result'->>'kind'='ADMIN_RESOURCE_DISCARD'))
  AND a.payload->'result'->>'finalObjectId'=o.id)`;
