import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';
import { localPool, requireRunner, verifyDatabase, localSqlGuard } from './guard';
import { initializeCatalog } from './catalog';
import { bootstrapLocal } from './initialize';
import { existingStructure } from './evidence';
import { changePermission, hasPermission, type Actor, type SnipersPermission } from '../../src/lib/snipers/permissions';
import { operationalAuditSchema } from '../../src/lib/snipers/operations';
import { catalogAuditSchema } from '../../src/lib/snipers/commercial';
import { editorialAuditSchema } from '../../src/lib/snipers/content-contracts';

type Db = Pick<PoolClient, 'query'>;
const now = () => new Date();
const plusDays = (value: string, days: number) => new Date(Date.parse(value) + days * 86400000).toISOString();
async function insert(db: Db, table: string, data: Record<string, unknown>): Promise<string> {
  assert.match(table, /^[A-Za-z]+$/);
  const row = { id: randomUUID(), ...data };
  const keys = Object.keys(row);
  keys.forEach(k => assert.match(k, /^[A-Za-z]+$/));
  await db.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  return row.id as string;
}

async function user(db: Db, role = 'STUDENT'): Promise<string> {
  return insert(db, 'User', { email: `phase1-test-${randomUUID()}@local.invalid`, role, updatedAt: now() });
}
type Fixture = { userId: string; membershipId: string; planId: string; otherPlanId: string };
async function fixture(db: Db): Promise<Fixture> {
  const plans = await db.query('SELECT id FROM "SnipersPlan" ORDER BY code');
  const userId = await user(db);
  const membershipId = await insert(db, 'SnipersMembership', { userId, renewalPlanId: plans.rows[0].id, updatedAt: now() });
  return { userId, membershipId, planId: plans.rows[0].id, otherPlanId: plans.rows[1].id };
}
async function payment(db: Db, f: Fixture, extra: Record<string, unknown> = {}): Promise<string> {
  return insert(db, 'SnipersPayment', { membershipId: f.membershipId, planId: f.planId, planName: 'Snapshot prueba',
    periods: 1, unitPriceCents: 3000, unitDurationDays: 30, listTotalCents: 3000, receivedCents: 3000,
    method: 'synthetic', paidAt: now(), operatorId: f.userId, idempotencyKey: randomUUID(), ...extra });
}
async function coverage(db: Db, f: Fixture, paymentId: string | null, start: string, extra: Record<string, unknown> = {}): Promise<string> {
  return insert(db, 'SnipersCoveragePeriod', { membershipId: f.membershipId, planId: f.planId,
    startsAt: start, endsAt: plusDays(start, 30), origin: paymentId ? 'PAID' : 'COURTESY', paymentId,
    ...(paymentId ? { periodNumber: 1, durationDays: 30, allocatedCents: 3000, requiredPaymentStatus: 'REGISTERED' }
      : { courtesyReason: 'Fixture sintético', grantorId: f.userId }), ...extra });
}
let savepoint = 0;
async function rejectsSql(tx: PoolClient, body: () => Promise<unknown>, code: string): Promise<void> {
  const name = `failure_${++savepoint}`;
  await tx.query(`SAVEPOINT ${name}`);
  try { await assert.rejects(body, e => (e as { code?: string }).code === code); }
  finally { await tx.query(`ROLLBACK TO SAVEPOINT ${name}`); await tx.query(`RELEASE SAVEPOINT ${name}`); }
}
async function rollbackFixture(pool: Pool, body: (tx: PoolClient, f: Fixture) => Promise<void>) {
  const tx = await pool.connect();
  await tx.query('BEGIN');
  try { await body(tx, await fixture(tx)); }
  finally { await tx.query('ROLLBACK'); tx.release(); }
}

async function waitForLock(pool: Pool, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid]);
    if (state.rows[0]?.wait_event_type === 'Lock') return;
    await delay(20);
  }
  assert.fail('La segunda conexión no llegó a esperar un bloqueo PostgreSQL.');
}

test('Fase 1: integridad y permisos sobre PostgreSQL local real', async t => {
  const profile = requireRunner();
  verifyDatabase(profile);
  const pool = localPool();
  const credentials = JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json', 'utf8'));
  const admin: Actor = { userId: credentials.userId, activeSessionId: null, singleSession: false };
  try {
    await t.test('catálogo concurrente, idempotencia y conservación comercial', async () => {
      await Promise.all([initializeCatalog(pool), initializeCatalog(pool)]);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPlan"')).rows[0].n, 3);
      assert.deepEqual(await initializeCatalog(pool), []);
      const original = (await pool.query('SELECT * FROM "SnipersPlan" WHERE code=\'SNIPERS_LEVEL_1\'')).rows[0];
      try {
        await pool.query('UPDATE "SnipersPlan" SET name=$1,"priceCents"=4700,"durationDays"=40,active=false,version=2 WHERE id=$2', ['Cambio comercial válido', original.id]);
        await initializeCatalog(pool);
        const preserved = (await pool.query('SELECT * FROM "SnipersPlan" WHERE id=$1', [original.id])).rows[0];
        assert.equal(preserved.name, 'Cambio comercial válido'); assert.equal(preserved.priceCents, 4700);
        assert.equal(preserved.durationDays, 40); assert.equal(preserved.active, false); assert.equal(preserved.version, 2);
      } finally {
        await pool.query('UPDATE "SnipersPlan" SET name=$1,"priceCents"=$2,"durationDays"=$3,active=$4,version=$5 WHERE id=$6',
          [original.name, original.priceCents, original.durationDays, original.active, original.version, original.id]);
      }
    });

    await t.test('bootstrap local, credenciales compatibles, no redundancia ni repetición', async () => {
      assert.equal(credentials.environment, 'local'); assert.match(credentials.email, /@local\.invalid$/);
      const u = (await pool.query('SELECT * FROM "User" WHERE id=$1', [admin.userId])).rows[0];
      assert.equal(u.role, 'STUDENT'); assert.ok(u.emailVerified); assert.ok(await compare(credentials.password, u.password));
      const grants = await pool.query('SELECT permission FROM "UserPermission" WHERE "userId"=$1 AND "revokedAt" IS NULL', [admin.userId]);
      assert.deepEqual(grants.rows, [{ permission: 'SNIPERS_ADMIN' }]);
      await assert.rejects(bootstrapLocal(), /Ya existe|Bootstrap/);
    });

    await t.test('restricciones SQL: importes, excepciones, idempotencia, claves compuestas', async () => rollbackFixture(pool, async (tx, f) => {
      await rejectsSql(tx, () => payment(tx, f, { receivedCents: 0 }), '23514');
      await rejectsSql(tx, () => payment(tx, f, { receivedCents: 2999 }), '23514');
      await rejectsSql(tx, () => payment(tx, f, { periods: 4, listTotalCents: 12000 }), '23514');
      await rejectsSql(tx, () => payment(tx, f, { listTotalCents: 999 }), '23514');
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersPlan" SET "priceCents"=0 WHERE id=$1', [f.planId]), '23514');
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersPlan" SET "priceCents"=$1 WHERE id=$2', ['1.5', f.planId]), '22P02');
      const key = randomUUID(); const p = await payment(tx, f, { idempotencyKey: key, receivedCents: 1, exceptionReason: 'Descuento sintético' });
      await rejectsSql(tx, () => payment(tx, f, { idempotencyKey: key }), '23505');
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { planId: f.otherPlanId }), '23503');
      const other = await fixture(tx);
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { membershipId: other.membershipId }), '23503');
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { requiredPaymentStatus: null }), '23514');
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { durationDays: null }), '23514');
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { periodNumber: 2 }), '23514');
      await rejectsSql(tx, () => coverage(tx, f, p, '2026-01-01Z', { durationDays: 31, endsAt: plusDays('2026-01-01Z', 31) }), '23503');
    }));

    await t.test('exclusión parcial: adyacencia, cortesías, suspensión y anulación con historial', async () => rollbackFixture(pool, async (tx, f) => {
      const p = await payment(tx, f);
      const c = await coverage(tx, f, p, '2026-01-01Z');
      await rejectsSql(tx, () => coverage(tx, f, null, '2026-01-15Z'), '23P01');
      await tx.query('UPDATE "SnipersMembership" SET status=\'SUSPENDED\' WHERE id=$1', [f.membershipId]);
      await rejectsSql(tx, () => coverage(tx, f, null, '2026-01-15Z'), '23P01');
      await coverage(tx, f, null, plusDays('2026-01-01Z', 30));
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersPayment" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'Prueba\' WHERE id=$1', [p]), '23001');
      await tx.query('UPDATE "SnipersCoveragePeriod" SET status=\'VOID\',"requiredPaymentStatus"=NULL,"voidedAt"=now(),"voidReason"=\'Prueba\' WHERE id=$1', [c]);
      await tx.query('UPDATE "SnipersPayment" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'Prueba\' WHERE id=$1', [p]);
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersCoveragePeriod" SET status=\'VALID\',"requiredPaymentStatus"=\'REGISTERED\',"voidedAt"=NULL,"voidReason"=NULL WHERE id=$1', [c]), '23503');
      const courtesy = await coverage(tx, f, null, '2026-01-01Z');
      await tx.query('UPDATE "SnipersCoveragePeriod" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'Prueba\' WHERE id=$1', [courtesy]);
      await coverage(tx, f, null, '2026-01-01Z');
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersCoveragePeriod" SET status=\'VALID\',"voidedAt"=NULL,"voidReason"=NULL WHERE id=$1', [courtesy]), '23P01');
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 4);
    }));

    await t.test('30/60/90 días exactos, fin exclusivo e independencia del catálogo', async () => rollbackFixture(pool, async (tx, f) => {
      await tx.query("SET LOCAL TIME ZONE 'America/New_York'");
      const start = '2026-02-28T12:00:00Z';
      const p = await payment(tx, f, { periods: 3, listTotalCents: 9000, receivedCents: 9000 });
      for (let i = 0; i < 3; i++) await coverage(tx, f, p, plusDays(start, i * 30), { periodNumber: i + 1 });
      const intervals = await tx.query('SELECT extract(epoch FROM ("endsAt"-"startsAt"))::int AS seconds FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1', [p]);
      assert.deepEqual(intervals.rows.map(r => r.seconds), [2592000, 2592000, 2592000]);
      const end = await tx.query('SELECT max("endsAt") FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1', [p]);
      assert.equal(end.rows[0].max.toISOString(), plusDays(start, 90));
      const ends = await tx.query('SELECT "endsAt" FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1 ORDER BY "periodNumber"', [p]);
      assert.deepEqual(ends.rows.map(row => row.endsAt.toISOString()), [30, 60, 90].map(days => plusDays(start, days)));
      const boundary = await tx.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND "startsAt" <= $2 AND $2 < "endsAt"', [f.membershipId, plusDays(start, 30)]);
      assert.equal(boundary.rows[0].n, 1);
      await tx.query('UPDATE "SnipersPlan" SET "priceCents"=9999,"durationDays"=31,active=false WHERE id=$1', [f.planId]);
      await tx.query('UPDATE "SnipersMembership" SET "renewalPlanId"=$1 WHERE id=$2', [f.otherPlanId, f.membershipId]);
      const snapshot = (await tx.query('SELECT "unitPriceCents","unitDurationDays","planId" FROM "SnipersPayment" WHERE id=$1', [p])).rows[0];
      assert.equal(snapshot.unitPriceCents, 3000); assert.equal(snapshot.unitDurationDays, 30); assert.equal(snapshot.planId, f.planId);
      await rejectsSql(tx, () => tx.query('UPDATE "SnipersPayment" SET "unitPriceCents"=5000 WHERE id=$1', [p]), '23514');
      await rejectsSql(tx, () => tx.query('DELETE FROM "SnipersPayment" WHERE id=$1', [p]), '23514');
      const another = await payment(tx, f);
      await rejectsSql(tx, () => coverage(tx, f, another, '2027-02-01Z', { endsAt: '2027-03-01Z' }), '23514');
    }));

    await t.test('SQL concurrente: una sola cobertura válida puede ocupar el intervalo', async () => {
      const f = await fixture(pool);
      const a = await pool.connect(); const b = await pool.connect();
      try {
        await a.query('BEGIN'); await b.query('BEGIN');
        const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await coverage(a, f, null, '2030-01-01Z');
        const pending = coverage(b, f, null, '2030-01-01Z').then(() => 'unexpected-success', e => e.code);
        await waitForLock(pool, pid);
        await a.query('COMMIT');
        assert.equal(await pending, '23P01'); await b.query('ROLLBACK');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 1);
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });

    await t.test('SQL concurrente: anular pago no admite nueva cobertura válida', async () => {
      const f = await fixture(pool); const p = await payment(pool, f);
      const a = await pool.connect(); const b = await pool.connect();
      try {
        await a.query('BEGIN'); await b.query('BEGIN');
        const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await a.query('UPDATE "SnipersPayment" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'Fixture\' WHERE id=$1', [p]);
        const pending = coverage(b, f, p, '2031-01-01Z').then(() => 'unexpected-success', e => e.code);
        await waitForLock(pool, pid);
        await a.query('COMMIT'); assert.equal(await pending, '23503'); await b.query('ROLLBACK');
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });

    await t.test('SQL concurrente inverso: cobertura confirmada bloquea anulación del pago', async () => {
      const f = await fixture(pool); const p = await payment(pool, f);
      const a = await pool.connect(); const b = await pool.connect();
      try {
        await a.query('BEGIN'); await b.query('BEGIN');
        const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await coverage(a, f, p, '2032-01-01Z');
        const pending = b.query('UPDATE "SnipersPayment" SET status=\'VOID\',"voidedAt"=now(),"voidReason"=\'Fixture\' WHERE id=$1', [p])
          .then(() => 'unexpected-success', e => e.code);
        await waitForLock(pool, pid);
        await a.query('COMMIT'); assert.equal(await pending, '23001'); await b.query('ROLLBACK');
        assert.equal((await pool.query('SELECT status FROM "SnipersPayment" WHERE id=$1', [p])).rows[0].status, 'REGISTERED');
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });

    await t.test('contenido privado, relaciones restrictivas y preservación de estructuras originales', async () => rollbackFixture(pool, async (tx, f) => {
      const category = await insert(tx, 'SnipersCategory', { name: 'Fixture', slug: randomUUID(), updatedAt: now() });
      const lesson = await insert(tx, 'SnipersClass', { title: 'Fixture', body: '{}', classDate: now(), categoryId: category, updatedAt: now() });
      await insert(tx, 'SnipersResource', { classId: lesson, name: 'PDF', type: 'PDF', objectKey: `private/${randomUUID()}.pdf`, mimeType: 'application/pdf', sizeBytes: 10, updatedAt: now() });
      await rejectsSql(tx, () => tx.query('DELETE FROM "SnipersClass" WHERE id=$1', [lesson]), '23001');
      await rejectsSql(tx, () => tx.query('DELETE FROM "SnipersCategory" WHERE id=$1', [category]), '23001');
      await rejectsSql(tx, () => tx.query('DELETE FROM "SnipersPlan" WHERE id=$1', [f.planId]), '23001');
      await rejectsSql(tx, () => insert(tx, 'SnipersResource', { classId: lesson, name: 'PDF', type: 'PDF', objectKey: 'https://public.example/file.pdf', mimeType: 'application/pdf', sizeBytes: 10, updatedAt: now() }), '23514');
      const baseline = JSON.parse(fs.readFileSync('.local/snipers/phase1-baseline.json', 'utf8'));
      assert.equal(existingStructure(profile).sha256, baseline.sha256);
    }));

    await t.test('matriz de permisos, roles globales y revocación inmediata', async () => {
      const editor = await user(pool); const manager = await user(pool); const globalAdmin = await user(pool, 'ADMIN');
      const actor = (id: string): Actor => ({ userId: id, singleSession: false, activeSessionId: null });
      assert.equal(await hasPermission(pool, actor(globalAdmin), 'SNIPERS_ADMIN'), false);
      await assert.rejects(changePermission(pool, actor(globalAdmin), globalAdmin, 'SNIPERS_ADMIN', true), /Permiso/);
      for (const p of ['SNIPERS_CONTENT_EDITOR', 'SNIPERS_MEMBERSHIP_MANAGER', 'SNIPERS_ADMIN'] as SnipersPermission[]) assert.ok(await hasPermission(pool, admin, p));
      await changePermission(pool, admin, editor, 'SNIPERS_CONTENT_EDITOR', true);
      await changePermission(pool, admin, manager, 'SNIPERS_MEMBERSHIP_MANAGER', true);
      assert.ok(await hasPermission(pool, actor(editor), 'SNIPERS_CONTENT_EDITOR'));
      assert.equal(await hasPermission(pool, actor(editor), 'SNIPERS_MEMBERSHIP_MANAGER'), false);
      assert.ok(await hasPermission(pool, actor(manager), 'SNIPERS_MEMBERSHIP_MANAGER'));
      assert.equal(await hasPermission(pool, actor(manager), 'SNIPERS_CONTENT_EDITOR'), false);
      await assert.rejects(changePermission(pool, actor(editor), editor, 'SNIPERS_ADMIN', true), /Permiso/);
      await changePermission(pool, admin, editor, 'SNIPERS_CONTENT_EDITOR', false);
      assert.equal(await hasPermission(pool, actor(editor), 'SNIPERS_CONTENT_EDITOR'), false);
      assert.equal(await hasPermission(pool, { ...admin, singleSession: true, activeSessionId: 'expired' }, 'SNIPERS_ADMIN'), false);
      assert.equal(await hasPermission(pool, actor(randomUUID()), 'SNIPERS_ADMIN'), false);
      await assert.rejects(changePermission(pool, admin, editor, 'ADMIN' as SnipersPermission, true), /inválido/);
      assert.equal((await pool.query('SELECT role FROM "User" WHERE id=$1', [editor])).rows[0].role, 'STUDENT');
      await changePermission(pool, admin, manager, 'SNIPERS_MEMBERSHIP_MANAGER', false);
    });

    await t.test('atomicidad: un fallo de auditoría revierte la concesión; error DB deniega', async () => {
      const target = await user(pool);
      const failing = new Proxy(pool, { get(object, key) {
        if (key === 'connect') return async () => {
          const client = await object.connect();
          return new Proxy(client, { get(c, k) {
            if (k === 'query') return async (sql: string, args?: unknown[]) => {
              if (sql.includes('INSERT INTO "SnipersAuditEvent"')) throw new Error('synthetic-audit-failure');
              return c.query(sql, args);
            };
            const v = Reflect.get(c, k); return typeof v === 'function' ? v.bind(c) : v;
          } });
        };
        return Reflect.get(object, key);
      } });
      await assert.rejects(changePermission(failing, admin, target, 'SNIPERS_CONTENT_EDITOR', true), /synthetic-audit-failure/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "UserPermission" WHERE "userId"=$1', [target])).rows[0].n, 0);
      await changePermission(pool, admin, target, 'SNIPERS_CONTENT_EDITOR', true);
      const auditCount = (await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE "entityId"=$1', [target])).rows[0].n;
      await assert.rejects(changePermission(failing, admin, target, 'SNIPERS_CONTENT_EDITOR', false), /synthetic-audit-failure/);
      assert.equal((await pool.query('SELECT "revokedAt" FROM "UserPermission" WHERE "userId"=$1', [target])).rows[0].revokedAt, null);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE "entityId"=$1', [target])).rows[0].n, auditCount);
      await changePermission(pool, admin, target, 'SNIPERS_CONTENT_EDITOR', false);
      const unavailable = new Proxy(pool, { get(o, k) { if (k === 'connect') return async () => { throw new Error('offline'); }; return Reflect.get(o, k); } });
      assert.equal(await hasPermission(unavailable, admin, 'SNIPERS_ADMIN'), false);
    });

    await t.test('último administrador y revocaciones concurrentes', async () => {
      await assert.rejects(changePermission(pool, admin, admin.userId, 'SNIPERS_ADMIN', false), /último administrador/);
      const secondId = await user(pool); const second = { ...admin, userId: secondId };
      await changePermission(pool, admin, secondId, 'SNIPERS_ADMIN', true);
      try {
        const outcomes = await Promise.allSettled([
          changePermission(pool, admin, admin.userId, 'SNIPERS_ADMIN', false),
          changePermission(pool, second, secondId, 'SNIPERS_ADMIN', false),
        ]);
        assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM "UserPermission" WHERE permission=\'SNIPERS_ADMIN\' AND "revokedAt" IS NULL')).rows[0].n, 1);
      } finally {
        const survivor = (await pool.query('SELECT "userId" FROM "UserPermission" WHERE permission=\'SNIPERS_ADMIN\' AND "revokedAt" IS NULL')).rows[0].userId;
        await changePermission(pool, { ...admin, userId: survivor }, admin.userId, 'SNIPERS_ADMIN', true);
        await changePermission(pool, admin, secondId, 'SNIPERS_ADMIN', false);
      }
      const tx = await pool.connect(); await tx.query('BEGIN');
      try { await rejectsSql(tx, () => tx.query('DELETE FROM "User" WHERE id=$1', [admin.userId]), '23001'); }
      finally { await tx.query('ROLLBACK'); tx.release(); }
    });

    await t.test('auditoría inmutable y sin credenciales, tokens ni enlaces privados', async () => {
      const rows = (await pool.query('SELECT * FROM "SnipersAuditEvent"')).rows;
      assert.ok(rows.length > 0);
      const legacyAllowed: Record<string, Set<string>> = {
        LOCAL_BOOTSTRAP: new Set(['environment', 'permission']), CATALOG_INITIALIZED: new Set(['createdCodes']),
        PERMISSION_GRANTED: new Set(['permission', 'before', 'after']), PERMISSION_REVOKED: new Set(['permission', 'before', 'after']),
      };
      const operationalActions = new Set(['MEMBERSHIP_CHANGED', 'MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_REACTIVATED', 'MEMBERSHIP_CLOSED',
        'PAYMENT_REGISTERED', 'PAYMENT_VOIDED', 'COVERAGE_CHANGED', 'COVERAGE_VOIDED']);
      for (const row of rows) {
        if (['CLASS_CHANGED','CATEGORY_CHANGED','MEETING_CHANGED'].includes(row.action)) {
          assert.ok(editorialAuditSchema.safeParse(row.payload).success, 'Contrato editorial estricto');
          assert.equal(row.entityType, { CLASS_CHANGED:'SnipersClass', CATEGORY_CHANGED:'SnipersCategory', MEETING_CHANGED:'SnipersMeeting' }[row.action as 'CLASS_CHANGED'|'CATEGORY_CHANGED'|'MEETING_CHANGED']);
          assert.equal(row.entityId, row.payload.result.id);
        } else if (row.action === 'FILE_FOUNDATION_CHANGED') {
          const { fileAuditSchema } = await import('../../src/lib/snipers/file-contracts');
          const { uploadReceiptSchema } = await import('../../src/lib/snipers/upload-contracts');
          const { cleanupAuditSchema } = await import('../../src/lib/snipers/file-contracts');
          const maintenance=cleanupAuditSchema.safeParse(row.payload);
          assert.ok(fileAuditSchema.safeParse(row.payload).success || uploadReceiptSchema.safeParse(row.payload).success || maintenance.success, 'Contrato estricto de archivos v1/v2/v3');
          if(maintenance.success)assert.equal(row.actorUserId,null,'Mantenimiento de sistema');
          assert.equal(row.entityType, 'SnipersResource');
          assert.equal(row.entityId, row.payload.result.resourceId);
          assert.equal(row.id, row.payload.result.operationId);
        } else if (row.action === 'PLAN_CHANGED') {
          assert.equal(row.entityType, 'SnipersPlan');
          assert.ok(catalogAuditSchema.safeParse(row.payload).success, 'Contrato estricto del catálogo');
        } else if (operationalActions.has(row.action)) {
          assert.ok(operationalAuditSchema.safeParse(row.payload).success, `Payload no permitido para ${row.action}`);
          assert.equal(row.entityType, 'SnipersMembership'); assert.equal(row.entityId, row.payload.result.membershipId);
        } else {
          assert.ok(legacyAllowed[row.action], `Acción sin contrato de auditoría: ${row.action}`);
          for (const key of Object.keys(row.payload)) assert.ok(legacyAllowed[row.action].has(key));
        }
      }
      const serialized = JSON.stringify(rows);
      assert.ok(!serialized.includes(credentials.password));
      assert.doesNotMatch(serialized, /https?:\/\/|zoom\.us|password|access_token|refresh_token|secret/i);
      const tx = await pool.connect(); await tx.query('BEGIN');
      try {
        await rejectsSql(tx, () => tx.query('UPDATE "SnipersAuditEvent" SET payload=\'{}\' WHERE id=$1', [rows[0].id]), '23514');
        await rejectsSql(tx, () => tx.query('DELETE FROM "SnipersAuditEvent" WHERE id=$1', [rows[0].id]), '23514');
        await tx.query(localSqlGuard);
      } finally { await tx.query('ROLLBACK'); tx.release(); }
    });
  } finally { await pool.end(); }
});
