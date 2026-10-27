import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { defaultBin, fail, localDir, npmBackup, pgEnv, readProfile, runPg } from './local';

function main() {
  const sourceFile = path.join(localDir, 'snipers_backup_source.env');
  const targetFile = path.join(localDir, 'snipers_restore_test.env');
  const source = pgEnv(readProfile(sourceFile).DATABASE_URL);
  const target = pgEnv(readProfile(targetFile).DATABASE_URL);
  assert.equal(source.PGDATABASE, 'snipers_backup_source');
  assert.equal(target.PGDATABASE, 'snipers_restore_test');
  assert.equal(source.PGHOST, '127.0.0.1');
  assert.equal(target.PGHOST, '127.0.0.1');
  assert.equal(source.PGPORT, '55432');
  assert.equal(target.PGPORT, '55432');
  const sql = (env: NodeJS.ProcessEnv, statement: string) => runPg('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], env, defaultBin, statement);
  for (const env of [source, target]) {
    assert.equal(sql(env, "SELECT count(*) FROM pg_tables WHERE schemaname='public';").trim(), '0', 'La prueba requiere bases sintéticas vacías; no se borrará contenido existente.');
  }
  npmBackup(sourceFile);
  npmBackup(targetFile);
  sql(source, `CREATE TABLE phase0_fixture (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text NOT NULL, cents integer NOT NULL, metadata jsonb NOT NULL);\nINSERT INTO phase0_fixture(label,cents,metadata) VALUES ('Sintético: audio y emoción',3000,'{"synthetic":true}'),('Prueba PDF',5000,'{"synthetic":true}');`);
  const result = npmBackup(sourceFile);
  const metadata = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
  assert.equal(createHash('sha256').update(fs.readFileSync(result.archive)).digest('hex'), metadata.sha256);
  runPg('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', 'snipers_restore_test', result.archive], target);
  const rows = "SELECT json_agg(t ORDER BY id)::text FROM phase0_fixture t;";
  assert.equal(sql(target, rows), sql(source, rows));
  assert.equal(sql(target, "SELECT pg_get_serial_sequence('phase0_fixture','id') IS NOT NULL;").trim(), 't');
  // Check that the restored identity sequence continues after the original rows.
  assert.equal(sql(target, "INSERT INTO phase0_fixture(label,cents,metadata) VALUES ('Tercera fila sintética',1,'{}') RETURNING id;").split(/\r?\n/)[0], '3');
  const report = { testedAt: new Date().toISOString(), syntheticOnly: true, archive: result.archive,
    sha256: metadata.sha256, restoredRowsMatched: true, identitySequenceVerified: true,
    destination: '127.0.0.1:55432/snipers_restore_test' };
  fs.writeFileSync(path.join(localDir, 'restore-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Restauración local verificada: esquema, filas Unicode/JSON y secuencia identity. Bases sintéticas conservadas para inspección; sin cambios de producción.');
}

try { main(); } catch (error) { fail(error); }
