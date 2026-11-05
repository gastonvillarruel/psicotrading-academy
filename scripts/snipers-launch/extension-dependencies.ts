import type { PoolClient } from 'pg';

export type ExtensionEntry = { name: string; schema: string; version: string; catalogRequired: boolean };
export type ExtensionMetadata = { sha256: string; extensions: string[]; extensionInventory?: ExtensionEntry[] };
export type ExtensionReview = { archiveSha256: string; publicSqlReviewed: boolean;
  extensions: Array<{ name: string; schema: string; version: string; disposition: 'required' | 'inventory-only' }> };
export type ExtensionPlan = { name: string; schema?: string; version?: string; required: boolean }[];
const recognized = new Set(['btree_gist', 'pgcrypto', 'uuid-ossp', 'pg_stat_statements', 'supabase_vault']);

// Exclude extension-owned objects from application roots, include table subobjects (defaults,
// policies, rules, triggers), then follow catalog dependencies transitively. Function bodies
// and dynamic SQL still require the separate, archive-bound review below.
export const extensionInventorySql = `WITH RECURSIVE
owned(classid,objid,name) AS (
  SELECT d.classid,d.objid,e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
  WHERE d.refclassid='pg_extension'::regclass AND d.deptype='e'
  UNION
  SELECT d.classid,d.objid,o.name FROM pg_depend d JOIN owned o ON d.refclassid=o.classid AND d.refobjid=o.objid
  WHERE d.deptype='i'
),
roots AS (
  SELECT d.classid,d.objid FROM pg_depend d
  WHERE d.refclassid='pg_namespace'::regclass AND d.refobjid='public'::regnamespace
    AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.classid=d.classid AND o.objid=d.objid)
),
app(classid,objid) AS (
  SELECT classid,objid FROM roots
  UNION
  SELECT d.classid,d.objid FROM pg_depend d JOIN app a ON d.refclassid=a.classid AND d.refobjid=a.objid
  WHERE d.deptype IN ('i','a') AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.classid=d.classid AND o.objid=d.objid)
),
reachable(classid,objid) AS (
  SELECT classid,objid FROM app
  UNION
  SELECT d.refclassid,d.refobjid FROM pg_depend d JOIN reachable r ON d.classid=r.classid AND d.objid=r.objid
)
SELECT e.extname AS name,n.nspname AS schema,e.extversion AS version,
  EXISTS (SELECT 1 FROM reachable r JOIN owned o ON o.classid=r.classid AND o.objid=r.objid WHERE o.name=e.extname) AS "catalogRequired"
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname<>'plpgsql' ORDER BY e.extname`;

export function extensionPlan(metadata: ExtensionMetadata, review?: ExtensionReview): ExtensionPlan {
  if (!Array.isArray(metadata.extensions) || new Set(metadata.extensions).size !== metadata.extensions.length
    || metadata.extensions.some(name => !recognized.has(name))) throw new Error('Extensiones desconocidas o inventario inválido; requiere revisión.');
  if (metadata.extensionInventory === undefined) {
    if (review || metadata.extensions.some(name => name !== 'btree_gist')) throw new Error('Manifiesto histórico sin evidencia de dependencias.');
    return metadata.extensions.map(name => ({ name, required: true }));
  }
  const inventory = metadata.extensionInventory;
  if (!Array.isArray(inventory) || inventory.length !== metadata.extensions.length
    || new Set(inventory.map(e => e.name)).size !== inventory.length
    || inventory.some(e => !metadata.extensions.includes(e.name) || !e.schema || !e.version || typeof e.catalogRequired !== 'boolean')) throw new Error('Inventario de dependencias incompleto.');
  if (!review && inventory.every(e => e.name === 'btree_gist')) return inventory.map(e => ({ ...e, required: true }));
  if (!review || review.archiveSha256 !== metadata.sha256 || review.publicSqlReviewed !== true
    || !Array.isArray(review.extensions) || review.extensions.length !== inventory.length
    || new Set(review.extensions.map(e => e.name)).size !== inventory.length) throw new Error('Revisión de SQL public vinculada al hash del respaldo requerida.');
  return inventory.map(e => {
    const decision = review.extensions.find(r => r.name === e.name);
    if (!decision || decision.schema !== e.schema || decision.version !== e.version
      || !['required', 'inventory-only'].includes(decision.disposition)
      || (e.catalogRequired && decision.disposition !== 'required')) throw new Error('Dependencia real omitida o revisión incompatible.');
    return { name: e.name, schema: e.schema, version: e.version, required: decision.disposition === 'required' };
  });
}

export const restoreObjectsSql = `WITH RECURSIVE owned(classid,objid,name) AS (
  SELECT d.classid,d.objid,e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
  WHERE d.refclassid='pg_extension'::regclass AND d.deptype='e'
  UNION
  SELECT d.classid,d.objid,o.name FROM pg_depend d JOIN owned o ON d.refclassid=o.classid AND d.refobjid=o.objid
  WHERE d.deptype='i'
)
SELECT n.nspname AS schema,c.relname AS name,o.name AS extension,c.relkind::text AS kind,c.relrowsecurity AS row_security
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN owned o ON o.classid='pg_class'::regclass AND o.objid=c.oid
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
  AND c.relkind IN ('r','p','v','m','S','f')
UNION ALL
SELECT n.nspname,p.proname,o.name,'function',false FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
LEFT JOIN owned o ON o.classid='pg_proc'::regclass AND o.objid=p.oid
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
UNION ALL
SELECT n.nspname,t.typname,o.name,'type',false FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
LEFT JOIN owned o ON o.classid='pg_type'::regclass AND o.objid=t.oid
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'`;

export async function verifyRestoreExtensions(client: PoolClient, plan: ExtensionPlan) {
  const installed = (await client.query(`SELECT e.extname AS name,e.extversion AS version,n.nspname AS schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace`)).rows;
  const required = plan.filter(e => e.required);
  if (installed.some(e => e.name !== 'plpgsql' && !required.some(r => r.name === e.name))) throw new Error('Extensión no aprobada en destino.');
  if (required.some(e => !installed.some(i => i.name === e.name && (!e.schema || i.schema === e.schema) && (!e.version || i.version === e.version)))) throw new Error('Falta extensión previamente aprobada con esquema/versión compatibles.');
  if (required.some(e => e.name === 'pg_stat_statements')) {
    const preload = (await client.query("SELECT current_setting('shared_preload_libraries') AS libraries")).rows[0]?.libraries;
    if (typeof preload !== 'string' || !preload.split(',').some(e => e.trim().replace(/^"|"$/g, '') === 'pg_stat_statements')) throw new Error('pg_stat_statements requiere preload local previamente aprobado.');
  }
  const objects = (await client.query(restoreObjectsSql)).rows;
  if (objects.some(o => !o.extension || !required.some(e => e.name === o.extension))) throw new Error('Destino no vacío; sólo se permiten objetos de extensiones aprobadas.');
  for (const object of objects) {
    if (object.kind === 'f' || object.row_security) throw new Error('No se acredita vacío de objetos externos o protegidos por RLS.');
    if (object.kind === 'r' || object.kind === 'p') {
      const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
      const populated = (await client.query(`SELECT EXISTS (SELECT 1 FROM ${quote(object.schema)}.${quote(object.name)} LIMIT 1) AS populated`)).rows[0]?.populated;
      if (populated !== false) throw new Error('Destino no vacío: tabla de extensión contiene datos o no pudo verificarse.');
    }
  }
}

export function verifyExtensionToc(toc: string, plan: ExtensionPlan) {
  for (const line of toc.split('\n')) {
    const match = line.match(/^\d+; \d+ \d+ (?:EXTENSION - |COMMENT - EXTENSION )([^\s]+)(?:\s|$)/);
    if (match && !plan.some(e => e.required && e.name === match[1])) throw new Error('TOC contiene extensión ajena al plan aprobado.');
  }
}
