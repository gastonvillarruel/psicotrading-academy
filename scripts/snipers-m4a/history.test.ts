import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { PoolClient } from 'pg';
import { basicFilesMigration, m4aMigration, historicalMigrations, verifyMigrationHistory } from '../snipers-launch/database';
import { migrationName, migrationFile, sha256 } from '../snipers-launch/prepare';

test('M4A migration is optional until applied, checksum protected and requires basic files', async () => {
  const base = [...historicalMigrations(), {name:migrationName,checksum:sha256(fs.readFileSync(migrationFile))},
    {name:basicFilesMigration,checksum:sha256(fs.readFileSync(`prisma/migrations/${basicFilesMigration}/migration.sql`))}]
    .map(m => ({migration_name:m.name,checksum:m.checksum,finished_at:new Date(),rolled_back_at:null}));
  const m4a = {migration_name:m4aMigration,checksum:sha256(fs.readFileSync(`prisma/migrations/${m4aMigration}/migration.sql`)),finished_at:new Date(),rolled_back_at:null};
  const verify = (rows: typeof base) => verifyMigrationHistory({query:async()=>({rows})} as unknown as PoolClient, true);
  await verify(base); await verify([...base,m4a]);
  await assert.rejects(verify([...base,{...m4a,checksum:'corrupt'}]));
  await assert.rejects(verify([...base.filter(m=>m.migration_name!==basicFilesMigration),m4a]));
  await assert.rejects(verify([...base,m4a,m4a]));
});
