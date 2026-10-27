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
