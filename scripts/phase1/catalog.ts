import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from '../../src/lib/snipers/permissions';

export const INITIAL_PLANS = [
  { code: 'SNIPERS_LEVEL_1', name: 'Snipers Nivel 1', priceCents: 3000, durationDays: 30, sortOrder: 1 },
  { code: 'SNIPERS_LEVEL_2', name: 'Snipers Nivel 2', priceCents: 4000, durationDays: 30, sortOrder: 2 },
  { code: 'SNIPERS_LEVEL_3', name: 'Snipers Nivel 3', priceCents: 5000, durationDays: 30, sortOrder: 3 },
] as const;

export function validateExistingPlans(rows: { code: string; name: string; priceCents: number; durationDays: number; version: number }[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = row.code.trim().toUpperCase();
    if (seen.has(normalized) || row.code !== normalized || !/^[A-Z][A-Z0-9_]+$/.test(row.code)
      || !row.name.trim() || !Number.isSafeInteger(row.priceCents) || row.priceCents <= 0
      || !Number.isSafeInteger(row.durationDays) || row.durationDays <= 0 || !Number.isSafeInteger(row.version) || row.version <= 0) {
      throw new Error('Conflicto de catálogo: código ambiguo/duplicado o datos inválidos. No se corrigió ningún registro.');
    }
    seen.add(normalized);
  }
}

export async function initializeCatalog(pool: Pool): Promise<string[]> {
  return transaction(pool, async tx => {
    // Serializes this explicit operation with other initializers; row locks protect existing commercial edits.
    await tx.query('SELECT pg_advisory_xact_lock(1397639505)');
    const existing = await tx.query('SELECT code,name,"priceCents","durationDays",version FROM "SnipersPlan" FOR UPDATE');
    validateExistingPlans(existing.rows);
    const created: string[] = [];
    for (const plan of INITIAL_PLANS) {
      if (existing.rows.some(row => row.code === plan.code)) continue;
      await tx.query(`INSERT INTO "SnipersPlan" (id,code,name,"priceCents","durationDays","sortOrder","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`, [randomUUID(), plan.code, plan.name, plan.priceCents, plan.durationDays, plan.sortOrder]);
      created.push(plan.code);
    }
    if (created.length) await tx.query(`INSERT INTO "SnipersAuditEvent" (id,action,"entityType","entityId",payload)
      VALUES ($1,'CATALOG_INITIALIZED','SnipersPlan','initial-catalog',$2::jsonb)`, [randomUUID(), JSON.stringify({ createdCodes: created })]);
    return created;
  });
}
