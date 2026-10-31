-- LOCAL ONLY. Enforce cleanup eligibility under the destination lock; append-only fix.
BEGIN;
DO $local_only$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
   RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY: destination rejected';
 END IF;
END $local_only$;
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
   IF OLD.status='ARCHIVED' AND (to_jsonb(OLD)-'updatedAt') IS DISTINCT FROM (to_jsonb(NEW)-'updatedAt') THEN RAISE EXCEPTION 'Archived resource is terminal' USING ERRCODE='23514'; END IF;
   IF OLD.status='REJECTED' AND NEW.status NOT IN ('REJECTED','ARCHIVED') THEN RAISE EXCEPTION 'Rejected resource cannot be verified' USING ERRCODE='23514'; END IF;
   IF OLD."verifiedAt" IS NOT NULL AND ROW(OLD.name,OLD."objectKey",OLD."finalObjectId",OLD.checksum,OLD."verifiedAt") IS DISTINCT FROM ROW(NEW.name,NEW."objectKey",NEW."finalObjectId",NEW.checksum,NEW."verifiedAt") THEN RAISE EXCEPTION 'Verified bytes are immutable' USING ERRCODE='23514'; END IF;
   IF ROW(OLD.status,OLD."finalObjectId",OLD."objectKey",OLD.checksum,OLD."attachedAt",OLD."verifiedAt",OLD."archivedAt") IS DISTINCT FROM ROW(NEW.status,NEW."finalObjectId",NEW."objectKey",NEW.checksum,NEW."attachedAt",NEW."verifiedAt",NEW."archivedAt") THEN PERFORM snipers_file_require_serializable(); END IF;
  END IF;
  RETURN NEW;
 END IF;
 PERFORM snipers_file_require_serializable();
 IF TG_TABLE_NAME='SnipersFileJob' THEN
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
    IF NEW."cleanupAfter" IS NULL OR NEW."cleanupAfter"<OLD."cleanupAfter" THEN RAISE EXCEPTION 'Retention cannot decrease' USING ERRCODE='23514'; END IF;
    IF NEW."cleanupAfter">OLD."cleanupAfter" THEN
     SELECT * INTO r FROM "SnipersResource" WHERE id=NEW."resourceId";
     SELECT * INTO u FROM "SnipersUpload" WHERE "resourceId"=NEW."resourceId";
     horizon:=OLD."retiredAt";
     IF OLD."activatedAt" IS NOT NULL OR r.status='REJECTED' OR (u.status IN ('CANCELLED','FAILED') AND u."completionManifest" IS NOT NULL) THEN horizon:=horizon+interval '7 days';
     ELSIF OLD.kind='FINAL' OR u.status='SUCCEEDED' THEN horizon:=horizon+interval '24 hours'; END IF;
     IF OLD.kind='TEMPORARY' AND u."temporaryObjectId"=OLD.id AND u."lastPartUrlExpiresAt" IS NOT NULL THEN horizon:=greatest(horizon,u."lastPartUrlExpiresAt"+interval '2 seconds'); END IF;
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
   IF NEW.kind='TEMPORARY' AND NEW."writeOperation"='COMPLETE_MULTIPART' THEN SELECT * INTO j FROM "SnipersFileJob" WHERE "resourceId"=NEW."resourceId" AND kind='PROCESS_UPLOAD';
   ELSE SELECT * INTO j FROM "SnipersFileJob" WHERE id=NEW."producerJobId" AND generation=NEW."producerGeneration"; END IF;
   IF j.id IS NULL OR j.status<>'RUNNING' OR j."leaseUntil"<=clock_timestamp() OR NEW."retiredAt" IS NOT NULL THEN RAISE EXCEPTION 'Object writer has no current lease' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='SnipersUpload' AND TG_OP='UPDATE' THEN
  IF NEW.status<>OLD.status AND NOT ((OLD.status='PREPARING' AND NEW.status IN ('UPLOADING','CANCELLED','EXPIRED')) OR (OLD.status='UPLOADING' AND NEW.status IN ('COMPLETING','CANCELLED','EXPIRED')) OR (OLD.status='COMPLETING' AND NEW.status IN ('PROCESSING','CANCELLED','FAILED')) OR (OLD.status='PROCESSING' AND NEW.status IN ('SUCCEEDED','CANCELLED','FAILED'))) THEN RAISE EXCEPTION 'Invalid upload transition' USING ERRCODE='23514'; END IF;
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


COMMIT;
