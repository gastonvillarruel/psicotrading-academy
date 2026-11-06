-- Add only the new audio declaration; existing resources and evidence are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;
ALTER TYPE "SnipersResourceType" ADD VALUE 'M4A';
ALTER TABLE "SnipersResource" DROP CONSTRAINT "SnipersResource_private_file_check";
ALTER TABLE "SnipersResource" ADD CONSTRAINT "SnipersResource_private_file_check" CHECK (
 ("objectKey" IS NULL OR (length(btrim("objectKey")) > 0 AND "objectKey" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND left("objectKey",1) <> '/' AND "objectKey" !~ '[?#]'))
 AND "sizeBytes" > 0 AND (
   (type='MP3' AND "mimeType"='audio/mpeg' AND "sizeBytes"<=262144000)
   OR (type='PDF' AND "mimeType"='application/pdf' AND "sizeBytes"<=26214400)
   -- Text comparison allows ADD VALUE and the CHECK in the same transaction.
   OR (type::text='M4A' AND "mimeType"='audio/mp4' AND "sizeBytes"<=262144000)
 )
);
COMMIT;
