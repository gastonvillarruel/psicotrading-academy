-- REVIEW CANDIDATE ONLY. Production compatibility unverified.
BEGIN;
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
CREATE TYPE "SnipersAuditAction" AS ENUM ('LOCAL_BOOTSTRAP', 'CATALOG_INITIALIZED', 'PLAN_CHANGED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'MEMBERSHIP_CHANGED', 'MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_REACTIVATED', 'MEMBERSHIP_CLOSED', 'PAYMENT_REGISTERED', 'PAYMENT_VOIDED', 'COVERAGE_CHANGED', 'COVERAGE_VOIDED');

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

COMMIT;
