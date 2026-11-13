-- New uploads use one final object; legacy rows retain their original contract.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;
ALTER TABLE "SnipersUpload" ADD COLUMN "singleObject" boolean NOT NULL DEFAULT false;
ALTER TABLE "SnipersStorageObject" DROP CONSTRAINT "SnipersStorageObject_shape_check";
ALTER TABLE "SnipersStorageObject" ADD CONSTRAINT "SnipersStorageObject_shape_check" CHECK (
 octet_length(key) BETWEEN 1 AND 1024 AND key !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND left(key,1)<>'/' AND key !~ '[?#]'
 AND ((kind='TEMPORARY' AND key LIKE 'snipers/temporary/%' AND "writeOperation" IN ('NONE','CREATE_MULTIPART','COMPLETE_MULTIPART')) OR (kind='FINAL' AND key LIKE 'snipers/final/%' AND "writeOperation" IN ('NONE','PUT_FINAL','CREATE_MULTIPART','COMPLETE_MULTIPART')))
 AND "producerGeneration">0
 AND (("bytesVerifiedAt" IS NULL AND "verifiedSha256" IS NULL AND "verifiedSizeBytes" IS NULL AND "writeState"<>'BYTES_VERIFIED') OR ("bytesVerifiedAt" IS NOT NULL AND "verifiedSha256" IS NOT NULL AND "verifiedSha256" ~ '^[a-f0-9]{64}$' AND "verifiedSizeBytes" IS NOT NULL AND "verifiedSizeBytes">0 AND "writeState"='BYTES_VERIFIED'))
 AND ("activatedAt" IS NULL OR (kind='FINAL' AND "bytesVerifiedAt" IS NOT NULL AND "activatedAt">="bytesVerifiedAt"))
 AND (("retiredAt" IS NULL AND "cleanupAfter" IS NULL AND "nextProbeAt" IS NULL AND "lastProbeAt" IS NULL AND "lastAbsentAt" IS NULL AND "cleanupState"='PENDING') OR ("retiredAt" IS NOT NULL AND "cleanupAfter" IS NOT NULL AND "nextProbeAt" IS NOT NULL AND "cleanupAfter">="retiredAt" AND "nextProbeAt">="cleanupAfter"))
 AND ("lastAbsentAt" IS NULL OR ("lastProbeAt" IS NOT NULL AND "lastAbsentAt"<="lastProbeAt"))
 AND ("cleanupState"='PENDING' OR "lastAbsentAt" IS NOT NULL)
);
ALTER TABLE "SnipersFileJob" DROP CONSTRAINT "SnipersFileJob_shape_check";
ALTER TABLE "SnipersFileJob" ADD CONSTRAINT "SnipersFileJob_shape_check" CHECK (
 ((kind IN ('PREPARE_UPLOAD','PROCESS_UPLOAD') AND "uploadId" IS NOT NULL AND "storageObjectId" IS NULL) OR (kind='CLEAN_OBJECT' AND "uploadId" IS NULL AND "storageObjectId" IS NOT NULL))
 AND generation>=0 AND attempts>=0
 AND ((status='RUNNING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND generation>0) OR (status<>'RUNNING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL))
 AND ((status='SUCCEEDED' AND "completedGeneration" IS NOT NULL AND "completedGeneration"=generation AND generation>0) OR (status<>'SUCCEEDED' AND "completedGeneration" IS NULL))
 AND ("errorCode" IS NULL OR "errorCode" ~ '^[A-Z][A-Z0-9_]{0,63}$')
 AND (("executionId" IS NULL) = ("executionDeadlineAt" IS NULL))
 AND phase IN ('RESERVED','CREATE_MULTIPART','COMPLETE_MULTIPART','DOWNLOAD','ANALYZE','PUT_FINAL','VERIFY_FINAL','ACTIVATE','ABORT_MULTIPART','DELETE','PROBE')
 AND (phase='RESERVED' OR (kind='PREPARE_UPLOAD' AND phase='CREATE_MULTIPART') OR (kind='PROCESS_UPLOAD' AND phase IN ('CREATE_MULTIPART','COMPLETE_MULTIPART','DOWNLOAD','ANALYZE','PUT_FINAL','VERIFY_FINAL','ACTIVATE')) OR (kind='CLEAN_OBJECT' AND phase IN ('ABORT_MULTIPART','DELETE','PROBE')))
);

CREATE OR REPLACE FUNCTION snipers_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "SnipersFileJob"%ROWTYPE; o "SnipersStorageObject"%ROWTYPE; r "SnipersResource"%ROWTYPE; u "SnipersUpload"%ROWTYPE; n timestamptz; horizon timestamptz;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Snipers file history is permanent' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='SnipersResource' THEN
  -- Preserve the original RC pending fixture. All availability/relationship writes require SSI.
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'PENDING' OR NEW."finalObjectId" IS NOT NULL OR NEW."attachedAt" IS NOT NULL THEN PERFORM snipers_file_require_serializable(); END IF;
  ELSE
   IF ROW(OLD.id,OLD."classId",OLD.type,OLD."mimeType",OLD."sizeBytes",OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."classId",NEW.type,NEW."mimeType",NEW."sizeBytes",NEW."createdAt") THEN RAISE EXCEPTION 'Immutable resource identity' USING ERRCODE='23514'; END IF;
   IF ROW(OLD."deletionRequestedAt",OLD."deletionAfter") IS DISTINCT FROM ROW(NEW."deletionRequestedAt",NEW."deletionAfter") THEN PERFORM snipers_file_require_serializable(); END IF;
   IF OLD."deletionRequestedAt" IS NOT NULL AND ROW(OLD."deletionRequestedAt",OLD."deletionAfter") IS DISTINCT FROM ROW(NEW."deletionRequestedAt",NEW."deletionAfter") THEN RAISE EXCEPTION 'Deletion intent is immutable' USING ERRCODE='23514'; END IF;
   IF OLD.status='ARCHIVED' AND (to_jsonb(OLD)-ARRAY['updatedAt','deletionRequestedAt','deletionAfter','attachedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['updatedAt','deletionRequestedAt','deletionAfter','attachedAt']) THEN RAISE EXCEPTION 'Archived resource is terminal' USING ERRCODE='23514'; END IF;
   IF OLD.status='ARCHIVED' AND OLD."attachedAt" IS DISTINCT FROM NEW."attachedAt" AND NOT (OLD."deletionRequestedAt" IS NULL AND NEW."deletionRequestedAt" IS NOT NULL AND NEW."attachedAt" IS NULL) THEN RAISE EXCEPTION 'Archived resource cannot be linked' USING ERRCODE='23514'; END IF;
   IF OLD.status='REJECTED' AND NEW.status NOT IN ('REJECTED','ARCHIVED') THEN RAISE EXCEPTION 'Rejected resource cannot be verified' USING ERRCODE='23514'; END IF;
   IF OLD."verifiedAt" IS NOT NULL AND ROW(OLD.name,OLD."objectKey",OLD."finalObjectId",OLD.checksum,OLD."verifiedAt") IS DISTINCT FROM ROW(NEW.name,NEW."objectKey",NEW."finalObjectId",NEW.checksum,NEW."verifiedAt") THEN RAISE EXCEPTION 'Verified bytes are immutable' USING ERRCODE='23514'; END IF;
   IF ROW(OLD.status,OLD."finalObjectId",OLD."objectKey",OLD.checksum,OLD."attachedAt",OLD."verifiedAt",OLD."archivedAt") IS DISTINCT FROM ROW(NEW.status,NEW."finalObjectId",NEW."objectKey",NEW.checksum,NEW."attachedAt",NEW."verifiedAt",NEW."archivedAt") THEN PERFORM snipers_file_require_serializable(); END IF;
  END IF;
  RETURN NEW;
 END IF;
 PERFORM snipers_file_require_serializable();
 IF TG_TABLE_NAME='SnipersFileJob' THEN
  IF NEW.kind='PROCESS_UPLOAD' AND NEW.phase='CREATE_MULTIPART' AND NOT EXISTS(SELECT 1 FROM "SnipersUpload" WHERE id=NEW."uploadId" AND "singleObject") THEN RAISE EXCEPTION 'Legacy processing cannot create multipart' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'READY' OR NEW.generation<>0 OR NEW.attempts<>0 THEN RAISE EXCEPTION 'Jobs start unclaimed' USING ERRCODE='23514'; END IF;
  ELSE
   IF ROW(OLD.id,OLD."resourceId",OLD."uploadId",OLD."storageObjectId",OLD.kind,OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."resourceId",NEW."uploadId",NEW."storageObjectId",NEW.kind,NEW."createdAt") THEN RAISE EXCEPTION 'Immutable job identity' USING ERRCODE='23514'; END IF;
   IF OLD.kind<>'CLEAN_OBJECT' AND OLD.status IN ('SUCCEEDED','FAILED','CANCELLED') AND (to_jsonb(OLD)-'updatedAt') IS DISTINCT FROM (to_jsonb(NEW)-'updatedAt') THEN RAISE EXCEPTION 'Terminal producer job' USING ERRCODE='23514'; END IF;
   n:=clock_timestamp();
   IF NEW.generation<>OLD.generation THEN
    IF NEW.generation::bigint<>OLD.generation::bigint+1 OR NEW.status<>'RUNNING' OR NEW.attempts::bigint<>OLD.attempts::bigint+1 OR NEW."leaseToken" IS NOT DISTINCT FROM OLD."leaseToken" OR NEW."availableAt">n OR NOT (OLD.status IN ('READY','WAIT_RETRY') OR (OLD.status='RUNNING' AND OLD."leaseUntil"<=n)) THEN RAISE EXCEPTION 'Invalid generation claim' USING ERRCODE='23514'; END IF;
   ELSE
    IF NEW.attempts<>OLD.attempts OR (NEW.status='RUNNING' AND (OLD.status<>'RUNNING' OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken")) THEN RAISE EXCEPTION 'Invalid lease identity' USING ERRCODE='23514'; END IF;
    IF OLD.status='RUNNING' AND NEW.status<>'CANCELLED' AND OLD."leaseUntil"<=n THEN RAISE EXCEPTION 'Expired lease' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('SUCCEEDED','FAILED') AND OLD.status<>'RUNNING' THEN RAISE EXCEPTION 'Unclaimed completion' USING ERRCODE='23514'; END IF;
   END IF;
   -- Canonical caller order is object then job. The trigger also protects direct SQL.
   IF NEW.kind='CLEAN_OBJECT' AND NEW.status='RUNNING' THEN
    SELECT * INTO o FROM "SnipersStorageObject" WHERE id=NEW."storageObjectId" FOR UPDATE;
    IF o.id IS NULL OR o."retiredAt" IS NULL OR o."cleanupAfter">clock_timestamp() OR o."nextProbeAt">clock_timestamp() THEN RAISE EXCEPTION 'Cleanup destination is not due' USING ERRCODE='23514'; END IF;
   END IF;
   -- timestamptz(3) can round the requested upper bound up by half a millisecond.
   IF NEW.status='RUNNING' AND (NEW."leaseUntil"<=n OR NEW."leaseUntil">n+interval '60 seconds 1 millisecond') THEN RAISE EXCEPTION 'Invalid lease deadline' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='SnipersStorageObject' THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.id,OLD."resourceId",OLD.key,OLD.kind,OLD."producerJobId",OLD."producerGeneration",OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."resourceId",NEW.key,NEW.kind,NEW."producerJobId",NEW."producerGeneration",NEW."createdAt") THEN RAISE EXCEPTION 'Immutable object identity' USING ERRCODE='23514'; END IF;
   IF OLD."retiredAt" IS NOT NULL THEN
    IF OLD."retiredAt" IS DISTINCT FROM NEW."retiredAt" THEN RAISE EXCEPTION 'Retirement is irreversible' USING ERRCODE='23514'; END IF;
    SELECT * INTO r FROM "SnipersResource" WHERE id=NEW."resourceId";
    IF NEW."cleanupAfter" IS NULL OR (NEW."cleanupAfter"<OLD."cleanupAfter" AND (r."deletionRequestedAt" IS NULL OR NEW."cleanupAfter"<r."deletionAfter")) THEN RAISE EXCEPTION 'Retention cannot decrease without explicit deletion' USING ERRCODE='23514'; END IF;
    IF NEW."cleanupAfter">OLD."cleanupAfter" THEN
     SELECT * INTO r FROM "SnipersResource" WHERE id=NEW."resourceId";
     SELECT * INTO u FROM "SnipersUpload" WHERE "resourceId"=NEW."resourceId";
     horizon:=OLD."retiredAt";
     IF OLD."activatedAt" IS NOT NULL OR r.status='REJECTED' OR (u.status IN ('CANCELLED','FAILED') AND u."completionManifest" IS NOT NULL) THEN horizon:=horizon+interval '7 days';
     ELSIF OLD.kind='FINAL' OR u.status='SUCCEEDED' THEN horizon:=horizon+interval '24 hours'; END IF;
     IF OLD.kind='TEMPORARY' AND u."temporaryObjectId"=OLD.id AND u."lastPartUrlExpiresAt" IS NOT NULL THEN horizon:=greatest(horizon,u."lastPartUrlExpiresAt"+interval '2 seconds'); END IF;
     IF r."deletionRequestedAt" IS NOT NULL THEN horizon:=greatest(OLD."retiredAt",r."deletionAfter"); END IF;
     IF NEW."cleanupAfter">horizon THEN RAISE EXCEPTION 'Retention extension requires current policy justification' USING ERRCODE='23514'; END IF;
     NEW."nextProbeAt":=greatest(NEW."nextProbeAt",NEW."cleanupAfter");
     NEW."cleanupState":='PENDING';
     -- Cancel first: this also fences an expired lease without forging a completion.
     UPDATE "SnipersFileJob" SET status='CANCELLED',"leaseToken"=NULL,"leaseUntil"=NULL,"completedGeneration"=NULL,"executionId"=NULL,"executionDeadlineAt"=NULL
      WHERE "storageObjectId"=OLD.id AND kind='CLEAN_OBJECT' AND status='RUNNING';
     UPDATE "SnipersFileJob" SET status='WAIT_RETRY',"completedGeneration"=NULL,"availableAt"=greatest("availableAt",NEW."cleanupAfter"),phase='RESERVED',"errorCode"='RETENTION_EXTENDED',"executionId"=NULL,"executionDeadlineAt"=NULL
      WHERE "storageObjectId"=OLD.id AND kind='CLEAN_OBJECT';
    END IF;
   END IF;
   IF (OLD."bytesVerifiedAt" IS NOT NULL AND ROW(OLD."verifiedSha256",OLD."verifiedSizeBytes",OLD."bytesVerifiedAt") IS DISTINCT FROM ROW(NEW."verifiedSha256",NEW."verifiedSizeBytes",NEW."bytesVerifiedAt")) OR (OLD."activatedAt" IS NOT NULL AND OLD."activatedAt" IS DISTINCT FROM NEW."activatedAt") THEN RAISE EXCEPTION 'Immutable activated proof' USING ERRCODE='23514'; END IF;
   IF OLD."retiredAt" IS NOT NULL AND ROW(OLD."activatedAt",OLD."writeOperation",OLD."writeState",OLD."verifiedSha256",OLD."verifiedSizeBytes",OLD."bytesVerifiedAt") IS DISTINCT FROM ROW(NEW."activatedAt",NEW."writeOperation",NEW."writeState",NEW."verifiedSha256",NEW."verifiedSizeBytes",NEW."bytesVerifiedAt") THEN RAISE EXCEPTION 'Retired destination cannot be written or activated' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='INSERT' OR ROW(OLD."writeOperation",OLD."writeState",OLD."verifiedSha256",OLD."verifiedSizeBytes",OLD."bytesVerifiedAt",OLD."activatedAt") IS DISTINCT FROM ROW(NEW."writeOperation",NEW."writeState",NEW."verifiedSha256",NEW."verifiedSizeBytes",NEW."bytesVerifiedAt",NEW."activatedAt") THEN
   SELECT * INTO u FROM "SnipersUpload" WHERE "resourceId"=NEW."resourceId";
   IF u."singleObject" THEN
    IF NEW.kind<>'FINAL' THEN RAISE EXCEPTION 'Single upload cannot create temporary copies' USING ERRCODE='23514'; END IF;
    SELECT * INTO j FROM "SnipersFileJob" WHERE id=NEW."producerJobId" AND "uploadId"=u.id AND kind='PROCESS_UPLOAD';
   ELSE
    IF NEW.kind='FINAL' AND NEW."writeOperation" IN ('CREATE_MULTIPART','COMPLETE_MULTIPART') THEN RAISE EXCEPTION 'Legacy final is not multipart' USING ERRCODE='23514'; END IF;
   IF NEW.kind='TEMPORARY' AND NEW."writeOperation"='COMPLETE_MULTIPART' THEN SELECT * INTO j FROM "SnipersFileJob" WHERE "resourceId"=NEW."resourceId" AND kind='PROCESS_UPLOAD';
   ELSE SELECT * INTO j FROM "SnipersFileJob" WHERE id=NEW."producerJobId" AND generation=NEW."producerGeneration"; END IF;
   END IF;
   IF j.id IS NULL OR j.status<>'RUNNING' OR j."leaseUntil"<=clock_timestamp() OR NEW."retiredAt" IS NOT NULL THEN RAISE EXCEPTION 'Object writer has no current lease' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='SnipersUpload' AND TG_OP='UPDATE' THEN
  IF OLD."singleObject" IS DISTINCT FROM NEW."singleObject" THEN RAISE EXCEPTION 'Upload mode is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status AND NOT ((NEW."singleObject" AND OLD.status IN ('PREPARING','UPLOADING','COMPLETING','PROCESSING') AND NEW.status IN ('FAILED','CANCELLED','EXPIRED')) OR (OLD.status='PREPARING' AND NEW.status IN ('UPLOADING','CANCELLED','EXPIRED')) OR (OLD.status='UPLOADING' AND NEW.status IN ('COMPLETING','CANCELLED','EXPIRED')) OR (OLD.status='COMPLETING' AND NEW.status IN ('PROCESSING','CANCELLED','FAILED')) OR (OLD.status='PROCESSING' AND NEW.status IN ('SUCCEEDED','CANCELLED','FAILED'))) THEN RAISE EXCEPTION 'Invalid upload transition' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.id,OLD."resourceId",OLD."creatorId",OLD."expectedSha256",OLD."partSizeBytes",OLD."expiresAt",OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."resourceId",NEW."creatorId",NEW."expectedSha256",NEW."partSizeBytes",NEW."expiresAt",NEW."createdAt") THEN RAISE EXCEPTION 'Immutable upload identity' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('SUCCEEDED','CANCELLED','EXPIRED','FAILED') AND (to_jsonb(OLD)-'updatedAt') IS DISTINCT FROM (to_jsonb(NEW)-'updatedAt') THEN RAISE EXCEPTION 'Terminal upload' USING ERRCODE='23514'; END IF;
  IF OLD.status<>'PREPARING' AND ROW(OLD."temporaryObjectId",OLD."multipartUploadId") IS DISTINCT FROM ROW(NEW."temporaryObjectId",NEW."multipartUploadId") THEN RAISE EXCEPTION 'Immutable multipart identity' USING ERRCODE='23514'; END IF;
  IF OLD."completionManifest" IS NOT NULL AND ROW(OLD."completionManifest",OLD."manifestHash") IS DISTINCT FROM ROW(NEW."completionManifest",NEW."manifestHash") THEN RAISE EXCEPTION 'Immutable completion manifest' USING ERRCODE='23514'; END IF;
  IF OLD."lastPartUrlExpiresAt" IS NOT NULL AND (NEW."lastPartUrlExpiresAt" IS NULL OR NEW."lastPartUrlExpiresAt"<OLD."lastPartUrlExpiresAt") THEN RAISE EXCEPTION 'Signature horizon cannot decrease' USING ERRCODE='23514'; END IF;
  IF NEW."lastPartUrlExpiresAt" IS DISTINCT FROM OLD."lastPartUrlExpiresAt" AND (OLD.status<>'UPLOADING' OR NEW.status<>'UPLOADING') THEN RAISE EXCEPTION 'Signatures require open upload' USING ERRCODE='23514'; END IF;
  IF ROW(OLD."sourceSha256",OLD."sourceSizeBytes",OLD."formatCheckedAt",OLD."antivirusCheckedAt",OLD."signatureVersion",OLD."signaturePublishedAt",OLD."validationPolicyVersion",OLD."validationGeneration") IS DISTINCT FROM ROW(NEW."sourceSha256",NEW."sourceSizeBytes",NEW."formatCheckedAt",NEW."antivirusCheckedAt",NEW."signatureVersion",NEW."signaturePublishedAt",NEW."validationPolicyVersion",NEW."validationGeneration") THEN
   SELECT * INTO j FROM "SnipersFileJob" WHERE "uploadId"=NEW.id AND kind='PROCESS_UPLOAD';
   IF j.id IS NULL OR j.status<>'RUNNING' OR j.generation IS DISTINCT FROM NEW."validationGeneration" OR j."leaseUntil"<=clock_timestamp() THEN RAISE EXCEPTION 'Validation has no current generation' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='SnipersUpload' AND TG_OP='INSERT' THEN
  IF NEW.status<>'PREPARING' OR NEW."temporaryObjectId" IS NOT NULL OR NEW."completionManifest" IS NOT NULL OR NEW."sourceSha256" IS NOT NULL OR NEW."validationGeneration" IS NOT NULL THEN RAISE EXCEPTION 'Uploads start unprepared' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION snipers_file_check_resource(k text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "SnipersResource"%ROWTYPE; u "SnipersUpload"%ROWTYPE; p "SnipersFileJob"%ROWTYPE; o "SnipersStorageObject"%ROWTYPE; j "SnipersFileJob"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "SnipersResource" WHERE id=k;
 IF r.id IS NULL THEN RETURN; END IF;
 SELECT * INTO u FROM "SnipersUpload" WHERE "resourceId"=k;
 IF u.id IS NOT NULL THEN
  IF NOT u."singleObject" AND NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PREPARE_UPLOAD') THEN RAISE EXCEPTION 'Upload requires preparation job' USING ERRCODE='23514'; END IF;
  IF u.status IN ('PREPARING','UPLOADING','COMPLETING','PROCESSING') AND r.status<>'PENDING' THEN RAISE EXCEPTION 'Active upload requires pending resource' USING ERRCODE='23514'; END IF;
  IF u.status IN ('COMPLETING','PROCESSING','SUCCEEDED') AND NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PROCESS_UPLOAD') THEN RAISE EXCEPTION 'Completion requires processing job' USING ERRCODE='23514'; END IF;
  IF NOT u."singleObject" AND u.status IN ('UPLOADING','COMPLETING','PROCESSING','SUCCEEDED') AND NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PREPARE_UPLOAD' AND status='SUCCEEDED') THEN RAISE EXCEPTION 'Multipart preparation is unconfirmed' USING ERRCODE='23514'; END IF;
  IF u.status IN ('CANCELLED','EXPIRED','FAILED') AND (r.status NOT IN ('REJECTED','ARCHIVED') OR EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED'))) THEN RAISE EXCEPTION 'Terminal upload has live work' USING ERRCODE='23514'; END IF;
  IF u."completionManifest" IS NOT NULL THEN
   IF jsonb_typeof(u."completionManifest")<>'array' THEN RAISE EXCEPTION 'Invalid manifest' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(u."completionManifest")<>(r."sizeBytes"+8388607)/8388608 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(u."completionManifest") WITH ORDINALITY m(v,n)
    WHERE jsonb_typeof(v)<>'object' OR (v-'partNumber'-'etag')<>'{}'::jsonb OR NOT (v ?& ARRAY['partNumber','etag']) OR jsonb_typeof(v->'partNumber')<>'number' OR v->>'partNumber'<>n::text OR jsonb_typeof(v->'etag')<>'string' OR length(v->>'etag') NOT BETWEEN 1 AND 200 OR v->>'etag' ~ '[[:cntrl:]]'
   ) THEN RAISE EXCEPTION 'Invalid manifest parts' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF u."singleObject" THEN
  IF (SELECT count(*) FROM "SnipersStorageObject" WHERE "resourceId"=k)>1 OR EXISTS(SELECT 1 FROM "SnipersStorageObject" WHERE "resourceId"=k AND kind<>'FINAL') THEN RAISE EXCEPTION 'Single upload permits one object only' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PROCESS_UPLOAD') OR EXISTS(SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PREPARE_UPLOAD') THEN RAISE EXCEPTION 'Single upload requires one producer' USING ERRCODE='23514'; END IF;
  IF r."finalObjectId" IS NOT NULL AND (r."finalObjectId" IS DISTINCT FROM u."temporaryObjectId" OR u."validationPolicyVersion" IS DISTINCT FROM 2) THEN RAISE EXCEPTION 'Single object proof required' USING ERRCODE='23514'; END IF;
 END IF;
 IF r."finalObjectId" IS NOT NULL THEN
  SELECT * INTO o FROM "SnipersStorageObject" WHERE id=r."finalObjectId";
  SELECT * INTO p FROM "SnipersFileJob" WHERE id=o."producerJobId";
  IF u.id IS NULL OR u.status<>'SUCCEEDED' OR o.id IS NULL OR o.kind<>'FINAL' OR o."activatedAt" IS DISTINCT FROM r."verifiedAt" OR o."bytesVerifiedAt" IS NULL OR o."bytesVerifiedAt">r."verifiedAt"
   OR o."verifiedSizeBytes" IS DISTINCT FROM r."sizeBytes" OR o."verifiedSha256" IS DISTINCT FROM r.checksum OR o.key IS DISTINCT FROM r."objectKey"
   OR u."expectedSha256" IS DISTINCT FROM r.checksum OR u."sourceSha256" IS DISTINCT FROM r.checksum OR u."sourceSizeBytes" IS DISTINCT FROM r."sizeBytes"
   OR u."formatCheckedAt" IS NULL OR u."formatCheckedAt">r."verifiedAt"
   OR u."validationPolicyVersion" IS NULL OR u."validationPolicyVersion" NOT IN (1,2)
   OR (u."validationPolicyVersion"=1 AND (
     u."antivirusCheckedAt" IS NULL OR u."signatureVersion" IS NULL OR u."signaturePublishedAt" IS NULL
     OR u."antivirusCheckedAt">r."verifiedAt" OR u."signaturePublishedAt">u."antivirusCheckedAt"
     OR u."signaturePublishedAt"<r."verifiedAt"-interval '72 hours'))
   OR (u."validationPolicyVersion"=2 AND (
     u."antivirusCheckedAt" IS NOT NULL OR u."signatureVersion" IS NOT NULL OR u."signaturePublishedAt" IS NOT NULL))
   OR p.kind IS DISTINCT FROM 'PROCESS_UPLOAD'::"SnipersFileJobKind" OR p.status IS DISTINCT FROM 'SUCCEEDED'::"SnipersFileJobStatus" OR p."completedGeneration" IS DISTINCT FROM (CASE WHEN u."singleObject" THEN p.generation ELSE o."producerGeneration" END) OR u."validationGeneration" IS DISTINCT FROM (CASE WHEN u."singleObject" THEN p.generation ELSE o."producerGeneration" END)
   OR (r.status='VERIFIED' AND o."retiredAt" IS NOT NULL) OR (r.status='ARCHIVED' AND o."retiredAt" IS NULL)
  THEN RAISE EXCEPTION 'Incomplete or inconsistent final proof' USING ERRCODE='23514'; END IF;
 ELSIF u.status='SUCCEEDED' THEN RAISE EXCEPTION 'Successful upload has no final proof' USING ERRCODE='23514';
 END IF;
 FOR o IN SELECT * FROM "SnipersStorageObject" WHERE "resourceId"=k LOOP
  SELECT * INTO j FROM "SnipersFileJob" WHERE id=o."producerJobId";
  IF j.generation<o."producerGeneration" OR (o.kind='TEMPORARY' AND j.kind<>'PREPARE_UPLOAD') OR (o.kind='FINAL' AND j.kind<>'PROCESS_UPLOAD') THEN RAISE EXCEPTION 'Incorrect object producer' USING ERRCODE='23514'; END IF;
  IF o."activatedAt" IS NOT NULL AND r."finalObjectId" IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'Activated object must be selected' USING ERRCODE='23514'; END IF;
  IF u."temporaryObjectId"=o.id AND ((NOT u."singleObject" AND o.kind<>'TEMPORARY') OR (u."singleObject" AND o.kind<>'FINAL') OR (u.status IN ('PREPARING','UPLOADING','COMPLETING','PROCESSING') AND o."retiredAt" IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid current temporary object' USING ERRCODE='23514'; END IF;
  IF NOT u."singleObject" AND u.status='SUCCEEDED' AND u."temporaryObjectId"=o.id AND o."retiredAt" IS NULL THEN RAISE EXCEPTION 'Successful upload must retire temporary source' USING ERRCODE='23514'; END IF;
  IF u.status IN ('CANCELLED','EXPIRED','FAILED') AND o."retiredAt" IS NULL THEN RAISE EXCEPTION 'Terminal upload must retire candidates' USING ERRCODE='23514'; END IF;
  IF o."retiredAt" IS NOT NULL THEN
   IF r."deletionRequestedAt" IS NULL THEN
   IF o."activatedAt" IS NOT NULL OR r.status='REJECTED' OR (u.status IN ('CANCELLED','FAILED') AND u."completionManifest" IS NOT NULL) THEN
    IF o."cleanupAfter"<o."retiredAt"+interval '7 days' THEN RAISE EXCEPTION 'Seven day retention required' USING ERRCODE='23514'; END IF;
   ELSIF o.kind='FINAL' OR u.status='SUCCEEDED' THEN
    IF o."cleanupAfter"<o."retiredAt"+interval '24 hours' THEN RAISE EXCEPTION 'Candidate retention required' USING ERRCODE='23514'; END IF;
   END IF;
   ELSIF o."cleanupAfter"<r."deletionAfter" THEN RAISE EXCEPTION 'Deletion writer window is still open' USING ERRCODE='23514'; END IF;
   IF (o.kind='TEMPORARY' OR u."singleObject") AND u."temporaryObjectId"=o.id AND u."lastPartUrlExpiresAt" IS NOT NULL AND o."cleanupAfter"<u."lastPartUrlExpiresAt"+interval '2 seconds' THEN RAISE EXCEPTION 'Outstanding part signatures' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM "SnipersFileJob" job_row JOIN "SnipersStorageObject" object_row ON object_row.id=job_row."storageObjectId" WHERE job_row."resourceId"=k AND job_row.kind='CLEAN_OBJECT' AND object_row."retiredAt" IS NULL) THEN RAISE EXCEPTION 'Cleanup requires irreversible retirement' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION snipers_file_finalization_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u "SnipersUpload"%ROWTYPE; j "SnipersFileJob"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='SnipersUpload' THEN SELECT * INTO u FROM "SnipersUpload" WHERE id=NEW.id;
 ELSE SELECT * INTO u FROM "SnipersUpload" WHERE id=NEW."uploadId"; END IF;
 IF u.id IS NULL THEN RETURN NULL; END IF;
 FOR j IN SELECT * FROM "SnipersFileJob" WHERE "uploadId"=u.id LOOP
  IF j.kind='PREPARE_UPLOAD' AND j.status='SUCCEEDED' AND (u.status='PREPARING' OR u."temporaryObjectId" IS NULL) THEN RAISE EXCEPTION 'Preparation result must be acknowledged atomically' USING ERRCODE='23514'; END IF;
  IF j.kind='PROCESS_UPLOAD' THEN
   IF NOT u."singleObject" AND (u."completionManifest" IS NULL OR u.status IN ('PREPARING','UPLOADING','EXPIRED')) THEN RAISE EXCEPTION 'Processing requires sealed completion' USING ERRCODE='23514'; END IF;
   IF (j.status='SUCCEEDED') IS DISTINCT FROM (u.status='SUCCEEDED') THEN RAISE EXCEPTION 'Processing result must be finalized atomically' USING ERRCODE='23514'; END IF;
   IF j.status='FAILED' AND u.status<>'FAILED' THEN RAISE EXCEPTION 'Failed processing requires failed upload' USING ERRCODE='23514'; END IF;
  END IF;
  IF j.status='CANCELLED' AND u.status NOT IN ('CANCELLED','EXPIRED','FAILED') THEN RAISE EXCEPTION 'Cancelled producer has active upload' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
COMMIT;
