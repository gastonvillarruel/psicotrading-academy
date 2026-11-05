-- LOCAL REVIEW CANDIDATE. Close durable phase/result pairs; no runtime or data repair.
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'snipers_dev' OR current_user<>'snipers_local' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55432 THEN RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY'; END IF;
END $guard$;
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
COMMIT;
