-- LOCAL REVIEW CANDIDATE. Corrective function definitions; no data repair.
BEGIN;
DO $local_only$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
   RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY: destination rejected';
 END IF;
END $local_only$;
CREATE OR REPLACE FUNCTION snipers_file_require_serializable() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'serializable' THEN
  RAISE EXCEPTION 'Snipers files require SERIALIZABLE' USING ERRCODE='23514';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION snipers_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "SnipersFileJob"%ROWTYPE; n timestamptz;
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
   -- timestamptz(3) can round the requested upper bound up by half a millisecond.
   IF NEW.status='RUNNING' AND (NEW."leaseUntil"<=n OR NEW."leaseUntil">n+interval '60 seconds 1 millisecond') THEN RAISE EXCEPTION 'Invalid lease deadline' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='SnipersStorageObject' THEN
  IF TG_OP='UPDATE' THEN
   IF ROW(OLD.id,OLD."resourceId",OLD.key,OLD.kind,OLD."producerJobId",OLD."producerGeneration",OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."resourceId",NEW.key,NEW.kind,NEW."producerJobId",NEW."producerGeneration",NEW."createdAt") THEN RAISE EXCEPTION 'Immutable object identity' USING ERRCODE='23514'; END IF;
   IF OLD."retiredAt" IS NOT NULL AND ROW(OLD."retiredAt",OLD."cleanupAfter") IS DISTINCT FROM ROW(NEW."retiredAt",NEW."cleanupAfter") THEN RAISE EXCEPTION 'Retirement is irreversible' USING ERRCODE='23514'; END IF;
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

CREATE OR REPLACE FUNCTION snipers_file_check_resource(k text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "SnipersResource"%ROWTYPE; u "SnipersUpload"%ROWTYPE; p "SnipersFileJob"%ROWTYPE; o "SnipersStorageObject"%ROWTYPE; j "SnipersFileJob"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "SnipersResource" WHERE id=k;
 IF r.id IS NULL THEN RETURN; END IF;
 SELECT * INTO u FROM "SnipersUpload" WHERE "resourceId"=k;
 IF u.id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PREPARE_UPLOAD') THEN RAISE EXCEPTION 'Upload requires preparation job' USING ERRCODE='23514'; END IF;
  IF u.status IN ('PREPARING','UPLOADING','COMPLETING','PROCESSING') AND r.status<>'PENDING' THEN RAISE EXCEPTION 'Active upload requires pending resource' USING ERRCODE='23514'; END IF;
  IF u.status IN ('COMPLETING','PROCESSING','SUCCEEDED') AND NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PROCESS_UPLOAD') THEN RAISE EXCEPTION 'Completion requires processing job' USING ERRCODE='23514'; END IF;
  IF u.status IN ('UPLOADING','COMPLETING','PROCESSING','SUCCEEDED') AND NOT EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND kind='PREPARE_UPLOAD' AND status='SUCCEEDED') THEN RAISE EXCEPTION 'Multipart preparation is unconfirmed' USING ERRCODE='23514'; END IF;
  IF u.status IN ('CANCELLED','EXPIRED','FAILED') AND (r.status NOT IN ('REJECTED','ARCHIVED') OR EXISTS (SELECT 1 FROM "SnipersFileJob" WHERE "uploadId"=u.id AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED'))) THEN RAISE EXCEPTION 'Terminal upload has live work' USING ERRCODE='23514'; END IF;
  IF u."completionManifest" IS NOT NULL THEN
   IF jsonb_typeof(u."completionManifest")<>'array' THEN RAISE EXCEPTION 'Invalid manifest' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(u."completionManifest")<>(r."sizeBytes"+8388607)/8388608 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(u."completionManifest") WITH ORDINALITY m(v,n)
    WHERE jsonb_typeof(v)<>'object' OR (v-'partNumber'-'etag')<>'{}'::jsonb OR NOT (v ?& ARRAY['partNumber','etag']) OR jsonb_typeof(v->'partNumber')<>'number' OR v->>'partNumber'<>n::text OR jsonb_typeof(v->'etag')<>'string' OR length(v->>'etag') NOT BETWEEN 1 AND 200 OR v->>'etag' ~ '[[:cntrl:]]'
   ) THEN RAISE EXCEPTION 'Invalid manifest parts' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF r."finalObjectId" IS NOT NULL THEN
  SELECT * INTO o FROM "SnipersStorageObject" WHERE id=r."finalObjectId";
  SELECT * INTO p FROM "SnipersFileJob" WHERE id=o."producerJobId";
  IF u.id IS NULL OR u.status<>'SUCCEEDED' OR o.id IS NULL OR o.kind<>'FINAL' OR o."activatedAt" IS DISTINCT FROM r."verifiedAt" OR o."bytesVerifiedAt" IS NULL OR o."bytesVerifiedAt">r."verifiedAt"
   OR o."verifiedSizeBytes" IS DISTINCT FROM r."sizeBytes" OR o."verifiedSha256" IS DISTINCT FROM r.checksum OR o.key IS DISTINCT FROM r."objectKey"
   OR u."expectedSha256" IS DISTINCT FROM r.checksum OR u."sourceSha256" IS DISTINCT FROM r.checksum OR u."sourceSizeBytes" IS DISTINCT FROM r."sizeBytes"
   OR u."formatCheckedAt" IS NULL OR u."antivirusCheckedAt" IS NULL OR u."signatureVersion" IS NULL OR u."signaturePublishedAt" IS NULL OR u."validationPolicyVersion" IS NULL
   OR u."formatCheckedAt">r."verifiedAt" OR u."antivirusCheckedAt">r."verifiedAt" OR u."signaturePublishedAt">u."antivirusCheckedAt" OR u."signaturePublishedAt"<r."verifiedAt"-interval '72 hours'
   OR p.kind IS DISTINCT FROM 'PROCESS_UPLOAD'::"SnipersFileJobKind" OR p.status IS DISTINCT FROM 'SUCCEEDED'::"SnipersFileJobStatus" OR p."completedGeneration" IS DISTINCT FROM o."producerGeneration" OR u."validationGeneration" IS DISTINCT FROM o."producerGeneration"
   OR (r.status='VERIFIED' AND o."retiredAt" IS NOT NULL) OR (r.status='ARCHIVED' AND o."retiredAt" IS NULL)
  THEN RAISE EXCEPTION 'Incomplete or inconsistent final proof' USING ERRCODE='23514'; END IF;
 ELSIF u.status='SUCCEEDED' THEN RAISE EXCEPTION 'Successful upload has no final proof' USING ERRCODE='23514';
 END IF;
 FOR o IN SELECT * FROM "SnipersStorageObject" WHERE "resourceId"=k LOOP
  SELECT * INTO j FROM "SnipersFileJob" WHERE id=o."producerJobId";
  IF j.generation<o."producerGeneration" OR (o.kind='TEMPORARY' AND j.kind<>'PREPARE_UPLOAD') OR (o.kind='FINAL' AND j.kind<>'PROCESS_UPLOAD') THEN RAISE EXCEPTION 'Incorrect object producer' USING ERRCODE='23514'; END IF;
  IF o."activatedAt" IS NOT NULL AND r."finalObjectId" IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'Activated object must be selected' USING ERRCODE='23514'; END IF;
  IF u."temporaryObjectId"=o.id AND (o.kind<>'TEMPORARY' OR (u.status IN ('PREPARING','UPLOADING','COMPLETING','PROCESSING') AND o."retiredAt" IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid current temporary object' USING ERRCODE='23514'; END IF;
  IF u.status='SUCCEEDED' AND u."temporaryObjectId"=o.id AND o."retiredAt" IS NULL THEN RAISE EXCEPTION 'Successful upload must retire temporary source' USING ERRCODE='23514'; END IF;
  IF u.status IN ('CANCELLED','EXPIRED','FAILED') AND o."retiredAt" IS NULL THEN RAISE EXCEPTION 'Terminal upload must retire candidates' USING ERRCODE='23514'; END IF;
  IF o."retiredAt" IS NOT NULL THEN
   IF o."activatedAt" IS NOT NULL OR r.status='REJECTED' OR (u.status IN ('CANCELLED','FAILED') AND u."completionManifest" IS NOT NULL) THEN
    IF o."cleanupAfter"<o."retiredAt"+interval '7 days' THEN RAISE EXCEPTION 'Seven day retention required' USING ERRCODE='23514'; END IF;
   ELSIF o.kind='FINAL' OR u.status='SUCCEEDED' THEN
    IF o."cleanupAfter"<o."retiredAt"+interval '24 hours' THEN RAISE EXCEPTION 'Candidate retention required' USING ERRCODE='23514'; END IF;
   END IF;
   IF o.kind='TEMPORARY' AND u."temporaryObjectId"=o.id AND u."lastPartUrlExpiresAt" IS NOT NULL AND o."cleanupAfter"<u."lastPartUrlExpiresAt"+interval '2 seconds' THEN RAISE EXCEPTION 'Outstanding part signatures' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM "SnipersFileJob" job_row JOIN "SnipersStorageObject" object_row ON object_row.id=job_row."storageObjectId" WHERE job_row."resourceId"=k AND job_row.kind='CLEAN_OBJECT' AND object_row."retiredAt" IS NULL) THEN RAISE EXCEPTION 'Cleanup requires irreversible retirement' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION snipers_file_deferred_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='SnipersResource' THEN PERFORM snipers_file_check_resource(NEW.id);
 ELSE PERFORM snipers_file_check_resource(NEW."resourceId"); END IF;
 RETURN NULL;
END $$;

COMMIT;
