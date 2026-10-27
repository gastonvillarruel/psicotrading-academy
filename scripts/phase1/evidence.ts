import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { defaultBin, pgEnv, runPg, type Profile } from '../phase0/local';
import { queryLocal } from './guard';

export function existingStructure(profile: Profile): { sha256: string; tables: number; structure: string } {
  const original = fs.readFileSync('scripts/phase1/local-artifacts/pre-snipers.prisma', 'utf8');
  const tables = [...original.matchAll(/^model (\w+) \{/gm)].map(m => m[1]);
  const enums = [...original.matchAll(/^enum (\w+) \{/gm)].map(m => m[1]);
  const dump = runPg('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '--strict-names',
    ...tables.map(t => `--table=public."${t}"`)], pgEnv(profile.DATABASE_URL), defaultBin)
    .replace(/^\\(?:un)?restrict .*\r?\n/gm, '').replace(/\r\n/g, '\n');
  const enumSql = `SELECT t.typname,e.enumsortorder,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname IN (${enums.map(e => `'${e}'`).join(',')}) ORDER BY t.typname,e.enumsortorder;`;
  const structure = dump + '\n' + queryLocal(profile, enumSql);
  return { sha256: createHash('sha256').update(structure).digest('hex'), tables: tables.length, structure };
}
