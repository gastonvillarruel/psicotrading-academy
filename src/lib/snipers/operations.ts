// Trusted internal core. Application callers must use the session-bound server facade.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { requirePermission, transaction, type Actor } from './permissions';
import { reject, SnipersError } from './errors';
import { addDays, cents, courtesySchema, createSchema, parse, paymentSchema, planChangeSchema, stateSchema,
  splitCents, termsSchema, voidCourtesySchema, voidPaymentSchema, type CoverageTerms, type CourtesyCommand,
  type MembershipStatus, type OperationKind, type OperationResult, type PaymentCommand, type Preview, type Receipt } from './contracts';
import { canonical, digest, signPreview, verifyPreview } from './preview';

type Membership = { id: string; userId: string; status: MembershipStatus; renewalPlanId: string; expiresAt: Date | null; version: number };
type Plan = { id: string; name: string; priceCents: number; durationDays: number; version: number; active: boolean };
type Outcome = { result: OperationResult; action: string; before: Record<string, unknown> | null;
  after: Record<string, unknown>; reason?: string; replacesPaymentId?: string; replacesCoverageId?: string };

async function membership(tx: PoolClient, id: string, expected: number, lock = true): Promise<Membership> {
  const row = (await tx.query<Membership>('SELECT id,"userId",status,"renewalPlanId","expiresAt",version FROM "SnipersMembership" WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
  if (!row) reject('NOT_FOUND', 'Membresía inexistente.');
  if (row.version !== expected) reject('STALE', 'La membresía cambió; revisá la operación.');
  if (row.version === 2147483647) reject('INTEGRITY', 'Versión de membresía fuera de rango.');
  return row;
}

async function plan(tx: PoolClient, id: string, lock: boolean): Promise<Plan> {
  const row = (await tx.query<Plan>('SELECT id,name,"priceCents","durationDays",version,active FROM "SnipersPlan" WHERE id=$1' + (lock ? ' FOR SHARE' : ''), [id])).rows[0];
  if (!row) reject('NOT_FOUND', 'Plan inexistente.');
  return row;
}

const snapshot = (m: Membership) => ({ status: m.status, renewalPlanId: m.renewalPlanId, expiresAt: m.expiresAt?.toISOString() ?? null, version: m.version });
async function bump(tx: PoolClient, m: Membership): Promise<Membership> {
  const result = await tx.query<Membership>(`UPDATE "SnipersMembership" SET version=version+1,"updatedAt"=CURRENT_TIMESTAMP,
    "expiresAt"=(SELECT max("endsAt") FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND status='VALID')
    WHERE id=$1 AND version=$2 RETURNING id,"userId",status,"renewalPlanId","expiresAt",version`, [m.id, m.version]);
  if (result.rowCount !== 1) reject('STALE', 'La membresía cambió; revisá la operación.');
  return result.rows[0];
}

const resultSchema = z.object({ operationId: z.uuid(), membershipId: z.uuid(), version: z.number().int().positive(),
  paymentId: z.uuid().optional(), coverageIds: z.array(z.uuid()).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(), changed: z.boolean().optional() }).strict();
const auditState = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(), renewalPlanId: z.uuid().optional(),
  expiresAt: z.iso.datetime({ precision: 3 }).nullable().optional(), version: z.number().int().positive().optional(),
  paymentStatus: z.enum(['REGISTERED', 'VOID']).optional(), coverageStatus: z.enum(['VALID', 'VOID']).optional(),
  terms: termsSchema.optional(), receivedCents: cents.optional(), dateReason: z.string().max(1000).nullable().optional() }).strict();
export const operationalAuditSchema = z.object({ formatVersion: z.literal(1),
  operationKind: z.enum(['CREATE', 'PAYMENT', 'COURTESY', 'PLAN', 'STATE', 'VOID_PAYMENT', 'VOID_COURTESY']), commandHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: resultSchema, before: auditState.nullable(), after: auditState,
  reason: z.string().max(1000).optional(), replacesPaymentId: z.uuid().optional(), replacesCoverageId: z.uuid().optional() }).strict();

async function readReceipt(tx: PoolClient, actor: Actor, operationId: string, kind: OperationKind, hash: string): Promise<Receipt | null> {
  const row = (await tx.query('SELECT "actorUserId",payload,"createdAt" FROM "SnipersAuditEvent" WHERE id=$1', [operationId])).rows[0];
  if (!row) return null;
  const parsed = operationalAuditSchema.safeParse(row.payload);
  if (row.actorUserId !== actor.userId || !parsed.success || parsed.data.operationKind !== kind || parsed.data.commandHash !== hash) {
    reject('IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otra operación.');
  }
  if (parsed.data.result.operationId !== operationId) reject('INTEGRITY', 'Comprobante de operación inválido.');
  return { result: parsed.data.result, replayed: true, confirmedAt: row.createdAt.toISOString() };
}

async function mutate(pool: Pool, actor: Actor, operationId: string, kind: OperationKind, intent: unknown,
  body: (tx: PoolClient) => Promise<Outcome>): Promise<Receipt> {
  const hash = digest({ kind, intent });
  try {
    return await transaction(pool, async tx => {
      await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
      const existing = await readReceipt(tx, actor, operationId, kind, hash);
      if (existing) return existing;
      const outcome = await body(tx);
      // Allowlist, not a serialization of the request, token or database entities.
      const payload = { formatVersion: 1, operationKind: kind, commandHash: hash, result: outcome.result,
        before: outcome.before, after: outcome.after, ...(outcome.reason ? { reason: outcome.reason } : {}),
        ...(outcome.replacesPaymentId ? { replacesPaymentId: outcome.replacesPaymentId } : {}),
        ...(outcome.replacesCoverageId ? { replacesCoverageId: outcome.replacesCoverageId } : {}) };
      parse(operationalAuditSchema, payload);
      const event = await tx.query(`INSERT INTO "SnipersAuditEvent" (id,"actorUserId",action,"entityType","entityId",payload)
        VALUES ($1,$2,$3,'SnipersMembership',$4,$5::jsonb) RETURNING "createdAt"`,
      [operationId, actor.userId, outcome.action, outcome.result.membershipId, JSON.stringify(payload)]);
      return { result: outcome.result, replayed: false, confirmedAt: event.rows[0].createdAt.toISOString() };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      const recovered = await transaction(pool, async tx => {
        await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
        return readReceipt(tx, actor, operationId, kind, hash);
      });
      if (recovered) return recovered;
      reject('CONCURRENT', 'Ya existe el registro; consultá su estado antes de continuar.');
    }
    if (code === '23P01') reject('OVERLAP', 'La cobertura se superpone con otra cobertura válida.');
    if (code === '40001' || code === '40P01' || code === '55P03') reject('CONCURRENT', 'Conflicto concurrente; repetí la misma operación.');
    throw error;
  }
}

export async function createMembership(pool: Pool, actor: Actor, input: unknown): Promise<Receipt> {
  const c = parse(createSchema, input);
  return mutate(pool, actor, c.operationId, 'CREATE', c, async tx => {
    if ((await tx.query('SELECT 1 FROM "SnipersMembership" WHERE "userId"=$1', [c.userId])).rowCount) reject('INVALID_STATE', 'El usuario ya tiene membresía.');
    if (!(await tx.query('SELECT 1 FROM "User" WHERE id=$1', [c.userId])).rowCount) reject('NOT_FOUND', 'Usuario inexistente.');
    const p = await plan(tx, c.planId, true);
    if (!p.active) reject('INVALID_STATE', 'El plan está inactivo.');
    const membershipId = randomUUID();
    await tx.query('INSERT INTO "SnipersMembership" (id,"userId","renewalPlanId","updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)', [membershipId, c.userId, p.id]);
    return { result: { operationId: c.operationId, membershipId, version: 1, status: 'ACTIVE', changed: true },
      action: 'MEMBERSHIP_CHANGED', before: null, after: { status: 'ACTIVE', renewalPlanId: p.id, expiresAt: null, version: 1 } };
  });
}

async function checkReference(tx: PoolClient, c: PaymentCommand, lock: boolean): Promise<void> {
  // SSI predicate read is intentional: FOR UPDATE cannot protect an absent key.
  if (c.reference !== null) {
    const rows = await tx.query(`SELECT id,status FROM "SnipersPayment"
      WHERE upper(btrim(method))=upper(btrim($1)) AND nullif(upper(btrim(reference)),'')=upper(btrim($2))`, [c.method, c.reference]);
    if (rows.rows.some(r => r.status === 'REGISTERED')) reject('DUPLICATE_REFERENCE', 'El comprobante ya tiene un pago registrado.');
    if (rows.rowCount && !c.replacesPaymentId) reject('INVALID_STATE', 'Indicá el pago anulado que se reemplaza.');
  }
  if (c.replacesPaymentId) {
    const old = (await tx.query(`SELECT id,status,"membershipId",
      upper(btrim(method))=upper(btrim($2)) AS "sameMethod",
      nullif(upper(btrim(reference)),'') IS NOT DISTINCT FROM nullif(upper(btrim($3::text)),'') AS "sameReference"
      FROM "SnipersPayment" WHERE id=$1` + (lock ? ' FOR UPDATE' : ''), [c.replacesPaymentId, c.method, c.reference])).rows[0];
    if (!old || old.status !== 'VOID' || old.membershipId !== c.membershipId || !old.sameMethod || !old.sameReference) reject('INVALID_STATE', 'Reemplazo de pago inválido.');
    const successor = await tx.query(`SELECT 1 FROM "SnipersAuditEvent" WHERE action='PAYMENT_REGISTERED' AND payload->>'replacesPaymentId'=$1`, [old.id]);
    if (successor.rowCount) reject('INVALID_STATE', 'El pago ya fue reemplazado; seleccioná el último eslabón.');
  }
}

async function checkOverlap(tx: PoolClient, membershipId: string, start: string, end: string, except: string | null): Promise<void> {
  if (Date.parse(start) >= Date.parse(end)) reject('VALIDATION', 'Intervalo de cobertura inválido.');
  const overlap = await tx.query(`SELECT 1 FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND status='VALID'
    AND "startsAt"<$3 AND "endsAt">$2 AND ($4::text IS NULL OR id<>$4)`, [membershipId, start, end, except]);
  if (overlap.rowCount) reject('OVERLAP', 'La cobertura se superpone con otra cobertura válida.');
}

async function terms(tx: PoolClient, m: Membership, c: PaymentCommand | CourtesyCommand, kind: 'PAYMENT' | 'COURTESY', anchor: string, lock: boolean): Promise<CoverageTerms> {
  if (m.status === 'CLOSED') reject('INVALID_STATE', 'Primero reabrí la membresía.');
  const p = await plan(tx, kind === 'PAYMENT' ? m.renewalPlanId : (c as CourtesyCommand).planId, lock);
  if (kind === 'COURTESY' && !p.active) reject('INVALID_STATE', 'El plan está inactivo.');
  if (c.startsAt && !c.dateReason) reject('VALIDATION', 'La fecha manual requiere motivo.');
  const courtesy = kind === 'COURTESY' ? c as CourtesyCommand : null;
  if (courtesy?.replacesCoverageId) {
    const old = (await tx.query(`SELECT origin,status FROM "SnipersCoveragePeriod" WHERE id=$1 AND "membershipId"=$2`, [courtesy.replacesCoverageId, m.id])).rows[0];
    if (!old || old.origin !== 'COURTESY' || old.status !== 'VALID' || !c.startsAt) reject('INVALID_STATE', 'Reemplazo de cortesía inválido; elegí un inicio explícito.');
  }
  const last = (await tx.query(`SELECT max("endsAt") AS end FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND status='VALID'
    AND ($2::text IS NULL OR id<>$2)`, [m.id, courtesy?.replacesCoverageId ?? null])).rows[0].end as Date | null;
  const startsAt = c.startsAt ?? new Date(Math.max(Date.parse(anchor), last?.getTime() ?? 0)).toISOString();
  let endsAt: string; let listTotalCents: number | null = null; let allocatedCents: number[] = [];
  if (kind === 'PAYMENT') {
    const paid = c as PaymentCommand;
    if (Date.parse(paid.paidAt) > Date.now()) reject('VALIDATION', 'La fecha de pago no puede ser futura.');
    listTotalCents = parse(cents, p.priceCents * paid.periods);
    if (paid.receivedCents !== listTotalCents && !paid.exceptionReason) reject('VALIDATION', 'El importe excepcional requiere motivo.');
    endsAt = addDays(startsAt, p.durationDays * paid.periods);
    allocatedCents = splitCents(paid.receivedCents, paid.periods);
    await checkReference(tx, paid, lock);
  } else { endsAt = (c as CourtesyCommand).endsAt; }
  await checkOverlap(tx, m.id, startsAt, endsAt, courtesy?.replacesCoverageId ?? null);
  return { planId: p.id, planVersion: p.version, planName: p.name, unitPriceCents: p.priceCents,
    unitDurationDays: p.durationDays, active: p.active, startsAt, endsAt, listTotalCents, allocatedCents, previewedAt: anchor };
}

export async function previewPayment(pool: Pool, actor: Actor, input: unknown, key: Buffer): Promise<Preview> {
  const c = parse(paymentSchema, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const m = await membership(tx, c.membershipId, c.expectedVersion, false);
    const value = await terms(tx, m, c, 'PAYMENT', new Date().toISOString(), false);
    return { terms: value, token: signPreview(key, actor.userId, c, value) };
  });
}

export async function previewCourtesy(pool: Pool, actor: Actor, input: unknown, key: Buffer): Promise<Preview> {
  const c = parse(courtesySchema, input);
  return transaction(pool, async tx => {
    await requirePermission(tx, actor, 'SNIPERS_MEMBERSHIP_MANAGER', true);
    const m = await membership(tx, c.membershipId, c.expectedVersion, false);
    const value = await terms(tx, m, c, 'COURTESY', new Date().toISOString(), false);
    return { terms: value, token: signPreview(key, actor.userId, c, value) };
  });
}

const previewSchema = z.object({ terms: termsSchema, token: z.string().max(8000) }).strict();
function accepted(key: Buffer, actor: Actor, command: unknown, preview: Preview): void {
  if (canonical(verifyPreview(key, actor.userId, command, preview.token)) !== canonical(preview.terms)) reject('VALIDATION', 'Las condiciones aceptadas no coinciden con la propuesta.');
}

export async function confirmPayment(pool: Pool, actor: Actor, input: unknown, key: Buffer): Promise<Receipt> {
  const { command: c, preview } = parse(z.object({ command: paymentSchema, preview: previewSchema }).strict(), input);
  return mutate(pool, actor, c.operationId, 'PAYMENT', { command: c, terms: preview.terms }, async tx => {
    accepted(key, actor, c, preview);
    const m = await membership(tx, c.membershipId, c.expectedVersion);
    const t = await terms(tx, m, c, 'PAYMENT', preview.terms.previewedAt, true);
    if (canonical(t) !== canonical(preview.terms)) reject('STALE', 'Las condiciones cambiaron; revisá la operación.');
    const paymentId = randomUUID(); const coverageIds: string[] = [];
    await tx.query(`INSERT INTO "SnipersPayment" (id,"membershipId","planId","planName",periods,"unitPriceCents","unitDurationDays",
      "listTotalCents","receivedCents","exceptionReason",method,reference,"paidAt","operatorId","idempotencyKey")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [paymentId, m.id, t.planId, t.planName, c.periods, t.unitPriceCents, t.unitDurationDays, t.listTotalCents,
      c.receivedCents, c.exceptionReason, c.method, c.reference, c.paidAt, actor.userId, c.operationId]);
    for (let i = 0; i < c.periods; i++) {
      const id = randomUUID(); coverageIds.push(id);
      await tx.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"paymentId","periodNumber",
        "durationDays","allocatedCents","requiredPaymentStatus") VALUES ($1,$2,$3,$4,$5,'PAID',$6,$7,$8,$9,'REGISTERED')`,
      [id, m.id, t.planId, addDays(t.startsAt, i * t.unitDurationDays), addDays(t.startsAt, (i + 1) * t.unitDurationDays), paymentId, i + 1, t.unitDurationDays, t.allocatedCents[i]]);
    }
    const next = await bump(tx, m);
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, paymentId, coverageIds, changed: true },
      action: 'PAYMENT_REGISTERED', before: snapshot(m), after: { ...snapshot(next), terms: t, receivedCents: c.receivedCents, dateReason: c.dateReason },
      reason: c.exceptionReason ?? c.dateReason ?? undefined, replacesPaymentId: c.replacesPaymentId ?? undefined };
  });
}

export async function confirmCourtesy(pool: Pool, actor: Actor, input: unknown, key: Buffer): Promise<Receipt> {
  const { command: c, preview } = parse(z.object({ command: courtesySchema, preview: previewSchema }).strict(), input);
  return mutate(pool, actor, c.operationId, 'COURTESY', { command: c, terms: preview.terms }, async tx => {
    accepted(key, actor, c, preview);
    const m = await membership(tx, c.membershipId, c.expectedVersion);
    const t = await terms(tx, m, c, 'COURTESY', preview.terms.previewedAt, true);
    if (canonical(t) !== canonical(preview.terms)) reject('STALE', 'Las condiciones cambiaron; revisá la operación.');
    if (c.replacesCoverageId) await tx.query(`UPDATE "SnipersCoveragePeriod" SET status='VOID',"voidedAt"=CURRENT_TIMESTAMP,"voidReason"=$2 WHERE id=$1`, [c.replacesCoverageId, c.reason]);
    const id = randomUUID();
    await tx.query(`INSERT INTO "SnipersCoveragePeriod" (id,"membershipId","planId","startsAt","endsAt",origin,"courtesyReason","grantorId")
      VALUES ($1,$2,$3,$4,$5,'COURTESY',$6,$7)`, [id, m.id, t.planId, t.startsAt, t.endsAt, c.reason, actor.userId]);
    const next = await bump(tx, m);
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, coverageIds: [id], changed: true },
      action: 'COVERAGE_CHANGED', before: snapshot(m), after: { ...snapshot(next), terms: t, dateReason: c.dateReason }, reason: c.reason,
      replacesCoverageId: c.replacesCoverageId ?? undefined };
  });
}

export async function changeRenewalPlan(pool: Pool, actor: Actor, input: unknown): Promise<Receipt> {
  const c = parse(planChangeSchema, input);
  return mutate(pool, actor, c.operationId, 'PLAN', c, async tx => {
    const m = await membership(tx, c.membershipId, c.expectedVersion); const p = await plan(tx, c.planId, true);
    const changed = p.id !== m.renewalPlanId;
    if (changed && !p.active) reject('INVALID_STATE', 'El plan está inactivo.');
    if (changed) await tx.query('UPDATE "SnipersMembership" SET "renewalPlanId"=$2 WHERE id=$1', [m.id, p.id]);
    const next = changed ? await bump(tx, m) : m;
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, changed },
      action: 'MEMBERSHIP_CHANGED', before: snapshot(m), after: snapshot(next), reason: c.reason };
  });
}

export async function changeMembershipStatus(pool: Pool, actor: Actor, input: unknown): Promise<Receipt> {
  const c = parse(stateSchema, input);
  return mutate(pool, actor, c.operationId, 'STATE', c, async tx => {
    const m = await membership(tx, c.membershipId, c.expectedVersion);
    if (m.status === 'CLOSED' && c.status === 'SUSPENDED') reject('INVALID_STATE', 'Primero reabrí la membresía.');
    const changed = m.status !== c.status;
    if (changed) await tx.query('UPDATE "SnipersMembership" SET status=$2 WHERE id=$1', [m.id, c.status]);
    const next = changed ? await bump(tx, m) : m;
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, status: next.status, changed },
      action: changed ? ({ ACTIVE: 'MEMBERSHIP_REACTIVATED', SUSPENDED: 'MEMBERSHIP_SUSPENDED', CLOSED: 'MEMBERSHIP_CLOSED' }[c.status]) : 'MEMBERSHIP_CHANGED',
      before: snapshot(m), after: snapshot(next), reason: c.reason };
  });
}

export async function voidPayment(pool: Pool, actor: Actor, input: unknown): Promise<Receipt> {
  const c = parse(voidPaymentSchema, input);
  return mutate(pool, actor, c.operationId, 'VOID_PAYMENT', c, async tx => {
    const m = await membership(tx, c.membershipId, c.expectedVersion);
    // Lock payment BEFORE coverage updates: their BEFORE trigger also locks this payment.
    const p = (await tx.query('SELECT id,status FROM "SnipersPayment" WHERE id=$1 AND "membershipId"=$2 FOR UPDATE', [c.paymentId, m.id])).rows[0];
    if (!p) reject('NOT_FOUND', 'Pago inexistente.');
    const rows = await tx.query('SELECT id FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1 ORDER BY id FOR UPDATE', [p.id]);
    const changed = p.status === 'REGISTERED';
    if (changed) {
      await tx.query(`UPDATE "SnipersCoveragePeriod" SET status='VOID',"requiredPaymentStatus"=NULL,"voidedAt"=CURRENT_TIMESTAMP,"voidReason"=$2 WHERE "paymentId"=$1 AND status='VALID'`, [p.id, c.reason]);
      await tx.query(`UPDATE "SnipersPayment" SET status='VOID',"voidedAt"=CURRENT_TIMESTAMP,"voidReason"=$2 WHERE id=$1`, [p.id, c.reason]);
    }
    const next = changed ? await bump(tx, m) : m;
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, paymentId: p.id, coverageIds: rows.rows.map(r => r.id), changed },
      action: changed ? 'PAYMENT_VOIDED' : 'MEMBERSHIP_CHANGED', before: { ...snapshot(m), paymentStatus: p.status },
      after: { ...snapshot(next), paymentStatus: 'VOID' }, reason: c.reason };
  });
}

export async function voidCourtesy(pool: Pool, actor: Actor, input: unknown): Promise<Receipt> {
  const c = parse(voidCourtesySchema, input);
  return mutate(pool, actor, c.operationId, 'VOID_COURTESY', c, async tx => {
    const m = await membership(tx, c.membershipId, c.expectedVersion);
    const row = (await tx.query('SELECT id,status,origin FROM "SnipersCoveragePeriod" WHERE id=$1 AND "membershipId"=$2 FOR UPDATE', [c.coverageId, m.id])).rows[0];
    if (!row || row.origin !== 'COURTESY') reject('NOT_FOUND', 'Cortesía inexistente.');
    const changed = row.status === 'VALID';
    if (changed) await tx.query(`UPDATE "SnipersCoveragePeriod" SET status='VOID',"voidedAt"=CURRENT_TIMESTAMP,"voidReason"=$2 WHERE id=$1`, [row.id, c.reason]);
    const next = changed ? await bump(tx, m) : m;
    return { result: { operationId: c.operationId, membershipId: m.id, version: next.version, coverageIds: [row.id], changed },
      action: changed ? 'COVERAGE_VOIDED' : 'MEMBERSHIP_CHANGED', before: { ...snapshot(m), coverageStatus: row.status },
      after: { ...snapshot(next), coverageStatus: 'VOID' }, reason: c.reason };
  });
}

export function isSnipersError(error: unknown, code: string): boolean {
  return error instanceof SnipersError && error.code === code;
}
