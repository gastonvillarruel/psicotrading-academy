// Offline, deterministic assembly. Never introspects or writes a database.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const migrationName = '20261031000000_snipers_launch';
export const migrationFile = `prisma/migrations/${migrationName}/migration.sql`;
export const sources = [
  ['phase1.sql', '79e79574f4b000c1c5f4c340acd103651f329ddd47c4c85e59cb45bdcbfd8cd5'],
  ['phase3b1.sql', 'b2797b9c2ea9c7f8cc42b1c867d1126a3d9bd22617fc2de58206139496d3ce3f'],
  ['phase3b2a.sql', '3df1e52a0a06432a45960a64c98710d9eb05e2e4463ce80f91422b26f039be5b'],
  ['phase3b2a-corrections.sql', 'e66f029aa139b2641c698190ed4afabb3ebce7fdd6f05425155de98df740bf3e'],
  ['phase3b2a-finalization.sql', '50c95be3151e4ebe1658c08b384cd28b94ce0ab44b94eed3f91538d5f14ec279'],
  ['phase3b2a-retention.sql', '1b683be096706d6da6f949c824577681e9fd52461a2f741c0f51712e8de36e31'],
  ['phase3b2a-cleanup-guard.sql', '8022d01262c4c18c4a9ff0a44d0d1c0bc37555faddc51a7ac58312a151e873a3'],
] as const;
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function reviewedBodies(directory = 'prisma/snipers-review'): string[] {
  return sources.map(([name, expected], index) => {
    const bytes = fs.readFileSync(path.join(directory, name));
    if (sha256(bytes) !== expected) throw new Error(`SQL de origen distinto: ${name}. Requiere nueva revisión.`);
    let sql = bytes.toString('utf8');
    const header = /^--[^\n]*\nBEGIN;\n/;
    if (!header.test(sql) || !sql.endsWith('COMMIT;\n')) throw new Error('Envoltorio SQL inesperado.');
    sql = sql.replace(header, '').slice(0, -'COMMIT;\n'.length);
    if (index > 0) {
      const guard = /^DO \$(guard|local_only)\$[\s\S]*?END \$\1\$;\n/;
      if (!guard.test(sql)) throw new Error('Guarda SQL de origen inesperada.');
      sql = sql.replace(guard, '');
    }
    if (/LOCAL DEVELOPMENT ONLY|snipers_dev|snipers_local/.test(sql)) throw new Error('Quedó una guarda local en el cuerpo.');
    return sql;
  });
}

export function assembleMigration(): string {
  const bodies = reviewedBodies();
  const additions: string[] = [];
  for (let i = 1; i < bodies.length; i++) {
    bodies[i] = bodies[i].replace(/^ALTER TYPE "SnipersAuditAction" ADD VALUE '([A-Z_]+)';\n/gm, (_all, label: string) => {
      additions.push(label); return '';
    });
  }
  if (additions.join(',') !== 'CLASS_CHANGED,CATEGORY_CHANGED,MEETING_CHANGED,FILE_FOUNDATION_CHANGED') throw new Error('Enums inesperados.');
  let replacements = 0;
  bodies[0] = bodies[0].replace(/CREATE TYPE "SnipersAuditAction" AS ENUM \(([^\n]+)\);/, (_all, labels: string) => {
    replacements++; return `CREATE TYPE "SnipersAuditAction" AS ENUM (${labels}, ${additions.map(v => `'${v}'`).join(', ')});`;
  });
  if (replacements !== 1) throw new Error('No se pudo consolidar el enum.');
  const sql = '-- Snipers launch: additive, atomic. Sources are checksum-pinned in scripts/snipers-launch/prepare.ts.\n'
    + '-- Never edit after application. Historical migrations and review SQL remain unchanged.\n'
    + "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '120s';\nSET LOCAL search_path = public, pg_catalog;\n"
    + bodies.map((body, i) => `\n-- Source: ${sources[i][0]}\n${body}`).join('')
    + '\n-- Launch correction: preserve audit against direct and cascading TRUNCATE.\n'
    + '-- A DDL-capable owner/administrator can still alter or disable triggers.\n'
    + 'CREATE TRIGGER "snipers_preserve_audit_no_truncate" BEFORE TRUNCATE ON "SnipersAuditEvent"\n'
    + '  FOR EACH STATEMENT EXECUTE FUNCTION "snipers_preserve_audit"();\n'
    + '\nCOMMIT;\n';
  if (/^ALTER TYPE /m.test(sql)) throw new Error('ALTER TYPE inesperado tras consolidación.');
  const tables = [...sql.matchAll(/^CREATE TABLE "([^"]+)"/gm)].map(m => m[1]);
  if (tables.length !== 13 || tables.some(t => !t.startsWith('Snipers') && t !== 'UserPermission')) throw new Error('Tablas inesperadas.');
  for (const m of sql.matchAll(/^ALTER TABLE "([^"]+)"/gm)) if (!tables.includes(m[1])) throw new Error('ALTER de tabla preexistente.');
  return sql;
}

export function prepareMigration(file = migrationFile) {
  const sql = assembleMigration();
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(Buffer.from(sql))) throw new Error('Migración existente distinta: no se sobrescribe, esté aplicada o no.');
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, sql, { flag: 'wx' });
  }
  return { migration: migrationName, sha256: sha256(sql), sourceSha256: Object.fromEntries(sources) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-launch/prepare.ts')) {
  try { console.log(JSON.stringify(prepareMigration())); }
  catch { console.error('Preparación rechazada. Revisá los checksums y la migración existente; no se sobrescribió ningún archivo.'); process.exitCode = 1; }
}
