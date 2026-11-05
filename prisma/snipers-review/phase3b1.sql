-- REVIEW CANDIDATE. Local experimental chain only; not a production migration.
BEGIN;
DO $guard$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55432 THEN
  RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY';
 END IF;
END $guard$;
ALTER TYPE "SnipersAuditAction" ADD VALUE 'CLASS_CHANGED';
ALTER TYPE "SnipersAuditAction" ADD VALUE 'CATEGORY_CHANGED';
ALTER TYPE "SnipersAuditAction" ADD VALUE 'MEETING_CHANGED';
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
COMMIT;
