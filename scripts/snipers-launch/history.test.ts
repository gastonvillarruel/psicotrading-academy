import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { basicFilesMigration, historicalMigrations, verifyMigrationHistory } from './database';
import { migrationFile, migrationName, sha256 } from './prepare';

const june = '20260608001903_add_campus_content_locked';
const october = '20261019_add_course_lead_capture_fields';
const juneFile = `prisma/migrations/${june}/migration.sql`;
const juneChecksums = [
  '22d49ab1aa51a3825c501d6442b640e194628f8e96ca6a8587a1ec7ff47fe36b',
  '0c65cf30ac172053e189ef5cd343cc4372a123502ae60988658eb1f152416512',
];
const finished = '2026-06-08T01:00:00.000Z';
const rolledBack = '2026-06-08T00:30:00.000Z';
type HistoryRow = { migration_name: string; checksum: string; finished_at: string | null; rolled_back_at: string | null };

function history(): HistoryRow[] {
  return historicalMigrations().map(m => ({ migration_name: m.name, checksum: m.checksum, finished_at: finished, rolled_back_at: null }));
}
function row(rows: HistoryRow[], name = june) {
  return rows.find(r => r.migration_name === name)!;
}
function reverted(rows: HistoryRow[], name = june): HistoryRow {
  return { ...row(rows, name), finished_at: null, rolled_back_at: rolledBack };
}
async function verify(rows: HistoryRow[], applied = false) {
  const before = structuredClone(rows);
  let queries = 0;
  const client = { query: async (sql: string) => {
    queries++;
    assert.equal(sql, 'SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name');
    return { rows };
  } } as unknown as PoolClient;
  try { await verifyMigrationHistory(client, applied); }
  finally {
    assert.equal(queries, 1);
    assert.deepEqual(rows, before, 'History must remain unchanged.');
  }
}

test('history accepts one current application per historical migration', async () => {
  await verify(history());
});

for (const [index, checksum] of juneChecksums.entries()) {
  test(`June accepts reviewed checksum ${index + 1} with reverted attempts on either checkout`, async t => {
    const lf = fs.readFileSync(juneFile, 'utf8').replace(/\r\n/g, '\n');
    const variants = [Buffer.from(lf), Buffer.from(lf.replace(/\n$/, '\r\n'))];
    assert.deepEqual(variants.map(sha256), juneChecksums);
    const originalRead = fs.readFileSync;
    for (const bytes of variants) {
      // Substitute only an in-memory read; never rewrite historical migration files.
      const read = t.mock.method(fs, 'readFileSync', new Proxy(originalRead, {
        apply(target, thisArg, args) {
          return args[0] === juneFile ? bytes : Reflect.apply(target, thisArg, args);
        },
      }));
      try {
        const rows = history();
        row(rows).checksum = checksum;
        await verify(rows);
        rows.unshift(...juneChecksums.map(value => ({ ...reverted(rows), checksum: value })));
        await verify(rows);
      } finally { read.mock.restore(); }
    }
  });
}

test('other migrations can retain reverted attempts with their exact checksum', async () => {
  const rows = history();
  rows.unshift(reverted(rows, october));
  await verify(rows);
});

const rejected: Array<[string, (rows: HistoryRow[]) => void]> = [
  ['unexpected June checksum', rows => { row(rows).checksum = 'unexpected'; }],
  ['unexpected checksum in a reverted June attempt', rows => { rows.push({ ...reverted(rows), checksum: 'unexpected' }); }],
  ['active failed June attempt beside a successful application', rows => { rows.push({ ...row(rows), finished_at: null }); }],
  ['active failed June application', rows => { row(rows).finished_at = null; }],
  ['multiple successful June applications', rows => { rows.push({ ...row(rows), checksum: juneChecksums[0] }); }],
  ['only reverted June attempts', rows => { row(rows).rolled_back_at = rolledBack; }],
  ['missing June migration', rows => { rows.splice(rows.indexOf(row(rows)), 1); }],
  ['unknown successful migration', rows => { rows.push({ ...row(rows), migration_name: 'unknown' }); }],
  ['unknown reverted migration', rows => { rows.push({ ...reverted(rows), migration_name: 'unknown' }); }],
  ['June checksum reused for October', rows => { row(rows, october).checksum = juneChecksums[0]; }],
  ['unexpected checksum in a reverted October attempt', rows => { rows.push({ ...reverted(rows, october), checksum: 'unexpected' }); }],
  ['multiple successful October applications', rows => { rows.push({ ...row(rows, october) }); }],
  ['active failed October attempt', rows => { rows.push({ ...row(rows, october), finished_at: null }); }],
  ['missing October despite legitimate June recovery', rows => {
    rows.unshift(reverted(rows));
    rows.splice(rows.indexOf(row(rows, october)), 1);
  }],
];
for (const [name, change] of rejected) {
  test(`history rejects ${name}`, async () => {
    const rows = history();
    change(rows);
    await assert.rejects(verify(rows), /Historial Prisma incompatible/);
  });
}

test('June exception does not accept an altered local SQL file even with its matching history checksum', async t => {
  const bytes = Buffer.from('unexpected June SQL\n');
  const originalRead = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', new Proxy(originalRead, {
    apply(target, thisArg, args) {
      return args[0] === juneFile ? bytes : Reflect.apply(target, thisArg, args);
    },
  }));
  await assert.rejects(verify(history()), /Historial Prisma incompatible/);
});

function withSnipers(): HistoryRow[] {
  return [...history(), { migration_name: migrationName, checksum: sha256(fs.readFileSync(migrationFile)), finished_at: finished, rolled_back_at: null }];
}
function withCorrection(): HistoryRow[] {
  return [...withSnipers(), { migration_name: basicFilesMigration,
    checksum: sha256(fs.readFileSync(`prisma/migrations/${basicFilesMigration}/migration.sql`)), finished_at: finished, rolled_back_at: null }];
}

test('Snipers base and optional applied correction retain their exact checksum checks', async () => {
  await verify(withSnipers(), true);
  await verify(withCorrection(), true);
  for (const name of [migrationName, basicFilesMigration]) {
    const rows = withCorrection();
    row(rows, name).checksum = juneChecksums[0];
    await assert.rejects(verify(rows, true), /Historial Prisma incompatible/);
  }
});

test('Snipers application state and correction-before-base guards remain closed', async () => {
  await assert.rejects(verify(history(), true), /Historial Prisma incompatible/);
  await assert.rejects(verify(withSnipers(), false), /Historial Prisma incompatible/);
  await assert.rejects(verify(withCorrection(), false), /Corrección Snipers sin migración base/);
});
