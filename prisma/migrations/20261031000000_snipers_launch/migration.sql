-- Snipers launch: additive, atomic. Sources are checksum-pinned in scripts/snipers-launch/prepare.ts.
-- Never edit after application. Historical migrations and review SQL remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;

-- Source: phase1.sql
-- CreateEnum
CREATE TYPE "SnipersMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SnipersPaymentStatus" AS ENUM ('REGISTERED', 'VOID');

-- CreateEnum
CREATE TYPE "SnipersCoverageStatus" AS ENUM ('VALID', 'VOID');

-- CreateEnum
CREATE TYPE "SnipersCoverageOrigin" AS ENUM ('PAID', 'COURTESY');

-- CreateEnum
CREATE TYPE "SnipersPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SnipersResourceType" AS ENUM ('MP3', 'PDF');

-- CreateEnum
CREATE TYPE "SnipersResourceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SnipersPermission" AS ENUM ('SNIPERS_CONTENT_EDITOR', 'SNIPERS_MEMBERSHIP_MANAGER', 'SNIPERS_ADMIN');

-- CreateEnum
CREATE TYPE "SnipersAuditAction" AS ENUM ('LOCAL_BOOTSTRAP', 'CATALOG_INITIALIZED', 'PLAN_CHANGED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'MEMBERSHIP_CHANGED', 'MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_REACTIVATED', 'MEMBERSHIP_CLOSED', 'PAYMENT_REGISTERED', 'PAYMENT_VOIDED', 'COVERAGE_CHANGED', 'COVERAGE_VOIDED', 'CLASS_CHANGED', 'CATEGORY_CHANGED', 'MEETING_CHANGED', 'FILE_FOUNDATION_CHANGED');

-- CreateTable
CREATE TABLE "SnipersPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SnipersMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "renewalPlanId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersPayment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "periods" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "unitDurationDays" INTEGER NOT NULL,
    "listTotalCents" INTEGER NOT NULL,
    "receivedCents" INTEGER NOT NULL,
    "exceptionReason" TEXT,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "operatorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SnipersPaymentStatus" NOT NULL DEFAULT 'REGISTERED',
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnipersPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersCoveragePeriod" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "origin" "SnipersCoverageOrigin" NOT NULL,
    "status" "SnipersCoverageStatus" NOT NULL DEFAULT 'VALID',
    "paymentId" TEXT,
    "periodNumber" INTEGER,
    "durationDays" INTEGER,
    "allocatedCents" INTEGER,
    "requiredPaymentStatus" "SnipersPaymentStatus",
    "courtesyReason" TEXT,
    "grantorId" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnipersCoveragePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersClass" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "classDate" TIMESTAMPTZ(3) NOT NULL,
    "status" "SnipersPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersResource" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SnipersResourceType" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "status" "SnipersResourceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "privateJoinUrl" TEXT NOT NULL,
    "status" "SnipersPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SnipersMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "SnipersPermission" NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" TEXT,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnipersAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "SnipersAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnipersAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SnipersPlan_code_key" ON "SnipersPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersMembership_userId_key" ON "SnipersMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersPayment_idempotencyKey_key" ON "SnipersPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SnipersPayment_membershipId_paidAt_idx" ON "SnipersPayment"("membershipId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersPayment_coverage_identity_key" ON "SnipersPayment"("id", "membershipId", "planId", "unitDurationDays");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersPayment_valid_identity_key" ON "SnipersPayment"("id", "membershipId", "planId", "status");

-- CreateIndex
CREATE INDEX "SnipersCoveragePeriod_membershipId_status_startsAt_endsAt_idx" ON "SnipersCoveragePeriod"("membershipId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersCoveragePeriod_paymentId_periodNumber_key" ON "SnipersCoveragePeriod"("paymentId", "periodNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersCategory_slug_key" ON "SnipersCategory"("slug");

-- CreateIndex
CREATE INDEX "SnipersClass_status_classDate_idx" ON "SnipersClass"("status", "classDate");

-- CreateIndex
CREATE INDEX "SnipersClass_categoryId_idx" ON "SnipersClass"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SnipersResource_objectKey_key" ON "SnipersResource"("objectKey");

-- CreateIndex
CREATE INDEX "SnipersResource_classId_idx" ON "SnipersResource"("classId");

-- CreateIndex
CREATE INDEX "SnipersMeeting_status_startsAt_idx" ON "SnipersMeeting"("status", "startsAt");

-- CreateIndex
CREATE INDEX "UserPermission_permission_revokedAt_idx" ON "UserPermission"("permission", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");

-- CreateIndex
CREATE INDEX "SnipersAuditEvent_entityType_entityId_createdAt_idx" ON "SnipersAuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "SnipersAuditEvent_actorUserId_createdAt_idx" ON "SnipersAuditEvent"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "SnipersMembership" ADD CONSTRAINT "SnipersMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersMembership" ADD CONSTRAINT "SnipersMembership_renewalPlanId_fkey" FOREIGN KEY ("renewalPlanId") REFERENCES "SnipersPlan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersPayment" ADD CONSTRAINT "SnipersPayment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "SnipersMembership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersPayment" ADD CONSTRAINT "SnipersPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SnipersPlan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersPayment" ADD CONSTRAINT "SnipersPayment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "SnipersMembership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SnipersPlan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_paymentId_membershipId_planId_durati_fkey" FOREIGN KEY ("paymentId", "membershipId", "planId", "durationDays") REFERENCES "SnipersPayment"("id", "membershipId", "planId", "unitDurationDays") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_paymentId_membershipId_planId_requir_fkey" FOREIGN KEY ("paymentId", "membershipId", "planId", "requiredPaymentStatus") REFERENCES "SnipersPayment"("id", "membershipId", "planId", "status") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_grantorId_fkey" FOREIGN KEY ("grantorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersClass" ADD CONSTRAINT "SnipersClass_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SnipersCategory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SnipersClass"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SnipersAuditEvent" ADD CONSTRAINT "SnipersAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Explicit PostgreSQL dependency; production provider compatibility is UNVERIFIED.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "SnipersPlan" ADD CONSTRAINT "SnipersPlan_values_check" CHECK (
  "priceCents" > 0 AND "durationDays" > 0 AND "version" > 0
  AND "code" ~ '^[A-Z][A-Z0-9_]+$' AND length(btrim("name")) > 0
);
ALTER TABLE "SnipersMembership" ADD CONSTRAINT "SnipersMembership_version_check" CHECK ("version" > 0);
ALTER TABLE "SnipersPayment" ADD CONSTRAINT "SnipersPayment_values_check" CHECK (
  "periods" BETWEEN 1 AND 3 AND "unitPriceCents" > 0 AND "unitDurationDays" > 0
  AND "receivedCents" > 0 AND "listTotalCents"::bigint = "unitPriceCents"::bigint * "periods"
  AND length(btrim("planName")) > 0 AND length(btrim("method")) > 0 AND length(btrim("idempotencyKey")) > 0
  AND ("receivedCents" = "listTotalCents" OR coalesce(length(btrim("exceptionReason")), 0) > 0)
  AND (("status" = 'REGISTERED' AND "voidedAt" IS NULL AND "voidReason" IS NULL)
    OR ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND coalesce(length(btrim("voidReason")), 0) > 0))
);
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_shape_check" CHECK (
  "startsAt" < "endsAt"
  AND (("status" = 'VALID' AND "voidedAt" IS NULL AND "voidReason" IS NULL)
    OR ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND coalesce(length(btrim("voidReason")), 0) > 0))
  AND (
    ("origin" = 'PAID' AND "paymentId" IS NOT NULL AND "periodNumber" IS NOT NULL
      AND "periodNumber" BETWEEN 1 AND 3 AND "durationDays" IS NOT NULL AND "durationDays" > 0
      AND "allocatedCents" IS NOT NULL AND "allocatedCents" >= 0
      AND "endsAt" - "startsAt" = "durationDays" * INTERVAL '24 hours'
      AND "courtesyReason" IS NULL AND "grantorId" IS NULL)
    OR
    ("origin" = 'COURTESY' AND "paymentId" IS NULL AND "periodNumber" IS NULL
      AND "durationDays" IS NULL AND "allocatedCents" IS NULL
      AND coalesce(length(btrim("courtesyReason")), 0) > 0 AND "grantorId" IS NOT NULL)
  )
  AND "requiredPaymentStatus" IS NOT DISTINCT FROM
    CASE WHEN "origin" = 'PAID' AND "status" = 'VALID'
      THEN 'REGISTERED'::"SnipersPaymentStatus" ELSE NULL END
);
ALTER TABLE "SnipersCoveragePeriod" ADD CONSTRAINT "SnipersCoveragePeriod_no_valid_overlap"
  EXCLUDE USING gist ("membershipId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" = 'VALID');

-- A paid period's position cannot exceed the quantity bought, even through direct SQL.
-- The payment row lock serializes changes with concurrent coverage creation.
CREATE FUNCTION "snipers_check_period_quantity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quantity integer;
BEGIN
  IF NEW."origin" = 'PAID' THEN
    SELECT "periods" INTO quantity FROM "SnipersPayment" WHERE "id" = NEW."paymentId" FOR SHARE;
    IF NEW."periodNumber" > quantity THEN RAISE EXCEPTION 'Period exceeds payment quantity' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "snipers_period_quantity" BEFORE INSERT OR UPDATE ON "SnipersCoveragePeriod"
  FOR EACH ROW EXECUTE FUNCTION "snipers_check_period_quantity"();
-- Historical payment conditions cannot be rewritten. Status/void metadata are the only mutable fields.
CREATE FUNCTION "snipers_preserve_payment_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment history cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','voidedAt','voidReason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','voidedAt','voidReason']) THEN
    RAISE EXCEPTION 'Historical payment conditions are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "snipers_preserve_payment_history" BEFORE UPDATE OR DELETE ON "SnipersPayment"
  FOR EACH ROW EXECUTE FUNCTION "snipers_preserve_payment_history"();

ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_private_file_check" CHECK (
  length(btrim("objectKey")) > 0 AND "objectKey" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:'
  AND left("objectKey", 1) <> '/' AND "objectKey" !~ '[?#]'
  AND "sizeBytes" > 0
  AND (("type" = 'MP3' AND "mimeType" = 'audio/mpeg' AND "sizeBytes" <= 262144000)
    OR ("type" = 'PDF' AND "mimeType" = 'application/pdf' AND "sizeBytes" <= 26214400))
);
ALTER TABLE "SnipersMeeting" ADD CONSTRAINT "SnipersMeeting_interval_check" CHECK ("startsAt" < "endsAt");
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_revocation_check" CHECK (
  ("revokedAt" IS NULL AND "revokedById" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL)
);

CREATE UNIQUE INDEX "SnipersAuditEvent_single_local_bootstrap" ON "SnipersAuditEvent" ("action") WHERE "action" = 'LOCAL_BOOTSTRAP';
CREATE FUNCTION "snipers_preserve_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Snipers audit is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "snipers_preserve_audit" BEFORE UPDATE OR DELETE ON "SnipersAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "snipers_preserve_audit"();


-- Source: phase3b1.sql
ALTER TABLE "SnipersClass" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SnipersCategory" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SnipersMeeting" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SnipersClass" ADD CONSTRAINT "SnipersClass_version_check" CHECK (version > 0);
ALTER TABLE "SnipersCategory" ADD CONSTRAINT "SnipersCategory_version_check" CHECK (version > 0);
ALTER TABLE "SnipersMeeting" ADD CONSTRAINT "SnipersMeeting_version_check" CHECK (version > 0);
ALTER TABLE "SnipersClass" ADD CONSTRAINT "SnipersClass_publication_check" CHECK (
 (status <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
 AND ((status = 'ARCHIVED') = ("archivedAt" IS NOT NULL))
);

-- Source: phase3b2a.sql
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


-- Source: phase3b2a-corrections.sql
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


-- Source: phase3b2a-finalization.sql
ALTER TABLE "SnipersUpload" ADD CONSTRAINT "SnipersUpload_manifest_phase_check" CHECK (
 "completionManifest" IS NULL OR status NOT IN ('PREPARING','UPLOADING')
);
ALTER TABLE "SnipersStorageObject" ADD CONSTRAINT "SnipersStorageObject_write_intent_check" CHECK (
 ("writeOperation"='NONE') = ("writeState"='RESERVED')
);
CREATE FUNCTION snipers_file_finalization_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u "SnipersUpload"%ROWTYPE; j "SnipersFileJob"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='SnipersUpload' THEN SELECT * INTO u FROM "SnipersUpload" WHERE id=NEW.id;
 ELSE SELECT * INTO u FROM "SnipersUpload" WHERE id=NEW."uploadId"; END IF;
 IF u.id IS NULL THEN RETURN NULL; END IF;
 FOR j IN SELECT * FROM "SnipersFileJob" WHERE "uploadId"=u.id LOOP
  IF j.kind='PREPARE_UPLOAD' AND j.status='SUCCEEDED' AND (u.status='PREPARING' OR u."temporaryObjectId" IS NULL) THEN RAISE EXCEPTION 'Preparation result must be acknowledged atomically' USING ERRCODE='23514'; END IF;
  IF j.kind='PROCESS_UPLOAD' THEN
   IF u."completionManifest" IS NULL OR u.status IN ('PREPARING','UPLOADING','EXPIRED') THEN RAISE EXCEPTION 'Processing requires sealed completion' USING ERRCODE='23514'; END IF;
   IF (j.status='SUCCEEDED') IS DISTINCT FROM (u.status='SUCCEEDED') THEN RAISE EXCEPTION 'Processing result must be finalized atomically' USING ERRCODE='23514'; END IF;
   IF j.status='FAILED' AND u.status<>'FAILED' THEN RAISE EXCEPTION 'Failed processing requires failed upload' USING ERRCODE='23514'; END IF;
  END IF;
  IF j.status='CANCELLED' AND u.status NOT IN ('CANCELLED','EXPIRED','FAILED') THEN RAISE EXCEPTION 'Cancelled producer has active upload' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER snipers_file_finalization AFTER INSERT OR UPDATE ON "SnipersUpload" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION snipers_file_finalization_check();
CREATE CONSTRAINT TRIGGER snipers_file_finalization AFTER INSERT OR UPDATE ON "SnipersFileJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION snipers_file_finalization_check();

-- Source: phase3b2a-retention.sql
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



-- Source: phase3b2a-cleanup-guard.sql
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



-- Launch correction: preserve audit against direct and cascading TRUNCATE.
-- A DDL-capable owner/administrator can still alter or disable triggers.
CREATE TRIGGER "snipers_preserve_audit_no_truncate" BEFORE TRUNCATE ON "SnipersAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "snipers_preserve_audit"();

COMMIT;
