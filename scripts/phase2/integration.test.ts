import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import type { Pool, PoolClient } from 'pg';
import { localPool, requireRunner, verifyDatabase } from '../phase1/guard';
import { existingStructure } from '../phase1/evidence';
import { changePermission, requirePermission, transaction, type Actor, type SnipersPermission } from '../../src/lib/snipers/permissions';
import * as ops from '../../src/lib/snipers/operations';
import * as queries from '../../src/lib/snipers/queries';
import { createSnipersGateway } from '../../src/lib/snipers/gateway';
import { addDays } from '../../src/lib/snipers/contracts';
import { previewKey } from '../../src/lib/snipers/preview';
import { SnipersError } from '../../src/lib/snipers/errors';

const code = (expected: string) => (e: unknown) => e instanceof SnipersError && e.code === expected;
const now = () => new Date(Date.now() - 1000).toISOString();
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const hashFile = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

type Hook = (sql: string, args: unknown[] | undefined, query: () => Promise<any>, pid: number, client: PoolClient) => Promise<any>;
function instrument(pool: Pool, hook: Hook): Pool {
  return new Proxy(pool, { get(object, property) {
    if (property === 'connect') return async () => {
      const client = await object.connect();
      const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      return new Proxy(client, { get(c, k) {
        if (k === 'query') return (sql: string, args?: unknown[]) => hook(sql, args, () => c.query(sql, args), pid, c);
        const v = Reflect.get(c, k); return typeof v === 'function' ? v.bind(c) : v;
      } });
    };
    const v = Reflect.get(object, property); return typeof v === 'function' ? v.bind(object) : v;
  } });
}

function gate(pool: Pool, matches: (sql: string) => boolean, after = true) {
  let release!: () => void; let entered!: (pid: number) => void; let once = true;
  const waiting = new Promise<void>(r => { release = r; });
  const reached = new Promise<number>(r => { entered = r; });
  const wrapped = instrument(pool, async (sql, _args, query, pid) => {
    if (once && matches(sql)) {
      once = false;
      if (after) { const result = await query(); entered(pid); await waiting; return result; }
      entered(pid); await waiting;
    }
    return query();
  });
  return { pool: wrapped, reached, release };
}

async function waitLock(pool: Pool, pid: number) {
  for (let i = 0; i < 200; i++) {
    if ((await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await delay(10);
  }
  assert.fail('No se observó el bloqueo esperado.');
}

test('Fase 2: servicios operativos sobre PostgreSQL local aislado', { timeout: 180000 }, async t => {
  assert.equal(process.env.SNIPERS_PHASE2_LOCAL, '1', 'Usar el lanzador con respaldo previo.');
  assert.equal(process.env.SNIPERS_ENABLED, 'false');
  const profile = requireRunner(); verifyDatabase(profile);
  const beforeSchema = existingStructure(profile).sha256;
  const protectedFiles = ['.env', '.env.snipers.local', 'prisma/schema.prisma', 'prisma/snipers-review/phase1.sql', 'scripts/phase1/local-artifacts/constraints.sql'];
  const beforeFiles = Object.fromEntries(protectedFiles.map(f => [f, hashFile(f)]));
  const pool = localPool(); const key = previewKey(process.env.NEXTAUTH_SECRET);
  const admin: Actor = { userId: JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json', 'utf8')).userId,
    activeSessionId: null, singleSession: false };
  const errors: string[] = [];
  const observed = instrument(pool, async (_sql, _args, query) => {
    try { return await query(); } catch (e) { errors.push((e as { code?: string }).code ?? 'application'); throw e; }
  });
  const plans = (await pool.query('SELECT id FROM "SnipersPlan" ORDER BY code')).rows.map(r => r.id as string);

  async function user(role = 'STUDENT'): Promise<Actor> {
    const actor = { userId: randomUUID(), activeSessionId: randomUUID(), singleSession: true };
    await pool.query(`INSERT INTO "User" (id,email,role,"activeSessionId","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
      [actor.userId, `phase2-test-${actor.userId}@local.invalid`, role, actor.activeSessionId]);
    return actor;
  }
  async function staff(permission: SnipersPermission, role = 'STUDENT') {
    const actor = await user(role); await changePermission(pool, admin, actor.userId, permission, true); return actor;
  }
  async function fixture() {
    const student = await user();
    const created = await ops.createMembership(observed, admin, { operationId: randomUUID(), userId: student.userId, planId: plans[0] });
    return { student, membershipId: created.result.membershipId };
  }
  async function version(id: string): Promise<number> { return (await pool.query('SELECT version FROM "SnipersMembership" WHERE id=$1', [id])).rows[0].version; }
  async function payment(membershipId: string, extra: Record<string, unknown> = {}, actor = admin) {
    const command = { operationId: randomUUID(), membershipId, expectedVersion: await version(membershipId), periods: 1,
      receivedCents: 3000, method: 'TRANSFER', reference: randomUUID(), paidAt: now(), ...extra };
    const preview = await ops.previewPayment(observed, actor, command, key);
    const receipt = await ops.confirmPayment(observed, actor, { command, preview }, key);
    return { command, preview, receipt };
  }
  async function courtesy(membershipId: string, extra: Record<string, unknown> = {}) {
    const command = { operationId: randomUUID(), membershipId, expectedVersion: await version(membershipId), planId: plans[0],
      startsAt: day(120), endsAt: day(130), reason: 'Cortesía sintética', dateReason: 'Fecha explícita sintética', ...extra };
    const preview = await ops.previewCourtesy(observed, admin, command, key);
    const receipt = await ops.confirmCourtesy(observed, admin, { command, preview }, key);
    return { command, preview, receipt };
  }
  async function status(membershipId: string, value: string, actor = admin) {
    return ops.changeMembershipStatus(observed, actor, { operationId: randomUUID(), membershipId,
      expectedVersion: await version(membershipId), status: value, reason: 'Cambio sintético' });
  }
  async function annul(membershipId: string, paymentId: string) {
    return ops.voidPayment(observed, admin, { operationId: randomUUID(), membershipId,
      expectedVersion: await version(membershipId), paymentId, reason: 'Anulación sintética' });
  }

  async function expiringCoverage() {
    const f = await fixture();
    const endsAt = (await pool.query(`SELECT clock_timestamp() + interval '3 seconds' AS end`)).rows[0].end as Date;
    await courtesy(f.membershipId, { startsAt: day(-1), endsAt: endsAt.toISOString() });
    assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, true);
    return { ...f, endsAt };
  }
  async function waitExpired(endsAt: Date) {
    for (let i = 0; i < 600; i++) {
      if ((await pool.query('SELECT clock_timestamp()>=$1::timestamptz AS expired', [endsAt])).rows[0].expired) return;
      await delay(10);
    }
    assert.fail('La cobertura no llegó a vencer dentro del límite de la prueba.');
  }
  async function academicAt(actor: Actor, instant: Date) {
    // Static-boundary fixtures intercept only the SQL clock response in this test process.
    // The production service has no clock argument, environment override or client-controlled instant.
    let clockReads = 0;
    const fixed = instrument(observed, async (sql, _args, query) => {
      if (sql === 'SELECT clock_timestamp() AS "effectiveAt"') {
        clockReads++;
        return { rowCount: 1, rows: [{ effectiveAt: instant }] };
      }
      return query();
    });
    const decision = await queries.getAcademicAccess(fixed, actor);
    assert.equal(clockReads, 1);
    return decision;
  }

  try {
    await t.test('NextAuth real: JWT, callbacks, adaptador server-side y permisos de Fase 1', async () => {
      // Create fixtures outside the child; the real authentication path only reads them.
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      const result = spawnSync(process.execPath, ['scripts/phase2/nextauth-adapter.fixture.cjs', manager.userId, manager.activeSessionId!, f.membershipId], {
        env: { ...process.env, SNIPERS_ENABLED: 'true', TSX_DISABLE_CACHE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 30000,
      });
      assert.equal(result.status, 0, result.stderr.replaceAll(process.env.NEXTAUTH_SECRET!, '[omitted]'));
      const line = result.stdout.trim().split(/\r?\n/).findLast(value => value.startsWith('{'));
      assert.ok(line);
      assert.deepEqual(JSON.parse(line), { validWithoutExpires: true, phase1PermissionAccepted: true, commercialFacadeAccepted: true, denied: 4 });
      assert.equal(process.env.SNIPERS_ENABLED, 'false');
    });

    await t.test('vencimiento durante espera real de bloqueo no concede acceso', async () => {
      const f = await expiringCoverage(); const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM "SnipersMembership" WHERE id=$1 FOR UPDATE', [f.membershipId]);
      let entered!: (pid: number) => void; const reached = new Promise<number>(r => { entered = r; });
      const waiting = instrument(observed, async (sql, _args, query, pid) => {
        if (sql.includes('FROM "SnipersMembership"') && sql.endsWith('FOR SHARE')) entered(pid);
        return query();
      });
      const access = queries.getAcademicAccess(waiting, f.student);
      try {
        await waitLock(pool, await reached);
        assert.ok((await pool.query('SELECT clock_timestamp()<$1::timestamptz AS before', [f.endsAt])).rows[0].before);
        await waitExpired(f.endsAt);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      const decision = await access;
      assert.equal(decision.allowed, false); assert.equal(decision.reason, 'NO_COVERAGE');
    });

    await t.test('vencimiento durante reintento 40001 real renueva el instante de autorización', async () => {
      const f = await expiringCoverage(); let first = true; let serializationFailures = 0;
      let entered!: () => void; let release!: () => void;
      const reached = new Promise<void>(r => { entered = r; }); const resume = new Promise<void>(r => { release = r; });
      const retrying = instrument(observed, async (sql, _args, query, _pid, client) => {
        if (first && sql.includes('SELECT "activeSessionId"') && sql.endsWith('FOR SHARE')) {
          first = false;
          // Establish the actual SERIALIZABLE snapshot before changing this same row elsewhere.
          await client.query('SELECT id FROM "User" WHERE id=$1', [f.student.userId]);
          entered(); await resume;
        }
        try { return await query(); }
        catch (error) { if ((error as { code?: string }).code === '40001') serializationFailures++; throw error; }
      });
      const access = queries.getAcademicAccess(retrying, f.student);
      await reached;
      try {
        assert.ok((await pool.query('SELECT clock_timestamp()<$1::timestamptz AS before', [f.endsAt])).rows[0].before);
        await pool.query('UPDATE "User" SET name=$2 WHERE id=$1', [f.student.userId, 'Fixture de reintento temporal']);
        await waitExpired(f.endsAt);
      } finally { release(); }
      const decision = await access;
      assert.equal(serializationFailures, 1);
      assert.equal(decision.allowed, false); assert.equal(decision.reason, 'NO_COVERAGE');
    });

    await t.test('recuperación idempotente tras revocar permiso deniega sin consultar el recibo', async () => {
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      const original = await payment(f.membershipId, {}, manager);
      const storedPayment = (await pool.query('SELECT * FROM "SnipersPayment" WHERE id=$1', [original.receipt.result.paymentId])).rows[0];
      const storedReceipt = (await pool.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1', [original.command.operationId])).rows[0];
      await changePermission(observed, admin, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', false);
      let commercialReads = 0;
      const tracked = instrument(observed, async (sql, _args, query) => {
        if (/FROM "Snipers(?:AuditEvent|Payment|Membership|CoveragePeriod)"/.test(sql)) commercialReads++;
        return query();
      });
      await assert.rejects(ops.confirmPayment(tracked, manager, { command: original.command, preview: original.preview }, key), error => {
        assert.ok(code('FORBIDDEN')(error));
        assert.equal((error as Error).message, 'Permiso de Snipers requerido.');
        assert.ok(!JSON.stringify(error).includes(original.receipt.result.paymentId!));
        return true;
      });
      assert.equal(commercialReads, 0);
      assert.deepEqual((await pool.query('SELECT * FROM "SnipersPayment" WHERE id=$1', [storedPayment.id])).rows[0], storedPayment);
      assert.deepEqual((await pool.query('SELECT * FROM "SnipersAuditEvent" WHERE id=$1', [storedReceipt.id])).rows[0], storedReceipt);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 1);
    });

    await t.test('altas, consulta paginada y recuperación del alta sin duplicados', async () => {
      const student = await user(); const command = { operationId: randomUUID(), userId: student.userId, planId: plans[0] };
      const results = await Promise.all([ops.createMembership(observed, admin, command), ops.createMembership(observed, admin, command)]);
      assert.deepEqual(results[0].result, results[1].result); assert.equal(results.filter(r => r.replayed).length, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersMembership" WHERE "userId"=$1', [student.userId])).rows[0].n, 1);
      const found = await queries.searchMembers(observed, admin, { email: `phase2-test-${student.userId}`, limit: 1 });
      assert.equal(found.length, 1); assert.equal(found[0].membershipId, results[0].result.membershipId);
      assert.equal((await queries.getAcademicAccess(observed, student)).allowed, false);
      await assert.rejects(ops.createMembership(observed, admin, { ...command, operationId: randomUUID() }), code('INVALID_STATE'));
    });

    await t.test('renovaciones 30/60/90, descuento mínimo, cero por período y snapshots', async () => {
      for (const periods of [1, 2, 3]) {
        const f = await fixture();
        const registered = await payment(f.membershipId, { periods, receivedCents: 1, exceptionReason: 'Descuento sintético',
          startsAt: '2027-01-31T12:00:00.000Z', dateReason: 'Inicio explícito' });
        const rows = (await pool.query('SELECT * FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1 ORDER BY "periodNumber"', [registered.receipt.result.paymentId])).rows;
        assert.equal(rows.length, periods); assert.equal(rows.reduce((sum, r) => sum + r.allocatedCents, 0), 1);
        assert.deepEqual(rows.map(r => r.allocatedCents), [1, ...Array(periods - 1).fill(0)]);
        assert.ok(rows.every(r => r.origin === 'PAID' && r.requiredPaymentStatus === 'REGISTERED'));
        assert.equal(rows.at(-1)!.endsAt.getTime() - rows[0].startsAt.getTime(), periods * 30 * 86400000);
        const summary = await queries.getCommercialMembership(observed, admin, f.membershipId);
        assert.equal(summary.expiresAt, registered.preview.terms.endsAt);
      }
      const f = await fixture();
      const p = await payment(f.membershipId, { receivedCents: 4000, exceptionReason: 'Importe superior' });
      const snapshot = (await pool.query('SELECT * FROM "SnipersPayment" WHERE id=$1', [p.receipt.result.paymentId])).rows[0];
      await ops.changeRenewalPlan(observed, admin, { operationId: randomUUID(), membershipId: f.membershipId,
        expectedVersion: await version(f.membershipId), planId: plans[1], reason: 'Próxima renovación' });
      assert.deepEqual((await pool.query('SELECT * FROM "SnipersPayment" WHERE id=$1', [snapshot.id])).rows[0], snapshot);
      const next = await payment(f.membershipId, { receivedCents: 4000 });
      assert.equal(next.preview.terms.planId, plans[1]); assert.equal(next.preview.terms.startsAt, p.preview.terms.endsAt);
    });

    await t.test('previsualizaciones manipuladas, importes inválidos y pago futuro', async () => {
      const f = await fixture();
      const base = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      for (const extra of [{ receivedCents: 1 }, { receivedCents: 0 }, { receivedCents: 1.5 }, { periods: 4 },
        { paidAt: day(1) }, { startsAt: day(-60) }]) await assert.rejects(ops.previewPayment(observed, admin, { ...base, ...extra }, key), code('VALIDATION'));
      const preview = await ops.previewPayment(observed, admin, base, key);
      await assert.rejects(ops.confirmPayment(observed, admin, { command: base, preview: { ...preview, terms: { ...preview.terms, startsAt: day(-60) } } }, key), code('VALIDATION'));
      await assert.rejects(ops.confirmPayment(observed, admin, { command: { ...base, receivedCents: 1, exceptionReason: 'Intento' }, preview }, key), code('VALIDATION'));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 0);
    });

    await t.test('fechas futuras, huecos, retroactividad y confirmación posterior conservan fechas', async () => {
      const f = await fixture();
      const future = await courtesy(f.membershipId, { startsAt: day(60), endsAt: day(70) });
      const p = await payment(f.membershipId);
      assert.equal(p.preview.terms.startsAt, future.preview.terms.endsAt);
      assert.equal((await academicAt(f.student, new Date(day(40)))).allowed, false);
      const retroStart = day(-40);
      const fill = await payment(f.membershipId, { startsAt: retroStart, dateReason: 'Reconstrucción histórica' });
      assert.equal(fill.preview.terms.startsAt, retroStart);
      assert.equal((await academicAt(f.student, new Date(day(-20)))).allowed, true);
      await assert.rejects(payment(f.membershipId, { startsAt: day(50), dateReason: 'Superposición' }), code('OVERLAP'));
      const fresh = await fixture();
      const command = { operationId: randomUUID(), membershipId: fresh.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      const preview = await ops.previewPayment(observed, admin, command, key);
      const receipt = await ops.confirmPayment(observed, admin, { command, preview }, key);
      const row = (await pool.query('SELECT "startsAt","endsAt" FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1', [receipt.result.paymentId])).rows[0];
      assert.equal(row.startsAt.toISOString(), preview.terms.startsAt); assert.equal(row.endsAt.toISOString(), preview.terms.endsAt);
      assert.equal((await academicAt(fresh.student, row.startsAt)).allowed, true);
      assert.equal((await academicAt(fresh.student, row.endsAt)).allowed, false);
    });

    await t.test('idempotencia tras anular, conflicto de clave y firma rotada', async () => {
      const f = await fixture(); const paid = await payment(f.membershipId);
      await annul(f.membershipId, paid.receipt.result.paymentId!);
      const repeated = await ops.confirmPayment(observed, admin, { command: paid.command, preview: paid.preview }, previewKey('rotated-test-secret'.repeat(3)));
      assert.equal(repeated.replayed, true); assert.deepEqual(repeated.result, paid.receipt.result);
      assert.equal((await pool.query('SELECT status FROM "SnipersPayment" WHERE id=$1', [repeated.result.paymentId])).rows[0].status, 'VOID');
      await assert.rejects(ops.confirmPayment(observed, admin, { command: { ...paid.command, receivedCents: 1, exceptionReason: 'Otro intento' }, preview: paid.preview }, key), code('IDEMPOTENCY_CONFLICT'));
      const count = await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE id=$1', [paid.command.operationId]); assert.equal(count.rows[0].n, 1);
    });

    await t.test('cortesía sin pago, reemplazo, revocación y conservación del historial', async () => {
      const f = await fixture(); const first = await courtesy(f.membershipId);
      const second = await courtesy(f.membershipId, { startsAt: first.preview.terms.startsAt, endsAt: addDays(first.preview.terms.endsAt, 5), replacesCoverageId: first.receipt.result.coverageIds![0] });
      assert.equal((await pool.query('SELECT status FROM "SnipersCoveragePeriod" WHERE id=$1', [first.receipt.result.coverageIds![0]])).rows[0].status, 'VOID');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 0);
      await ops.voidCourtesy(observed, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: await version(f.membershipId), coverageId: second.receipt.result.coverageIds![0], reason: 'Revocación' });
      assert.equal((await queries.getCommercialMembership(observed, admin, f.membershipId)).expiresAt, null);
      const history = await queries.getCommercialHistory(observed, admin, { membershipId: f.membershipId });
      assert.equal(history.coverages.length, 2); assert.ok(history.coverages.every(r => r.status === 'VOID'));
    });

    await t.test('gestor suspende, registra sin reactivar, da de baja y reabre sin restaurar', async () => {
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      await status(f.membershipId, 'SUSPENDED', manager);
      const p = await payment(f.membershipId, {}, manager);
      assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, false);
      assert.equal((await queries.getCommercialMembership(observed, manager, f.membershipId)).status, 'SUSPENDED');
      await status(f.membershipId, 'CLOSED', manager);
      await assert.rejects(payment(f.membershipId, {}, manager), code('INVALID_STATE'));
      await annul(f.membershipId, p.receipt.result.paymentId!); await status(f.membershipId, 'ACTIVE', manager);
      assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, false);
      assert.equal((await pool.query('SELECT status FROM "SnipersPayment" WHERE id=$1', [p.receipt.result.paymentId])).rows[0].status, 'VOID');
      await assert.rejects(ops.changeMembershipStatus(observed, manager, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: await version(f.membershipId), status: 'CLOSED', reason: ' ' }), code('VALIDATION'));
      const events = (await queries.getCommercialHistory(observed, manager, { membershipId: f.membershipId })).events;
      assert.ok(events.some(r => r.action === 'MEMBERSHIP_REACTIVATED'));
    });

    await t.test('permisos propios, acceso de gestión, editor separado y módulo cerrado', async () => {
      const editor = await staff('SNIPERS_CONTENT_EDITOR'); const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const globalAdmin = await user('ADMIN');
      const f = await fixture();
      for (const actor of [editor, manager, admin]) assert.equal((await queries.getAcademicAccess(observed, actor)).via, 'MANAGEMENT');
      assert.equal((await queries.getAcademicAccess(observed, globalAdmin)).allowed, false);
      for (const actor of [editor, globalAdmin]) {
        await assert.rejects(queries.getCommercialMembership(observed, actor, f.membershipId), code('FORBIDDEN'));
        await assert.rejects(status(f.membershipId, 'SUSPENDED', actor), code('FORBIDDEN'));
      }
      await assert.rejects(transaction(observed, tx => requirePermission(tx, manager, 'SNIPERS_CONTENT_EDITOR', true)), code('FORBIDDEN'));
      let sessions = 0;
      const unavailable = instrument(pool, async () => { throw new Error('Must not query'); });
      const session = async () => { sessions++; return { user: { id: editor.userId, activeSessionId: editor.activeSessionId }, expires: day(1) }; };
      const disabled = createSnipersGateway(unavailable, session, () => ({ enabled: 'false', singleSession: 'true', secret: process.env.NEXTAUTH_SECRET }));
      for (const call of [() => disabled.getAcademicAccess(), () => disabled.getCommercialMembership(f.membershipId), () => disabled.createMembership({}), () => disabled.confirmPayment({})]) await assert.rejects(call, code('DISABLED'));
      assert.equal(sessions, 0);
      const missing = createSnipersGateway(unavailable, session, () => ({ enabled: 'true', singleSession: 'true', secret: undefined }));
      await assert.rejects(missing.getAcademicAccess(), code('CONFIGURATION')); assert.equal(sessions, 0);
      const gateway = createSnipersGateway(observed, session, () => ({ enabled: 'true', singleSession: 'true', secret: process.env.NEXTAUTH_SECRET }));
      assert.equal((await gateway.getAcademicAccess()).via, 'MANAGEMENT');
      await assert.rejects(gateway.getCommercialMembership(f.membershipId), code('FORBIDDEN'));
      await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [editor.userId, randomUUID()]);
      assert.equal((await gateway.getAcademicAccess()).allowed, false);
      assert.equal((await queries.getAcademicAccess(unavailable, f.student)).allowed, false);
    });

    await t.test('comprobantes: normalización, referencias ausentes, anulaciones y cadena de reemplazos', async () => {
      const f = await fixture(); const other = await fixture(); const ref = randomUUID();
      const p = await payment(f.membershipId, { method: ' transfer ', reference: ` ${ref.toLowerCase()} ` });
      await assert.rejects(payment(other.membershipId, { method: 'TRANSFER', reference: ref.toUpperCase() }), code('DUPLICATE_REFERENCE'));
      await payment(other.membershipId, { method: 'OTHER_METHOD', reference: ref });
      await annul(f.membershipId, p.receipt.result.paymentId!);
      await assert.rejects(payment(f.membershipId, { reference: ref }), code('INVALID_STATE'));
      const replacement = await payment(f.membershipId, { reference: ref, replacesPaymentId: p.receipt.result.paymentId });
      await annul(f.membershipId, replacement.receipt.result.paymentId!);
      await assert.rejects(payment(f.membershipId, { reference: ref, replacesPaymentId: p.receipt.result.paymentId }), code('INVALID_STATE'));
      await payment(f.membershipId, { reference: ref, replacesPaymentId: replacement.receipt.result.paymentId });
      for (const reference of [null, '', ' ', null]) await payment(f.membershipId, { method: 'CASH', reference });
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1 AND reference IS NULL AND status='REGISTERED'`, [f.membershipId])).rows[0].n, 4);
    });

    await t.test('atomicidad: fallos en pago, períodos y auditoría revierten toda la operación', async () => {
      for (const failOn of ['INSERT INTO "SnipersPayment"', 'INSERT INTO "SnipersCoveragePeriod"', 'INSERT INTO "SnipersAuditEvent"']) {
        const f = await fixture(); const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 3,
          receivedCents: 9000, method: 'CASH', paidAt: now() };
        const preview = await ops.previewPayment(observed, admin, command, key); let periods = 0;
        const failing = instrument(observed, async (sql, _args, query) => {
          if (sql.includes(failOn) && (failOn !== 'INSERT INTO "SnipersCoveragePeriod"' || ++periods === 2)) throw new Error('synthetic-write-failure');
          return query();
        });
        await assert.rejects(ops.confirmPayment(failing, admin, { command, preview }, key), /synthetic-write-failure/);
        for (const table of ['SnipersPayment', 'SnipersCoveragePeriod']) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "membershipId"=$1`, [f.membershipId])).rows[0].n, 0);
        assert.equal(await version(f.membershipId), 1);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rows[0].n, 0);
      }
      const f = await fixture(); const p = await payment(f.membershipId);
      const failing = instrument(observed, async (sql, _args, query) => { if (sql.includes('INSERT INTO "SnipersAuditEvent"')) throw new Error('synthetic-audit'); return query(); });
      await assert.rejects(ops.voidPayment(failing, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 2, paymentId: p.receipt.result.paymentId, reason: 'Rollback' }), /synthetic-audit/);
      assert.equal((await pool.query('SELECT status FROM "SnipersPayment" WHERE id=$1', [p.receipt.result.paymentId])).rows[0].status, 'REGISTERED');
      assert.equal((await pool.query('SELECT status FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1', [p.receipt.result.paymentId])).rows[0].status, 'VALID');
    });

    await t.test('23505 ajeno a un resultado confirmado nunca se interpreta como éxito', async () => {
      const f = await fixture();
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      const preview = await ops.previewPayment(observed, admin, command, key);
      const failing = instrument(observed, async (sql, _args, query) => {
        if (sql.startsWith('INSERT INTO "SnipersPayment"')) throw Object.assign(new Error('synthetic-unique'), { code: '23505' });
        return query();
      });
      await assert.rejects(ops.confirmPayment(failing, admin, { command, preview }, key), code('CONCURRENT'));
      assert.equal(await version(f.membershipId), 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rows[0].n, 0);
    });

    await t.test('concurrencia: doble confirmación y dos renovaciones distintas', async () => {
      const f = await fixture();
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      const preview = await ops.previewPayment(observed, admin, command, key);
      const results = await Promise.all([ops.confirmPayment(observed, admin, { command, preview }, key), ops.confirmPayment(observed, admin, { command, preview }, key)]);
      assert.deepEqual(results[0].result, results[1].result); assert.equal(results.filter(r => r.replayed).length, 1);
      const fresh = await fixture();
      const a = { ...command, membershipId: fresh.membershipId, operationId: randomUUID() }; const b = { ...a, operationId: randomUUID() };
      const pa = await ops.previewPayment(observed, admin, a, key); const pb = await ops.previewPayment(observed, admin, b, key);
      const outcomes = await Promise.allSettled([ops.confirmPayment(observed, admin, { command: a, preview: pa }, key), ops.confirmPayment(observed, admin, { command: b, preview: pb }, key)]);
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = outcomes.find(r => r.status === 'rejected') as PromiseRejectedResult; assert.ok(code('STALE')(rejected.reason));
    });

    await t.test('concurrencia SSI real: dos alumnos confirman el mismo comprobante ausente', async () => {
      const f1 = await fixture(); const f2 = await fixture(); const reference = randomUUID();
      const make = (membershipId: string) => ({ operationId: randomUUID(), membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'TRANSFER', reference, paidAt: now() });
      const c1 = make(f1.membershipId); const c2 = make(f2.membershipId);
      const p1 = await ops.previewPayment(observed, admin, c1, key); const p2 = await ops.previewPayment(observed, admin, c2, key);
      const a = gate(observed, s => s.includes('nullif(upper(btrim(reference))') && s.includes('SELECT id,status'));
      const b = gate(observed, s => s.includes('nullif(upper(btrim(reference))') && s.includes('SELECT id,status'));
      const first = ops.confirmPayment(a.pool, admin, { command: c1, preview: p1 }, key).then(value => ({ value }), error => ({ error }));
      const second = ops.confirmPayment(b.pool, admin, { command: c2, preview: p2 }, key).then(value => ({ value }), error => ({ error }));
      await Promise.all([a.reached, b.reached]); a.release(); b.release();
      const outcomes = await Promise.all([first, second]);
      assert.equal(outcomes.filter(r => 'value' in r).length, 1);
      assert.ok(outcomes.some(r => 'error' in r && code('DUPLICATE_REFERENCE')(r.error)));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1 AND status=\'REGISTERED\'', [reference])).rows[0].n, 1);
    });

    await t.test('planes: inactivo asignado renueva, nuevas asignaciones se rechazan y catálogo obsoleto no confirma', async () => {
      const f = await fixture(); const other = await fixture();
      await ops.changeRenewalPlan(observed, admin, { operationId: randomUUID(), membershipId: other.membershipId, expectedVersion: 1, planId: plans[1], reason: 'Preparación' });
      const original = (await pool.query('SELECT name,"priceCents","durationDays",active,version FROM "SnipersPlan" WHERE id=$1', [plans[0]])).rows[0];
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      const preview = await ops.previewPayment(observed, admin, command, key);
      try {
        await pool.query('UPDATE "SnipersPlan" SET active=false,version=version+1 WHERE id=$1', [plans[0]]);
        await assert.rejects(ops.confirmPayment(observed, admin, { command, preview }, key), code('STALE'));
        const p = await payment(f.membershipId);
        assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, true);
        const newcomer = await user();
        await assert.rejects(ops.createMembership(observed, admin, { operationId: randomUUID(), userId: newcomer.userId, planId: plans[0] }), code('INVALID_STATE'));
        await assert.rejects(ops.changeRenewalPlan(observed, admin, { operationId: randomUUID(), membershipId: other.membershipId, expectedVersion: 2, planId: plans[0], reason: 'Nueva asignación' }), code('INVALID_STATE'));
        await assert.rejects(courtesy(other.membershipId), code('INVALID_STATE'));
        const frozen = (await pool.query('SELECT "planName","unitPriceCents","unitDurationDays" FROM "SnipersPayment" WHERE id=$1', [p.receipt.result.paymentId])).rows[0];
        await pool.query('UPDATE "SnipersPlan" SET "priceCents"=2147483647,name=\'Nombre sintético modificado\',version=version+1 WHERE id=$1', [plans[0]]);
        await assert.rejects(ops.previewPayment(observed, admin, { ...command, operationId: randomUUID(), expectedVersion: 2, periods: 3 }, key), code('VALIDATION'));
        assert.deepEqual((await pool.query('SELECT "planName","unitPriceCents","unitDurationDays" FROM "SnipersPayment" WHERE id=$1', [p.receipt.result.paymentId])).rows[0], frozen);
      } finally {
        await pool.query('UPDATE "SnipersPlan" SET name=$2,"priceCents"=$3,"durationDays"=$4,active=$5,version=$6 WHERE id=$1',
          [plans[0], original.name, original.priceCents, original.durationDays, original.active, original.version]);
      }
      for (const [index, price] of [[0, 3000], [1, 4000], [2, 5000]]) {
        const member = await fixture();
        if (index) await ops.changeRenewalPlan(observed, admin, { operationId: randomUUID(), membershipId: member.membershipId, expectedVersion: 1, planId: plans[index], reason: 'Nivel comercial' });
        await payment(member.membershipId, { receivedCents: price });
        assert.equal((await queries.getAcademicAccess(observed, member.student)).via, 'MEMBERSHIP');
      }
    });

    await t.test('anular deja un hueco aunque expiresAt y coberturas futuras sigan vigentes', async () => {
      const f = await fixture(); const p1 = await payment(f.membershipId); const p2 = await payment(f.membershipId);
      await annul(f.membershipId, p1.receipt.result.paymentId!);
      const summary = await queries.getCommercialMembership(observed, admin, f.membershipId);
      assert.equal(summary.expiresAt, p2.preview.terms.endsAt); assert.equal(summary.currentCoverage, null);
      assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, false);
      assert.equal((await academicAt(f.student, new Date(p2.preview.terms.startsAt))).allowed, true);
    });

    await t.test('recuperación requiere mismo actor e intención; comandos sin cambio también son idempotentes', async () => {
      const f = await fixture(); const p = await payment(f.membershipId); const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER');
      await assert.rejects(ops.confirmPayment(observed, manager, { command: p.command, preview: p.preview }, key), code('IDEMPOTENCY_CONFLICT'));
      await assert.rejects(ops.changeMembershipStatus(observed, admin, { operationId: p.command.operationId, membershipId: f.membershipId, expectedVersion: 2, status: 'SUSPENDED', reason: 'Clave de otro comando' }), code('IDEMPOTENCY_CONFLICT'));
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 2, status: 'ACTIVE', reason: 'Sin cambio' };
      const first = await ops.changeMembershipStatus(observed, admin, command); const second = await ops.changeMembershipStatus(observed, admin, command);
      assert.equal(first.result.changed, false); assert.equal(first.result.version, 2); assert.equal(second.replayed, true);
      assert.equal(await version(f.membershipId), 2);
    });

    await t.test('rollback de reemplazo de cortesía y de cambio administrativo ante fallo de auditoría', async () => {
      const f = await fixture(); const original = await courtesy(f.membershipId);
      const command = { ...original.command, operationId: randomUUID(), expectedVersion: 2,
        replacesCoverageId: original.receipt.result.coverageIds![0], reason: 'Reemplazo que falla' };
      const preview = await ops.previewCourtesy(observed, admin, command, key);
      const failing = instrument(observed, async (sql, _args, query) => { if (sql.includes('INSERT INTO "SnipersAuditEvent"')) throw new Error('synthetic-audit'); return query(); });
      await assert.rejects(ops.confirmCourtesy(failing, admin, { command, preview }, key), /synthetic-audit/);
      assert.equal((await pool.query('SELECT status FROM "SnipersCoveragePeriod" WHERE id=$1', [original.receipt.result.coverageIds![0]])).rows[0].status, 'VALID');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [f.membershipId])).rows[0].n, 1);
      await assert.rejects(ops.changeMembershipStatus(failing, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 2, status: 'CLOSED', reason: 'Rollback' }), /synthetic-audit/);
      assert.equal((await queries.getCommercialMembership(observed, admin, f.membershipId)).status, 'ACTIVE');
      assert.equal(await version(f.membershipId), 2);
    });

    await t.test('reemplazos simultáneos: una sola nueva operación y un único sucesor', async () => {
      const f = await fixture(); const paid = await payment(f.membershipId); await annul(f.membershipId, paid.receipt.result.paymentId!);
      const a = { ...paid.command, operationId: randomUUID(), expectedVersion: await version(f.membershipId), replacesPaymentId: paid.receipt.result.paymentId };
      const b = { ...a, operationId: randomUUID() };
      const pa = await ops.previewPayment(observed, admin, a, key); const pb = await ops.previewPayment(observed, admin, b, key);
      const g = gate(observed, s => s.startsWith('SELECT id,"userId",status') && s.endsWith('FOR UPDATE'));
      const first = ops.confirmPayment(g.pool, admin, { command: a, preview: pa }, key);
      await g.reached;
      let attempted!: (pid: number) => void; const reached = new Promise<number>(r => { attempted = r; });
      const waiting = instrument(observed, async (sql, _args, query, pid) => { if (sql.startsWith('SELECT id,"userId",status') && sql.endsWith('FOR UPDATE')) attempted(pid); return query(); });
      const second = ops.confirmPayment(waiting, admin, { command: b, preview: pb }, key).then(value => ({ value }), error => ({ error }));
      try { await waitLock(pool, await reached); } finally { g.release(); }
      await first; const rejected = await second; assert.ok('error' in rejected && code('STALE')(rejected.error));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE payload->>\'replacesPaymentId\'=$1', [paid.receipt.result.paymentId])).rows[0].n, 1);
    });

    await t.test('anulación todavía no confirmada no permite reutilización anticipada del comprobante', async () => {
      const f = await fixture(); const other = await fixture(); const ref = randomUUID(); const paid = await payment(f.membershipId, { reference: ref });
      const g = gate(observed, s => s.includes('INSERT INTO "SnipersAuditEvent"'));
      const annulling = ops.voidPayment(g.pool, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 2,
        paymentId: paid.receipt.result.paymentId, reason: 'Anulación pendiente' });
      await g.reached;
      try { await assert.rejects(payment(other.membershipId, { reference: ref }), code('DUPLICATE_REFERENCE')); }
      finally { g.release(); }
      await annulling;
      await assert.rejects(payment(other.membershipId, { reference: ref, replacesPaymentId: paid.receipt.result.paymentId }), code('INVALID_STATE'));
      await payment(f.membershipId, { reference: ref, replacesPaymentId: paid.receipt.result.paymentId });
    });

    await t.test('revocación: operación primero bloquea revocación; revocación primero deniega', async () => {
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      const g = gate(observed, s => s.includes('FROM "UserPermission"') && s.endsWith('FOR SHARE'));
      const changing = ops.changeMembershipStatus(g.pool, manager, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, status: 'SUSPENDED', reason: 'Carrera' });
      await g.reached;
      let revokePid = 0;
      const revokingPool = instrument(observed, async (sql, _args, query, pid) => { if (sql.startsWith('UPDATE "UserPermission"')) revokePid = pid; return query(); });
      const revoking = changePermission(revokingPool, admin, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', false);
      for (let i = 0; i < 200 && !revokePid; i++) await delay(10);
      try { await waitLock(pool, revokePid); } finally { g.release(); }
      await changing; await revoking;
      await assert.rejects(status(f.membershipId, 'ACTIVE', manager), code('FORBIDDEN'));
    });

    await t.test('revocación con instantánea antigua: serialización y revalidación sin efectos', async () => {
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      const g = gate(observed, s => s.includes('FROM "UserPermission"') && s.endsWith('FOR SHARE'), false);
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, status: 'SUSPENDED', reason: 'Carrera' };
      const pending = ops.changeMembershipStatus(g.pool, manager, command).then(value => ({ value }), error => ({ error }));
      await g.reached; await changePermission(observed, admin, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', false); g.release();
      const result = await pending; assert.ok('error' in result && code('FORBIDDEN')(result.error));
      assert.equal(await version(f.membershipId), 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersAuditEvent" WHERE id=$1', [command.operationId])).rows[0].n, 0);
    });

    await t.test('sesión concurrente: actualización espera al comando y sesión anterior se rechaza', async () => {
      const manager = await staff('SNIPERS_MEMBERSHIP_MANAGER'); const f = await fixture();
      const g = gate(observed, s => s.includes('FROM "UserPermission"') && s.endsWith('FOR SHARE'));
      const changing = ops.changeMembershipStatus(g.pool, manager, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, status: 'SUSPENDED', reason: 'Carrera sesión' });
      await g.reached;
      const tx = await pool.connect(); const pid = (await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const updating = tx.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [manager.userId, randomUUID()]);
      try { await waitLock(pool, pid); } finally { g.release(); }
      await changing; await updating; tx.release();
      await assert.rejects(status(f.membershipId, 'ACTIVE', manager), code('SESSION'));
    });

    await t.test('anulación y renovación concurrentes respetan membresía → pago → cobertura', async () => {
      const f = await fixture(); const paid = await payment(f.membershipId); const expectedVersion = await version(f.membershipId);
      const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
      const preview = await ops.previewPayment(observed, admin, command, key);
      const g = gate(observed, s => s.startsWith('SELECT id,status FROM "SnipersPayment"') && s.endsWith('FOR UPDATE'));
      const annulling = ops.voidPayment(g.pool, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, paymentId: paid.receipt.result.paymentId, reason: 'Carrera anulación' });
      await g.reached;
      let attempted!: (pid: number) => void; const reached = new Promise<number>(r => { attempted = r; });
      const waiting = instrument(observed, async (sql, _args, query, pid) => { if (sql.startsWith('SELECT id,"userId",status') && sql.endsWith('FOR UPDATE')) attempted(pid); return query(); });
      const next = ops.confirmPayment(waiting, admin, { command, preview }, key).then(value => ({ value }), error => ({ error }));
      try { await waitLock(pool, await reached); } finally { g.release(); }
      await annulling;
      const result = await next; assert.ok('error' in result && code('STALE')(result.error));
      assert.equal((await queries.getAcademicAccess(observed, f.student)).allowed, false);
      assert.equal((await pool.query('SELECT status FROM "SnipersCoveragePeriod" WHERE "paymentId"=$1', [paid.receipt.result.paymentId])).rows[0].status, 'VOID');
    });

    await t.test('renovación primero: anulación, cambio de plan y cortesía esperan y exigen revisión', async () => {
      for (const operation of ['VOID', 'PLAN', 'COURTESY']) {
        const f = await fixture(); const paid = await payment(f.membershipId); const expectedVersion = 2;
        const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
        const preview = await ops.previewPayment(observed, admin, command, key);
        const courtesyCommand = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, planId: plans[0],
          startsAt: day(120), endsAt: day(125), reason: 'Carrera', dateReason: 'Fecha explícita' };
        const courtesyPreview = operation === 'COURTESY' ? await ops.previewCourtesy(observed, admin, courtesyCommand, key) : null;
        const g = gate(observed, s => s.startsWith('SELECT id,"userId",status') && s.endsWith('FOR UPDATE'));
        const renewing = ops.confirmPayment(g.pool, admin, { command, preview }, key); await g.reached;
        let attempted!: (pid: number) => void; const reached = new Promise<number>(r => { attempted = r; });
        const waiting = instrument(observed, async (sql, _args, query, pid) => { if (sql.startsWith('SELECT id,"userId",status') && sql.endsWith('FOR UPDATE')) attempted(pid); return query(); });
        const promise = operation === 'VOID'
          ? ops.voidPayment(waiting, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, paymentId: paid.receipt.result.paymentId, reason: 'Carrera' })
          : operation === 'PLAN'
            ? ops.changeRenewalPlan(waiting, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion, planId: plans[1], reason: 'Carrera' })
            : ops.confirmCourtesy(waiting, admin, { command: courtesyCommand, preview: courtesyPreview }, key);
        const second = promise.then(value => ({ value }), error => ({ error }));
        try { await waitLock(pool, await reached); } finally { g.release(); }
        await renewing; const result = await second;
        assert.ok('error' in result && code('STALE')(result.error));
        assert.equal((await pool.query('SELECT status FROM "SnipersPayment" WHERE id=$1', [paid.receipt.result.paymentId])).rows[0].status, 'REGISTERED');
      }
    });

    await t.test('cortesía y cambio de próxima renovación primero invalidan la previsualización de pago', async () => {
      for (const operation of ['COURTESY', 'PLAN']) {
        const f = await fixture();
        const command = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, periods: 1, receivedCents: 3000, method: 'CASH', paidAt: now() };
        const preview = await ops.previewPayment(observed, admin, command, key);
        const cc = { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, planId: plans[0], startsAt: day(100), endsAt: day(110), reason: 'Carrera', dateReason: 'Fecha explícita' };
        const cp = operation === 'COURTESY' ? await ops.previewCourtesy(observed, admin, cc, key) : null;
        const g = gate(observed, s => s.startsWith('SELECT id,"userId",status') && s.endsWith('FOR UPDATE'));
        const first = operation === 'COURTESY' ? ops.confirmCourtesy(g.pool, admin, { command: cc, preview: cp }, key)
          : ops.changeRenewalPlan(g.pool, admin, { operationId: randomUUID(), membershipId: f.membershipId, expectedVersion: 1, planId: plans[1], reason: 'Carrera' });
        await g.reached;
        let attempted!: (pid: number) => void; const reached = new Promise<number>(r => { attempted = r; });
        const waiting = instrument(observed, async (sql, _args, query, pid) => { if (sql.startsWith('SELECT id,"userId",status') && sql.endsWith('FOR UPDATE')) attempted(pid); return query(); });
        const second = ops.confirmPayment(waiting, admin, { command, preview }, key).then(value => ({ value }), error => ({ error }));
        try { await waitLock(pool, await reached); } finally { g.release(); }
        await first; const result = await second; assert.ok('error' in result && code('STALE')(result.error));
      }
    });

    await t.test('integridad final, aislamiento y ausencia de deadlocks estructurales', async () => {
      assert.ok(!errors.includes('40P01'), `Deadlocks detectados: ${errors.filter(e => e === '40P01').length}`);
      assert.ok(errors.includes('40001'), 'Debe haberse ejercitado SSI real.');
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM (SELECT upper(btrim(method)),upper(btrim(reference))
        FROM "SnipersPayment" WHERE status='REGISTERED' AND nullif(btrim(reference),'') IS NOT NULL
        GROUP BY 1,2 HAVING count(*)>1) duplicates`)).rows[0].n, 0);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "SnipersPayment" p WHERE p.status='REGISTERED' AND
        (p.periods<>(SELECT count(*) FROM "SnipersCoveragePeriod" c WHERE c."paymentId"=p.id AND c.status='VALID') OR
         p."receivedCents"<>(SELECT sum(c."allocatedCents") FROM "SnipersCoveragePeriod" c WHERE c."paymentId"=p.id AND c.status='VALID'))`)).rows[0].n, 0);
      verifyDatabase(profile); assert.equal(existingStructure(profile).sha256, beforeSchema);
      assert.deepEqual(Object.fromEntries(protectedFiles.map(f => [f, hashFile(f)])), beforeFiles);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "User" WHERE email NOT LIKE \'%@local.invalid\'')).rows[0].n, 0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "UserPermission" WHERE permission=\'SNIPERS_ADMIN\' AND "revokedAt" IS NULL')).rows[0].n, 1);
      fs.writeFileSync('.local/snipers/phase2-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(),
        database: 'snipers_dev', host: '127.0.0.1', port: 55432, user: 'snipers_local', schemaSha256: beforeSchema,
        protectedFiles: beforeFiles, serializationFailuresObserved: errors.filter(e => e === '40001').length,
        deadlocksObserved: errors.filter(e => e === '40P01').length, allUsersSynthetic: true }, null, 2));
    });
  } finally { await pool.end(); }
});
