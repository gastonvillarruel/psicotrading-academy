-- Additive correction: policy 1 keeps AV evidence; policy 2 records basic server checks only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;

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
   OR u."formatCheckedAt" IS NULL OR u."formatCheckedAt">r."verifiedAt"
   OR u."validationPolicyVersion" IS NULL OR u."validationPolicyVersion" NOT IN (1,2)
   OR (u."validationPolicyVersion"=1 AND (
     u."antivirusCheckedAt" IS NULL OR u."signatureVersion" IS NULL OR u."signaturePublishedAt" IS NULL
     OR u."antivirusCheckedAt">r."verifiedAt" OR u."signaturePublishedAt">u."antivirusCheckedAt"
     OR u."signaturePublishedAt"<r."verifiedAt"-interval '72 hours'))
   OR (u."validationPolicyVersion"=2 AND (
     u."antivirusCheckedAt" IS NOT NULL OR u."signatureVersion" IS NOT NULL OR u."signaturePublishedAt" IS NOT NULL))
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

COMMIT;
