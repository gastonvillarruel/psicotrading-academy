import type { Pool } from 'pg';
import { z } from 'zod';
import { id, pageSchema, parse } from './contracts';
import { requireActor, requirePermission, transaction, type Actor } from './permissions';
import { reject } from './errors';

const iso = (date: Date | null) => date?.toISOString() ?? null;

export async function searchMembers(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(pageSchema.extend({ email: z.string().trim().min(3).max(254) }), input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const rows = await tx.query(`SELECT u.id,u.email,u.name,m.id AS "membershipId",m.status,m.version
      FROM "User" u LEFT JOIN "SnipersMembership" m ON m."userId"=u.id
      WHERE strpos(lower(u.email),lower($1))>0 ORDER BY u.email,u.id LIMIT $2 OFFSET $3`, [c.email, c.limit, c.offset]);
    return rows.rows as { id: string; email: string; name: string | null; membershipId: string | null; status: string | null; version: number | null }[];
  });
}

export async function getCommercialMembership(pool: Pool, actor: Actor, input: unknown) {
  const membershipId = parse(id, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const m = (await tx.query(`SELECT m.id,m."userId",m.status,m."expiresAt",m.version,m."renewalPlanId",
      p.name AS "renewalPlanName",p.active AS "renewalPlanActive",p.version AS "renewalPlanVersion"
      FROM "SnipersMembership" m JOIN "SnipersPlan" p ON p.id=m."renewalPlanId" WHERE m.id=$1`, [membershipId])).rows[0];
    if (!m) reject('NOT_FOUND', 'Membresía inexistente.');
    const now = new Date();
    const rows = await tx.query(`SELECT c.id,c."planId",coalesce(pay."planName",p.name) AS "planName",c."startsAt",c."endsAt",c.origin
      FROM "SnipersCoveragePeriod" c JOIN "SnipersPlan" p ON p.id=c."planId" LEFT JOIN "SnipersPayment" pay ON pay.id=c."paymentId"
      WHERE c."membershipId"=$1 AND c.status='VALID' AND c."endsAt">$2 ORDER BY c."startsAt",c.id`, [membershipId, now]);
    const coverages = rows.rows.map(r => ({ id: r.id as string, planId: r.planId as string, planName: r.planName as string,
      startsAt: iso(r.startsAt)!, endsAt: iso(r.endsAt)!, origin: r.origin as 'PAID' | 'COURTESY' }));
    return { id: m.id as string, userId: m.userId as string, status: m.status as string, version: m.version as number,
      expiresAt: iso(m.expiresAt), currentCoverage: coverages.find(r => Date.parse(r.startsAt) <= now.getTime()) ?? null,
      futureCoverages: coverages.filter(r => Date.parse(r.startsAt) > now.getTime()),
      renewalPlan: { id: m.renewalPlanId as string, name: m.renewalPlanName as string, active: m.renewalPlanActive as boolean, version: m.renewalPlanVersion as number } };
  });
}

export async function getCommercialHistory(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(pageSchema.extend({ membershipId: id }), input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    if (!(await tx.query('SELECT 1 FROM "SnipersMembership" WHERE id=$1', [c.membershipId])).rowCount) reject('NOT_FOUND', 'Membresía inexistente.');
    const params = [c.membershipId, c.limit, c.offset];
    const payments = await tx.query(`SELECT id,"planId","planName",periods,"unitPriceCents","unitDurationDays","listTotalCents","receivedCents",
      "exceptionReason",method,reference,"paidAt","operatorId",status,"voidedAt","voidReason","createdAt"
      FROM "SnipersPayment" WHERE "membershipId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT $2 OFFSET $3`, params);
    const coverages = await tx.query(`SELECT id,"planId","startsAt","endsAt",origin,status,"paymentId","periodNumber","allocatedCents",
      "courtesyReason","grantorId","voidedAt","voidReason","createdAt" FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1
      ORDER BY "startsAt" DESC,id DESC LIMIT $2 OFFSET $3`, params);
    const events = await tx.query(`SELECT id,"actorUserId",action,payload,"createdAt" FROM "SnipersAuditEvent"
      WHERE "entityType"='SnipersMembership' AND "entityId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT $2 OFFSET $3`, params);
    function dates(rows: Record<string, unknown>[]) {
      return rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
    }
    return { payments: dates(payments.rows), coverages: dates(coverages.rows), events: dates(events.rows) };
  });
}

export type AcademicAccess = { allowed: boolean; via: 'MANAGEMENT' | 'MEMBERSHIP' | null;
  reason: 'GRANTED' | 'NO_COVERAGE' | 'ADMINISTRATIVE_STATE' | 'UNAVAILABLE' };

export async function getAcademicAccess(pool: Pool, actor: Actor): Promise<AcademicAccess> {
  try {
    return await transaction(pool, async tx => {
      await requireActor(tx, actor, true);
      const permissions = await tx.query(`SELECT id FROM "UserPermission" WHERE "userId"=$1 AND "revokedAt" IS NULL
        AND permission IN ('SNIPERS_CONTENT_EDITOR','SNIPERS_MEMBERSHIP_MANAGER','SNIPERS_ADMIN') ORDER BY id FOR SHARE`, [actor.userId]);
      if (permissions.rowCount) return { allowed: true, via: 'MANAGEMENT', reason: 'GRANTED' };
      const m = (await tx.query('SELECT id,status FROM "SnipersMembership" WHERE "userId"=$1 FOR SHARE', [actor.userId])).rows[0];
      if (m && m.status !== 'ACTIVE') return { allowed: false, via: null, reason: 'ADMINISTRATIVE_STATE' };
      if (!m) return { allowed: false, via: null, reason: 'NO_COVERAGE' };
      // Actual database wall clock, after waits/locks, refreshed on every transaction attempt.
      // now()/transaction_timestamp() would retain the transaction start time.
      const now = (await tx.query<{ effectiveAt: Date }>('SELECT clock_timestamp() AS "effectiveAt"')).rows[0]?.effectiveAt;
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) reject('INTEGRITY', 'Instante de autorización inválido.');
      const row = await tx.query(`SELECT 1 FROM "SnipersCoveragePeriod" c LEFT JOIN "SnipersPayment" p ON p.id=c."paymentId"
        WHERE c."membershipId"=$1 AND c.status='VALID' AND c."startsAt"<=$2 AND c."endsAt">$2
        AND (c.origin='COURTESY' OR p.status='REGISTERED')`, [m.id, now]);
      return row.rowCount ? { allowed: true, via: 'MEMBERSHIP', reason: 'GRANTED' } : { allowed: false, via: null, reason: 'NO_COVERAGE' };
    });
  } catch { return { allowed: false, via: null, reason: 'UNAVAILABLE' }; }
}
