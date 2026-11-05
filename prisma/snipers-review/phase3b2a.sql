-- REVIEW CANDIDATE. 3B-2A LOCAL ONLY; no production migration.
BEGIN;
DO $local_only$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
   RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY: destination rejected';
 END IF;
END $local_only$;
DO $preflight$ BEGIN IF EXISTS (SELECT 1 FROM "SnipersResource" WHERE status IN ('VERIFIED','ARCHIVED')) THEN RAISE EXCEPTION 'Historical resources require review; no automatic repair'; END IF; END $preflight$;
-- CreateEnum
CREATE TYPE "SnipersUploadStatus" AS ENUM ('PREPARING', 'UPLOADING', 'COMPLETING', 'PROCESSING', 'SUCCEEDED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SnipersFileJobKind" AS ENUM ('PREPARE_UPLOAD', 'PROCESS_UPLOAD', 'CLEAN_OBJECT');

-- CreateEnum
CREATE TYPE "SnipersFileJobStatus" AS ENUM ('READY', 'RUNNING', 'WAIT_RETRY', 'BLOCKED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SnipersStorageObjectKind" AS ENUM ('TEMPORARY', 'FINAL');

-- CreateEnum
CREATE TYPE "SnipersObjectOperation" AS ENUM ('NONE', 'CREATE_MULTIPART', 'COMPLETE_MULTIPART', 'PUT_FINAL');

-- CreateEnum
CREATE TYPE "SnipersObjectWriteState" AS ENUM ('RESERVED', 'IN_FLIGHT', 'UNCERTAIN', 'ACKNOWLEDGED', 'BYTES_VERIFIED');

-- CreateEnum
CREATE TYPE "SnipersObjectCleanupState" AS ENUM ('PENDING', 'ABSENT_OBSERVED', 'QUIESCENT');

-- AlterEnum
ALTER TYPE "SnipersAuditAction" ADD VALUE 'FILE_FOUNDATION_CHANGED';

-- AlterTable
ALTER TABLE "SnipersResource" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "attachedAt" TIMESTAMPTZ(3),
ADD COLUMN     "finalObjectId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3),
ALTER COLUMN "objectKey" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SnipersUpload" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "temporaryObjectId" TEXT,
    "multipartUploadId" TEXT,
    "expectedSha256" TEXT NOT NULL,
    "partSizeBytes" INTEGER NOT NULL DEFAULT 8388608,
    "status" "SnipersUploadStatus" NOT NULL DEFAULT 'PREPARING',
    "completionManifest" JSONB,
    "manifestHash" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastPartUrlExpiresAt" TIMESTAMPTZ(3),
    "sourceSha256" TEXT,
    "sourceSizeBytes" BIGINT,
    "formatCheckedAt" TIMESTAMPTZ(3),
    "antivirusCheckedAt" TIMESTAMPTZ(3),
    "signatureVersion" TEXT,
    "signaturePublishedAt" TIMESTAMPTZ(3),
    "validationPolicyVersion" INTEGER,
    "validationGeneration" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersFileJob" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "uploadId" TEXT,
    "storageObjectId" TEXT,
    "kind" "SnipersFileJobKind" NOT NULL,
    "status" "SnipersFileJobStatus" NOT NULL DEFAULT 'READY',
    "phase" TEXT NOT NULL DEFAULT 'RESERVED',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedGeneration" INTEGER,
    "errorCode" TEXT,
    "executionId" UUID,
    "executionDeadlineAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersFileJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersStorageObject" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SnipersStorageObjectKind" NOT NULL,
    "producerJobId" TEXT NOT NULL,
    "producerGeneration" INTEGER NOT NULL,
    "writeOperation" "SnipersObjectOperation" NOT NULL DEFAULT 'NONE',
    "writeState" "SnipersObjectWriteState" NOT NULL DEFAULT 'RESERVED',
    "verifiedSha256" TEXT,
    "verifiedSizeBytes" BIGINT,
    "bytesVerifiedAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "cleanupAfter" TIMESTAMPTZ(3),
    "nextProbeAt" TIMESTAMPTZ(3),
    "lastProbeAt" TIMESTAMPTZ(3),
    "lastAbsentAt" TIMESTAMPTZ(3),
    "cleanupState" "SnipersObjectCleanupState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersStorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SnipersUpload_resourceId_key" ON "SnipersUpload"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersUpload_temporaryObjectId_key" ON "SnipersUpload"("temporaryObjectId");

-- CreateIndex
CREATE INDEX "SnipersUpload_status_expiresAt_idx" ON "SnipersUpload"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersUpload_id_resourceId_key" ON "SnipersUpload"("id", "resourceId");

-- CreateIndex
CREATE INDEX "SnipersFileJob_status_availableAt_leaseUntil_idx" ON "SnipersFileJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersFileJob_id_resourceId_key" ON "SnipersFileJob"("id", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersStorageObject_key_key" ON "SnipersStorageObject"("key");

-- CreateIndex
CREATE INDEX "SnipersStorageObject_retiredAt_nextProbeAt_idx" ON "SnipersStorageObject"("retiredAt", "nextProbeAt");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersStorageObject_id_resourceId_key" ON "SnipersStorageObject"("id", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersStorageObject_producerJobId_producerGeneration_kind_key" ON "SnipersStorageObject"("producerJobId", "producerGeneration", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersResource_finalObjectId_key" ON "SnipersResource"("finalObjectId");

-- AddForeignKey
ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_finalObjectId_id_fkey" FOREIGN KEY ("finalObjectId", "id") REFERENCES "SnipersStorageObject"("id", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersUpload" ADD CONSTRAINT "SnipersUpload_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "SnipersResource"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersUpload" ADD CONSTRAINT "SnipersUpload_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersUpload" ADD CONSTRAINT "SnipersUpload_temporaryObjectId_resourceId_fkey" FOREIGN KEY ("temporaryObjectId", "resourceId") REFERENCES "SnipersStorageObject"("id", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersFileJob" ADD CONSTRAINT "SnipersFileJob_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "SnipersResource"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersFileJob" ADD CONSTRAINT "SnipersFileJob_uploadId_resourceId_fkey" FOREIGN KEY ("uploadId", "resourceId") REFERENCES "SnipersUpload"("id", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersFileJob" ADD CONSTRAINT "SnipersFileJob_storageObjectId_resourceId_fkey" FOREIGN KEY ("storageObjectId", "resourceId") REFERENCES "SnipersStorageObject"("id", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersStorageObject" ADD CONSTRAINT "SnipersStorageObject_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "SnipersResource"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersStorageObject" ADD CONSTRAINT "SnipersStorageObject_producerJobId_resourceId_fkey" FOREIGN KEY ("producerJobId", "resourceId") REFERENCES "SnipersFileJob"("id", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Additional PostgreSQL invariants. No remote storage operations or worker runtime.
ALTER TABLE "SnipersResource" DROP CONSTRAINT "SnipersResource_private_file_check";
ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_private_file_check" CHECK (
 ("objectKey" IS NULL OR (length(btrim("objectKey")) > 0 AND "objectKey" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND left("objectKey",1) <> '/' AND "objectKey" !~ '[?#]'))
 AND "sizeBytes" > 0 AND ((type='MP3' AND "mimeType"='audio/mpeg' AND "sizeBytes"<=262144000) OR (type='PDF' AND "mimeType"='application/pdf' AND "sizeBytes"<=26214400))
);
ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_file_state_check" CHECK (
 (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$')
 AND ("attachedAt" IS NULL OR status='VERIFIED')
 AND ((status='ARCHIVED') = ("archivedAt" IS NOT NULL))
 AND (("finalObjectId" IS NULL AND "verifiedAt" IS NULL) OR ("finalObjectId" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "objectKey" IS NOT NULL AND checksum IS NOT NULL AND status IN ('VERIFIED','ARCHIVED')))
 AND (status<>'VERIFIED' OR "finalObjectId" IS NOT NULL)
);
ALTER TABLE "SnipersUpload" ADD CONSTRAINT "SnipersUpload_shape_check" CHECK (
 "expectedSha256" ~ '^[a-f0-9]{64}$' AND "partSizeBytes"=8388608 AND "expiresAt">"createdAt"
 AND ("lastPartUrlExpiresAt" IS NULL OR "lastPartUrlExpiresAt"<="expiresAt")
 AND (("temporaryObjectId" IS NULL) = ("multipartUploadId" IS NULL))
 AND ("multipartUploadId" IS NULL OR length("multipartUploadId") BETWEEN 1 AND 2048)
 AND (status NOT IN ('UPLOADING','COMPLETING','PROCESSING','SUCCEEDED') OR "temporaryObjectId" IS NOT NULL)
 AND (("completionManifest" IS NULL) = ("manifestHash" IS NULL))
 AND ("manifestHash" IS NULL OR "manifestHash" ~ '^[a-f0-9]{64}$')
 AND (status NOT IN ('COMPLETING','PROCESSING','SUCCEEDED') OR "completionManifest" IS NOT NULL)
 AND ("sourceSha256" IS NULL OR "sourceSha256" ~ '^[a-f0-9]{64}$')
 AND ("sourceSizeBytes" IS NULL OR "sourceSizeBytes">0)
 AND ("validationPolicyVersion" IS NULL OR "validationPolicyVersion">0)
 AND ("validationGeneration" IS NULL OR "validationGeneration">0)
 AND ("signatureVersion" IS NULL OR "signatureVersion" ~ '^[A-Za-z0-9._-]{1,100}$')
);
ALTER TABLE "SnipersFileJob" ADD CONSTRAINT "SnipersFileJob_shape_check" CHECK (
 ((kind IN ('PREPARE_UPLOAD','PROCESS_UPLOAD') AND "uploadId" IS NOT NULL AND "storageObjectId" IS NULL) OR (kind='CLEAN_OBJECT' AND "uploadId" IS NULL AND "storageObjectId" IS NOT NULL))
 AND generation>=0 AND attempts>=0
 AND ((status='RUNNING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND generation>0) OR (status<>'RUNNING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL))
 AND ((status='SUCCEEDED' AND "completedGeneration" IS NOT NULL AND "completedGeneration"=generation AND generation>0) OR (status<>'SUCCEEDED' AND "completedGeneration" IS NULL))
 AND ("errorCode" IS NULL OR "errorCode" ~ '^[A-Z][A-Z0-9_]{0,63}$')
 AND (("executionId" IS NULL) = ("executionDeadlineAt" IS NULL))
 AND phase IN ('RESERVED','CREATE_MULTIPART','COMPLETE_MULTIPART','DOWNLOAD','ANALYZE','PUT_FINAL','VERIFY_FINAL','ACTIVATE','ABORT_MULTIPART','DELETE','PROBE')
 AND (phase='RESERVED' OR (kind='PREPARE_UPLOAD' AND phase='CREATE_MULTIPART') OR (kind='PROCESS_UPLOAD' AND phase IN ('COMPLETE_MULTIPART','DOWNLOAD','ANALYZE','PUT_FINAL','VERIFY_FINAL','ACTIVATE')) OR (kind='CLEAN_OBJECT' AND phase IN ('ABORT_MULTIPART','DELETE','PROBE')))
);
ALTER TABLE "SnipersStorageObject" ADD CONSTRAINT "SnipersStorageObject_shape_check" CHECK (
 octet_length(key) BETWEEN 1 AND 1024 AND key !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND left(key,1)<>'/' AND key !~ '[?#]'
 AND ((kind='TEMPORARY' AND key LIKE 'snipers/temporary/%' AND "writeOperation" IN ('NONE','CREATE_MULTIPART','COMPLETE_MULTIPART')) OR (kind='FINAL' AND key LIKE 'snipers/final/%' AND "writeOperation" IN ('NONE','PUT_FINAL')))
 AND "producerGeneration">0
 AND (("bytesVerifiedAt" IS NULL AND "verifiedSha256" IS NULL AND "verifiedSizeBytes" IS NULL AND "writeState"<>'BYTES_VERIFIED') OR ("bytesVerifiedAt" IS NOT NULL AND "verifiedSha256" IS NOT NULL AND "verifiedSha256" ~ '^[a-f0-9]{64}$' AND "verifiedSizeBytes" IS NOT NULL AND "verifiedSizeBytes">0 AND "writeState"='BYTES_VERIFIED'))
 AND ("activatedAt" IS NULL OR (kind='FINAL' AND "bytesVerifiedAt" IS NOT NULL AND "activatedAt">="bytesVerifiedAt"))
 AND (("retiredAt" IS NULL AND "cleanupAfter" IS NULL AND "nextProbeAt" IS NULL AND "lastProbeAt" IS NULL AND "lastAbsentAt" IS NULL AND "cleanupState"='PENDING') OR ("retiredAt" IS NOT NULL AND "cleanupAfter" IS NOT NULL AND "nextProbeAt" IS NOT NULL AND "cleanupAfter">="retiredAt" AND "nextProbeAt">="cleanupAfter"))
 AND ("lastAbsentAt" IS NULL OR ("lastProbeAt" IS NOT NULL AND "lastAbsentAt"<="lastProbeAt"))
 AND ("cleanupState"='PENDING' OR "lastAbsentAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "snipers_one_upload_job" ON "SnipersFileJob" ("uploadId",kind) WHERE kind IN ('PREPARE_UPLOAD','PROCESS_UPLOAD');
CREATE UNIQUE INDEX "snipers_one_cleanup_job" ON "SnipersFileJob" ("storageObjectId") WHERE kind='CLEAN_OBJECT';
CREATE UNIQUE INDEX "snipers_one_activated_object" ON "SnipersStorageObject" ("resourceId") WHERE "activatedAt" IS NOT NULL;

-- Only relationships requiring a transaction-wide final state are deferred.
ALTER TABLE "SnipersResource" ALTER CONSTRAINT "SnipersResource_finalObjectId_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SnipersUpload" ALTER CONSTRAINT "SnipersUpload_temporaryObjectId_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SnipersFileJob" ALTER CONSTRAINT "SnipersFileJob_storageObjectId_resourceId_fkey" DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION snipers_file_require_serializable() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'serializable' THEN
  RAISE EXCEPTION 'Snipers files require SERIALIZABLE' USING ERRCODE='23514';
 END IF;
END $$;

CREATE FUNCTION snipers_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF NEW.status='RUNNING' AND (NEW."leaseUntil"<=n OR NEW."leaseUntil">n+interval '60 seconds') THEN RAISE EXCEPTION 'Invalid lease deadline' USING ERRCODE='23514'; END IF;
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
  IF ROW(OLD."sourceSha256",OLD."sourceSizeBytes",OLD."formatCheckedAt",OLD."antivirusCheckedAt",OLD."signatureVersion",OLD."signaturePublishedAt",OLD."validationPolicyVersion",OLD."validationGeneration") IS DISTINCT FROM ROW(NEW."sourceSha256",NEW."sourceSizeBytes",NEW."formatCheckedAt",NEW."antivirusCheckedAt",NEW."signatureVersion",NEW."signaturePublishedAt",NEW."validationPolicyVersion",NEW."validationGeneration") THEN
   SELECT * INTO j FROM "SnipersFileJob" WHERE "uploadId"=NEW.id AND kind='PROCESS_UPLOAD';
   IF j.id IS NULL OR j.status<>'RUNNING' OR j.generation IS DISTINCT FROM NEW."validationGeneration" OR j."leaseUntil"<=clock_timestamp() THEN RAISE EXCEPTION 'Validation has no current generation' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION snipers_file_check_resource(k text) RETURNS void LANGUAGE plpgsql AS $$
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
    WHERE jsonb_typeof(v)<>'object' OR (v-'partNumber'-'etag')<>'{}'::jsonb OR NOT (v ?& ARRAY['partNumber','etag']) OR jsonb_typeof(v->'partNumber')<>'number' OR v->>'partNumber'<>n::text OR jsonb_typeof(v->'etag')<>'string' OR length(v->>'etag') NOT BETWEEN 1 AND 200
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
  IF u.status IN ('CANCELLED','EXPIRED','FAILED') AND o."retiredAt" IS NULL THEN RAISE EXCEPTION 'Terminal upload must retire candidates' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM "SnipersFileJob" j JOIN "SnipersStorageObject" o ON o.id=j."storageObjectId" WHERE j."resourceId"=k AND j.kind='CLEAN_OBJECT' AND o."retiredAt" IS NULL) THEN RAISE EXCEPTION 'Cleanup requires irreversible retirement' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION snipers_file_deferred_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='SnipersResource' THEN PERFORM snipers_file_check_resource(NEW.id);
 ELSE PERFORM snipers_file_check_resource(NEW."resourceId"); END IF;
 RETURN NULL;
END $$;
DO $triggers$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['SnipersResource','SnipersUpload','SnipersFileJob','SnipersStorageObject'] LOOP
  EXECUTE format('CREATE TRIGGER snipers_file_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION snipers_file_guard()',t);
  EXECUTE format('CREATE TRIGGER snipers_file_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION snipers_file_guard()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER snipers_file_consistency AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION snipers_file_deferred_check()',t);
 END LOOP;
END $triggers$;

COMMIT;
