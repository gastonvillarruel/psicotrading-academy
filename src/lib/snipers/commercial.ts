// Additional read models and catalog administration for phase 3A. No coverage/payment rules here.
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { id, pageSchema, parse, reason, version, cents } from './contracts';
import { requireActor, requirePermission, transaction, type Actor } from './permissions';
import { reject } from './errors';
import { getCommercialHistory } from './queries';
import { operationalAuditSchema } from './operations';

const iso = (d: Date | null) => d?.toISOString() ?? null;
export const catalogAuditSchema = z.object({ formatVersion: z.literal(1), before: z.object({ name: z.string(), priceCents: cents,
  durationDays: version, active: z.boolean(), sortOrder: z.number().int(), version }), after: z.object({ name: z.string(),
  priceCents: cents, durationDays: version, active: z.boolean(), sortOrder: z.number().int(), version }), reason }).strict();
const planEdit = z.object({ planId: id, expectedVersion: version, name: z.string().trim().min(1).max(100), priceCents: cents,
  durationDays: version, active: z.boolean(), sortOrder: z.number().int().min(0).max(1000), reason }).strict();
const codes = ['SNIPERS_LEVEL_1', 'SNIPERS_LEVEL_2', 'SNIPERS_LEVEL_3'];

export async function getCapabilities(pool: Pool, actor: Actor) {
  return transaction(pool, async tx => {
    await requireActor(tx, actor, true);
    const p = (await tx.query<{ permission: string }>('SELECT permission FROM "UserPermission" WHERE "userId"=$1 AND "revokedAt" IS NULL ORDER BY id FOR SHARE', [actor.userId])).rows.map(r => r.permission);
    const admin = p.includes('SNIPERS_ADMIN');
    const member = (await tx.query('SELECT 1 FROM "SnipersMembership" WHERE "userId"=$1', [actor.userId])).rowCount === 1;
    return { identity: actor.userId, manager: admin || p.includes('SNIPERS_MEMBERSHIP_MANAGER'), editor: admin || p.includes('SNIPERS_CONTENT_EDITOR'), admin, member };
  });
}

export async function getMyMembership(pool: Pool, actor: Actor) {
  return transaction(pool, async tx => {
    await requireActor(tx, actor, true);
    const m = (await tx.query(`SELECT m.id,m.status,m."expiresAt",p.name AS "renewalPlanName"
      FROM "SnipersMembership" m JOIN "SnipersPlan" p ON p.id=m."renewalPlanId" WHERE m."userId"=$1`, [actor.userId])).rows[0];
    if (!m) return null;
    const now = (await tx.query('SELECT clock_timestamp() AS instant')).rows[0].instant as Date;
    const rows = (await tx.query(`SELECT c."startsAt",c."endsAt",c.origin,coalesce(pay."planName",p.name) AS "planName"
      FROM "SnipersCoveragePeriod" c JOIN "SnipersPlan" p ON p.id=c."planId" LEFT JOIN "SnipersPayment" pay ON pay.id=c."paymentId"
      WHERE c."membershipId"=$1 AND c.status='VALID' AND c."endsAt">$2 ORDER BY c."startsAt",c.id`, [m.id, now])).rows;
    const coverage = rows.map(r => ({ startsAt: iso(r.startsAt)!, endsAt: iso(r.endsAt)!, origin: r.origin as string, planName: r.planName as string }));
    return { status: m.status as string, expiresAt: iso(m.expiresAt), renewalPlanName: m.renewalPlanName as string,
      currentCoverage: coverage.find(c => Date.parse(c.startsAt) <= now.getTime()) ?? null,
      futureCoverages: coverage.filter(c => Date.parse(c.startsAt) > now.getTime()) };
  });
}

export async function listMemberships(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(pageSchema.extend({ email: z.string().trim().max(254).default(''), status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).nullable().default(null) }), input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const rows = (await tx.query(`SELECT m.id,u.name,u.email,m.status,m."expiresAt",p.name AS "renewalPlanName",
      (SELECT coalesce(pay."planName",cp.name) FROM "SnipersCoveragePeriod" c JOIN "SnipersPlan" cp ON cp.id=c."planId"
        LEFT JOIN "SnipersPayment" pay ON pay.id=c."paymentId" WHERE c."membershipId"=m.id AND c.status='VALID'
        AND c."startsAt"<=clock_timestamp() AND c."endsAt">clock_timestamp() LIMIT 1) AS "currentPlanName"
      FROM "SnipersMembership" m JOIN "User" u ON u.id=m."userId" JOIN "SnipersPlan" p ON p.id=m."renewalPlanId"
      WHERE strpos(lower(u.email),lower($1))>0 AND ($2::text IS NULL OR m.status::text=$2)
      ORDER BY u.email,m.id LIMIT $3 OFFSET $4`, [c.email, c.status, c.limit, c.offset])).rows;
    return rows.map(r => ({ id: r.id as string, name: r.name as string | null, email: r.email as string, status: r.status as string,
      expiresAt: iso(r.expiresAt), renewalPlanName: r.renewalPlanName as string, currentPlanName: r.currentPlanName as string | null }));
  });
}

export async function getMemberIdentity(pool: Pool, actor: Actor, input: unknown) {
  const membershipId = parse(id, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const r = (await tx.query<{ name: string | null; email: string }>('SELECT u.name,u.email FROM "SnipersMembership" m JOIN "User" u ON u.id=m."userId" WHERE m.id=$1', [membershipId])).rows[0];
    if (!r) reject('NOT_FOUND', 'Membresía inexistente.');
    return r;
  });
}

// Reconciliation only reads an existing receipt. A missing receipt never unlocks a new intent.
export async function reconcileOperation(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(z.object({ operationId: id, membershipId: id }).strict(), input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const row = (await tx.query(`SELECT payload FROM "SnipersAuditEvent" WHERE id=$1 AND "actorUserId"=$2
      AND "entityType"='SnipersMembership' AND "entityId"=$3`, [c.operationId, actor.userId, c.membershipId])).rows[0];
    if (!row) return { confirmed: false };
    const receipt = parse(operationalAuditSchema, row.payload);
    if (receipt.result.operationId !== c.operationId || receipt.result.membershipId !== c.membershipId) reject('INTEGRITY', 'Comprobante inválido.');
    return { confirmed: true };
  });
}

async function plans(tx: PoolClient) {
  return (await tx.query<{ id: string; code: string; name: string; priceCents: number; durationDays: number; active: boolean; sortOrder: number; version: number }>(
    'SELECT id,code,name,"priceCents","durationDays",active,"sortOrder",version FROM "SnipersPlan" WHERE code=ANY($1::text[]) ORDER BY "sortOrder",code', [codes])).rows;
}
export async function getAssignablePlans(pool: Pool, actor: Actor) {
  return transaction(pool, async tx => { await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true); return plans(tx); });
}
export async function getCatalog(pool: Pool, actor: Actor) {
  return transaction(pool, async tx => { await requirePermission(tx, actor, 'SNIPERS_ADMIN', true); return plans(tx); });
}
export async function updatePlan(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(planEdit, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_ADMIN', true);
    const row = (await tx.query('SELECT name,"priceCents","durationDays",active,"sortOrder",version,code FROM "SnipersPlan" WHERE id=$1 FOR UPDATE', [c.planId])).rows[0];
    if (!row || !codes.includes(row.code)) reject('NOT_FOUND', 'Plan inexistente.');
    if (row.version !== c.expectedVersion) reject('STALE', 'El plan cambió; revisá sus valores.');
    if (row.version === 2147483647) reject('INTEGRITY', 'Versión fuera de rango.');
    const before = { name: row.name, priceCents: row.priceCents, durationDays: row.durationDays, active: row.active, sortOrder: row.sortOrder, version: row.version };
    const after = { name: c.name, priceCents: c.priceCents, durationDays: c.durationDays, active: c.active, sortOrder: c.sortOrder, version: row.version + 1 };
    const payload = parse(catalogAuditSchema, { formatVersion: 1, before, after, reason: c.reason });
    await tx.query('UPDATE "SnipersPlan" SET name=$2,"priceCents"=$3,"durationDays"=$4,active=$5,"sortOrder"=$6,version=$7,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1',
      [c.planId, c.name, c.priceCents, c.durationDays, c.active, c.sortOrder, after.version]);
    await tx.query('INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload) VALUES ($1,$2,\'PLAN_CHANGED\',\'SnipersPlan\',$3,$4::jsonb)', [randomUUID(), actor.userId, c.planId, JSON.stringify(payload)]);
    return { version: after.version };
  });
}
export async function getPermissions(pool: Pool, actor: Actor, input: unknown) {
  const userId = parse(id, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_ADMIN', true);
    return (await tx.query<{ permission: string }>('SELECT permission FROM "UserPermission" WHERE "userId"=$1 AND "revokedAt" IS NULL ORDER BY permission', [userId])).rows.map(r => r.permission);
  });
}

export async function getSupervisionHistory(pool: Pool, actor: Actor, input: unknown) {
  const c = parse(pageSchema, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_ADMIN', true);
    const rows = (await tx.query(`SELECT e.id,e.action,e.payload,e."createdAt",coalesce(a.name,'Supervisor') AS actor,
      CASE WHEN e."entityType"='SnipersPlan' THEN p.name ELSE coalesce(u.name,u.email,'Usuario') END AS target
      FROM "SnipersAuditEvent" e LEFT JOIN "User" a ON a.id=e."actorUserId"
      LEFT JOIN "SnipersPlan" p ON e."entityType"='SnipersPlan' AND p.id=e."entityId"
      LEFT JOIN "User" u ON e."entityType"='UserPermission' AND u.id=e."entityId"
      WHERE e.action IN ('PLAN_CHANGED','PERMISSION_GRANTED','PERMISSION_REVOKED') ORDER BY e."createdAt" DESC,e.id DESC LIMIT $1 OFFSET $2`, [c.limit, c.offset])).rows;
    return rows.map(r => {
      const plan = r.action === 'PLAN_CHANGED' ? parse(catalogAuditSchema, r.payload) : null;
      return { id: r.id as string, action: r.action as string, createdAt: iso(r.createdAt)!, actor: r.actor as string, target: r.target as string,
        permission: !plan && typeof r.payload.permission === 'string' ? r.payload.permission as string : null,
        reason: plan?.reason ?? null, changes: plan ? (['name', 'priceCents', 'durationDays', 'active', 'sortOrder'] as const)
          .filter(field => plan.before[field] !== plan.after[field])
          .map(field => ({ field, before: plan.before[field], after: plan.after[field] })) : [] };
    });
  });
}

export async function getHistoryView(pool: Pool, actor: Actor, input: unknown) {
  const history = await getCommercialHistory(pool, actor, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const ids = [...new Set([...history.payments.map(p => p.operatorId), ...history.events.map(e => e.actorUserId)].filter((v): v is string => typeof v === 'string'))];
    const names = new Map((await tx.query<{ id: string; label: string }>('SELECT id,coalesce(nullif(name,\'\'),\'Gestor\') AS label FROM "User" WHERE id=ANY($1::text[])', [ids])).rows.map(r => [r.id, r.label]));
    const labels = new Map((await plans(tx)).map(p => [p.id, p.name]));
    const str = (v: unknown) => typeof v === 'string' ? v : '';
    return {
      payments: history.payments.map(p => ({ id: str(p.id), planName: str(p.planName), periods: Number(p.periods), listTotalCents: Number(p.listTotalCents),
        receivedCents: Number(p.receivedCents), exceptionReason: str(p.exceptionReason), method: str(p.method), reference: str(p.reference), paidAt: str(p.paidAt),
        operator: names.get(str(p.operatorId)) ?? 'Gestor', status: str(p.status), voidReason: str(p.voidReason) })),
      coverages: history.coverages.map(c => ({ id: str(c.id), planId: str(c.planId), origin: str(c.origin), status: str(c.status), startsAt: str(c.startsAt), endsAt: str(c.endsAt),
        reason: str(c.courtesyReason), voidReason: str(c.voidReason), planName: labels.get(str(c.planId)) ?? 'Plan histórico' })),
      events: history.events.map(e => {
        const p = e.payload as { reason?: string; before?: { renewalPlanId?: string; status?: string }; after?: { renewalPlanId?: string; status?: string } };
        return { id: str(e.id), action: str(e.action), createdAt: str(e.createdAt), actor: names.get(str(e.actorUserId)) ?? 'Gestor', reason: p.reason ?? '',
          previousPlan: p.before?.renewalPlanId ? labels.get(p.before.renewalPlanId) ?? 'Plan histórico' : '',
          nextPlan: p.after?.renewalPlanId ? labels.get(p.after.renewalPlanId) ?? 'Plan histórico' : '', previousStatus: p.before?.status ?? '', nextStatus: p.after?.status ?? '' };
      }),
    };
  });
}
