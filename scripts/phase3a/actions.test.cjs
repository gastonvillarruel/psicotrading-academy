/* eslint @typescript-eslint/no-require-imports: "off" */
// Only the framework request context is simulated. Actions, NextAuth JWT/callbacks and SQL are real.
require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { requireRunner, localPool, verifyDatabase } = require('../phase1/guard.ts');
const { changePermission } = require('../../src/lib/snipers/permissions.ts');
const commercial = require('../../src/lib/snipers/commercial.ts');
const { encode } = require('next-auth/jwt');

test('3A: acciones reales con NextAuth y PostgreSQL locales', { timeout: 120000 }, async t => {
  assert.equal(process.env.SNIPERS_PHASE3A_LOCAL, '1');
  assert.equal(process.env.SNIPERS_ENABLED, 'false');
  const profile = requireRunner(); verifyDatabase(profile);
  const local = localPool();
  const rootId = JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json', 'utf8')).userId;
  const originalSession = (await local.query('SELECT "activeSessionId" FROM "User" WHERE id=$1', [rootId])).rows[0].activeSessionId;
  const supervisor = { userId: rootId, activeSessionId: randomUUID(), role: 'STUDENT' };
  await local.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [rootId, supervisor.activeSessionId]);
  const rootActor = { userId: rootId, activeSessionId: null, singleSession: false };
  let cookie = ''; const load = Module._load;
  Module._load = function(request, ...args) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') return { headers: async () => new Map([['host', 'localhost:3000'], ['x-forwarded-proto', 'http']]),
      cookies: async () => ({ getAll: () => cookie ? [{ name: 'next-auth.session-token', value: cookie }] : [] }) };
    return load.call(this, request, ...args);
  };
  process.env.SNIPERS_ENABLED = 'true';
  let db; let pool;
  try {
    const actions = require('../../src/app/actions/snipers.ts');
    ({ db, pool } = require('../../src/lib/db.ts'));
    async function user(role = 'STUDENT', permission) {
      const u = { userId: randomUUID(), activeSessionId: randomUUID(), role };
      await local.query('INSERT INTO "User" (id,email,name,role,"activeSessionId","emailVerified","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [u.userId, `phase3a-actions-${u.userId}@local.invalid`, 'Alumno sintético', role, u.activeSessionId]);
      if (permission) await changePermission(local, rootActor, u.userId, permission, true);
      return u;
    }
    const manager = await user('STUDENT', 'SNIPERS_MEMBERSHIP_MANAGER');
    const editor = await user('STUDENT', 'SNIPERS_CONTENT_EDITOR');
    const student = await user(); const globalAdmin = await user('ADMIN');
    async function as(who, name, input) {
      cookie = who ? await encode({ token: { id: who.userId, activeSessionId: who.activeSessionId, role: who.role, emailVerified: new Date().toISOString() }, secret: process.env.NEXTAUTH_SECRET }) : '';
      return actions[name](input);
    }
    const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
    const deny = (r, expected = 'FORBIDDEN') => { assert.equal(r.ok, false); assert.equal(r.code, expected); };
    const plans = ok(await as(supervisor, 'getSnipersCatalog'));
    const create = { operationId: randomUUID(), userId: student.userId, planId: plans[0].id };
    const membershipId = ok(await as(manager, 'createSnipersMembership', create)).result.membershipId;
    const getVersion = async () => ok(await as(manager, 'getSnipersMember', membershipId)).version;
    const payment = { operationId: randomUUID(), membershipId, expectedVersion: 1, periods: 1, receivedCents: plans[0].priceCents,
      method: 'CASH', reference: randomUUID(), paidAt: new Date(Date.now() - 1000).toISOString() };
    const proposal = ok(await as(manager, 'previewSnipersPayment', payment));
    const courtesy = { operationId: randomUUID(), membershipId, expectedVersion: 1, planId: plans[0].id,
      endsAt: new Date(Date.now() + 90 * 86400000).toISOString(), reason: 'Cortesía sintética' };
    const cp = ok(await as(manager, 'previewSnipersCourtesy', courtesy));
    const planCommand = { planId: plans[0].id, expectedVersion: plans[0].version, name: plans[0].name, priceCents: plans[0].priceCents,
      durationDays: plans[0].durationDays, active: plans[0].active, sortOrder: plans[0].sortOrder, reason: 'Supervisión sintética' };
    const managerCalls = [
      ['listSnipersMembers', { offset: 0, limit: 20 }], ['searchSnipersUsers', { email: 'phase3a-actions-', offset: 0, limit: 20 }],
      ['getSnipersMember', membershipId], ['getSnipersMemberIdentity', membershipId], ['getSnipersHistory', { membershipId, offset: 0, limit: 20 }], ['getSnipersAssignablePlans'],
      ['createSnipersMembership', create], ['previewSnipersPayment', payment], ['confirmSnipersPayment', { command: payment, preview: proposal }],
      ['previewSnipersCourtesy', courtesy], ['confirmSnipersCourtesy', { command: courtesy, preview: cp }],
      ['changeSnipersPlan', { operationId: randomUUID(), membershipId, expectedVersion: 1, planId: plans[1].id, reason: 'Prueba' }],
      ['changeSnipersStatus', { operationId: randomUUID(), membershipId, expectedVersion: 1, status: 'SUSPENDED', reason: 'Prueba' }],
      ['voidSnipersPayment', { operationId: randomUUID(), membershipId, expectedVersion: 1, paymentId: randomUUID(), reason: 'Prueba' }],
      ['voidSnipersCourtesy', { operationId: randomUUID(), membershipId, expectedVersion: 1, coverageId: randomUUID(), reason: 'Prueba' }],
      ['reconcileSnipersOperation', { operationId: payment.operationId, membershipId }],
    ];
    const supervisorCalls = [['getSnipersCatalog'], ['getSnipersSupervisionHistory', { offset: 0, limit: 15 }], ['updateSnipersPlan', planCommand], ['getSnipersPermissions', editor.userId],
      ['setSnipersPermission', { userId: editor.userId, permission: 'SNIPERS_CONTENT_EDITOR', grant: true }]];
    await t.test('cada acción exportada tiene una entrada en la matriz', () => {
      assert.deepEqual(Object.keys(actions).sort(), [...managerCalls, ...supervisorCalls, ['getSnipersCapabilities'], ['getMySnipersMembership']].map(c => c[0]).sort());
    });
    for (const [label, actor] of [['anónimo', null], ['alumno', student], ['editor', editor], ['ADMIN global', globalAdmin]]) {
      await t.test(`matriz: ${label} no obtiene consultas ni comandos comerciales/supervisión`, async () => {
        for (const [name, input] of [...managerCalls, ...supervisorCalls]) deny(await as(actor, name, input), actor ? 'FORBIDDEN' : 'SESSION');
        if (!actor) { deny(await as(null, 'getSnipersCapabilities'), 'SESSION'); deny(await as(null, 'getMySnipersMembership'), 'SESSION'); }
      });
    }
    await t.test('gestor accede a consultas comerciales y no a supervisión', async () => {
      for (const [name, input] of managerCalls.slice(0, 6)) ok(await as(manager, name, input));
      for (const [name, input] of supervisorCalls) deny(await as(manager, name, input));
    });
    await t.test('supervisor accede a consultas y conserva rol STUDENT', async () => {
      for (const [name, input] of [...managerCalls.slice(0, 6), ...supervisorCalls.filter(c => !['updateSnipersPlan'].includes(c[0]))]) ok(await as(supervisor, name, input));
      assert.equal((await local.query('SELECT role FROM "User" WHERE id=$1', [rootId])).rows[0].role, 'STUDENT');
    });
    await t.test('consulta propia no permite elegir otra identidad y no expone datos internos', async () => {
      const own = ok(await as(student, 'getMySnipersMembership', { userId: rootId })); assert.equal(own.status, 'ACTIVE');
      assert.equal(ok(await as(globalAdmin, 'getMySnipersMembership', { userId: student.userId })), null);
      const users = ok(await as(manager, 'searchSnipersUsers', { email: student.userId, limit: 20 }));
      assert.deepEqual(Object.keys(users[0]).sort(), ['id', 'name', 'email', 'membershipId', 'status'].sort());
      assert.doesNotMatch(JSON.stringify(own), /activeSessionId|password|operatorId|commandHash|preview|reference/);
      assert.equal(ok(await as(editor, 'getSnipersCapabilities')).manager, false);
      assert.equal(ok(await as(editor, 'getSnipersCapabilities')).editor, true);
    });
    await t.test('pago completo, doble confirmación simultánea y recuperación tras respuesta perdida', async () => {
      await as(manager, 'getSnipersCapabilities');
      const results = await Promise.all([actions.confirmSnipersPayment({ command: payment, preview: proposal }), actions.confirmSnipersPayment({ command: payment, preview: proposal })]);
      const receipts = results.map(ok); assert.deepEqual(receipts[0].result, receipts[1].result); assert.equal(receipts.filter(r => r.replayed).length, 1);
      assert.equal(ok(await as(manager, 'confirmSnipersPayment', { command: payment, preview: proposal })).replayed, true);
      assert.equal((await local.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "idempotencyKey"=$1', [payment.operationId])).rows[0].n, 1);
    });
    await t.test('descuento, renovación y propuestas concurrentes no se reconcilian silenciosamente', async () => {
      const version = await getVersion(); const command = { ...payment, operationId: randomUUID(), expectedVersion: version, reference: randomUUID(), receivedCents: 1, exceptionReason: 'Descuento sintético', periods: 3 };
      const other = { ...command, operationId: randomUUID(), reference: randomUUID() };
      const preview = ok(await as(manager, 'previewSnipersPayment', command)); const second = ok(await as(manager, 'previewSnipersPayment', other));
      const result = await Promise.all([actions.confirmSnipersPayment({ command, preview }), actions.confirmSnipersPayment({ command: other, preview: second })]);
      assert.equal(result.filter(r => r.ok).length, 1); deny(result.find(r => !r.ok), 'STALE');
    });
    await t.test('plan próximo, suspensión, baja y reapertura conservan coberturas', async () => {
      ok(await as(manager, 'changeSnipersPlan', { operationId: randomUUID(), membershipId, expectedVersion: await getVersion(), planId: plans[1].id, reason: 'Cambio sintético' }));
      const count = (await local.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [membershipId])).rows[0].n;
      for (const status of ['SUSPENDED', 'ACTIVE', 'CLOSED', 'ACTIVE']) ok(await as(manager, 'changeSnipersStatus', { operationId: randomUUID(), membershipId, expectedVersion: await getVersion(), status, reason: 'Cambio sintético' }));
      assert.equal((await local.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [membershipId])).rows[0].n, count);
    });
    await t.test('cortesía completa, reemplazo y revocación sin pagos ficticios', async () => {
      const endsAt = new Date(Date.now() + 200 * 86400000).toISOString();
      const command = { ...courtesy, expectedVersion: await getVersion(), operationId: randomUUID(), endsAt };
      const p = ok(await as(manager, 'previewSnipersCourtesy', command)); const first = ok(await as(manager, 'confirmSnipersCourtesy', { command, preview: p }));
      const replacement = { ...command, operationId: randomUUID(), expectedVersion: await getVersion(), startsAt: p.terms.startsAt, dateReason: 'Fecha explícita', replacesCoverageId: first.result.coverageIds[0] };
      const next = ok(await as(manager, 'previewSnipersCourtesy', replacement)); const receipt = ok(await as(manager, 'confirmSnipersCourtesy', { command: replacement, preview: next }));
      ok(await as(manager, 'voidSnipersCourtesy', { operationId: randomUUID(), membershipId, expectedVersion: await getVersion(), coverageId: receipt.result.coverageIds[0], reason: 'Revocación sintética' }));
    });
    await t.test('anulación, recibo histórico e historial legible sin payload crudo', async () => {
      const receipt = ok(await as(manager, 'confirmSnipersPayment', { command: payment, preview: proposal }));
      ok(await as(manager, 'voidSnipersPayment', { operationId: randomUUID(), membershipId, expectedVersion: await getVersion(), paymentId: receipt.result.paymentId, reason: 'Anulación sintética' }));
      assert.deepEqual(ok(await as(manager, 'confirmSnipersPayment', { command: payment, preview: proposal })).result, receipt.result);
      const history = ok(await as(manager, 'getSnipersHistory', { membershipId, offset: 0, limit: 100 }));
      assert.ok(history.payments.some(p => p.status === 'VOID')); assert.ok(history.events.length > 0);
      assert.doesNotMatch(JSON.stringify(history), /commandHash|actorUserId|operatorId|activeSessionId/);
    });
    await t.test('reemplazo explícito mediante adaptador conserva referencia y un solo pago registrado', async () => {
      const original = ok(await as(manager, 'confirmSnipersPayment', { command: payment, preview: proposal }));
      const command = { ...payment, operationId: randomUUID(), expectedVersion: await getVersion(), receivedCents: plans[1].priceCents, replacesPaymentId: original.result.paymentId };
      const preview = ok(await as(manager, 'previewSnipersPayment', command));
      ok(await as(manager, 'confirmSnipersPayment', { command, preview }));
      assert.equal((await local.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1 AND status=\'REGISTERED\'', [payment.reference])).rows[0].n, 1);
    });
    await t.test('catálogo: versión, auditoría estricta y rollback ante fallo de auditoría', async () => {
      const edited = ok(await as(supervisor, 'updateSnipersPlan', planCommand)); assert.equal(edited.version, planCommand.expectedVersion + 1);
      deny(await as(supervisor, 'updateSnipersPlan', planCommand), 'STALE');
      const payload = (await local.query('SELECT payload FROM "SnipersAuditEvent" WHERE action=\'PLAN_CHANGED\' AND "entityId"=$1 ORDER BY "createdAt" DESC LIMIT 1', [plans[0].id])).rows[0].payload;
      assert.equal(commercial.catalogAuditSchema.safeParse(payload).success, true);
      const wrapped = new Proxy(local, { get(p, k) { if (k === 'connect') return async () => { const tx = await p.connect(); return new Proxy(tx, { get(c, name) { if (name === 'query') return (sql, args) => { if (sql.includes('INSERT INTO "SnipersAuditEvent"')) throw new Error('synthetic audit failure'); return c.query(sql, args); }; const v = c[name]; return typeof v === 'function' ? v.bind(c) : v; } }); }; const v = p[k]; return typeof v === 'function' ? v.bind(p) : v; } });
      await assert.rejects(commercial.updatePlan(wrapped, rootActor, { ...planCommand, expectedVersion: edited.version }));
      assert.equal((await local.query('SELECT version FROM "SnipersPlan" WHERE id=$1', [plans[0].id])).rows[0].version, edited.version);
    });
    await t.test('corrección: recibo conciliado después de pérdida de respuesta y revocación de permiso/sesión', async () => {
      const target = await user();
      const mid = ok(await as(manager, 'createSnipersMembership', { operationId: randomUUID(), userId: target.userId, planId: plans[0].id })).result.membershipId;
      const command = { ...payment, membershipId: mid, operationId: randomUUID(), reference: null, expectedVersion: 1 };
      const preview = ok(await as(manager, 'previewSnipersPayment', command));
      await as(manager, 'confirmSnipersPayment', { command, preview }); // Committed response deliberately unused.
      for (const mode of ['permission', 'session']) {
        let newSession;
        if (mode === 'permission') await changePermission(local, rootActor, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', false);
        else { newSession = randomUUID(); await local.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [manager.userId, newSession]); }
        deny(await as(manager, 'confirmSnipersPayment', { command, preview }), mode === 'permission' ? 'FORBIDDEN' : 'SESSION');
        deny(await as(manager, 'reconcileSnipersOperation', { operationId: command.operationId, membershipId: mid }), mode === 'permission' ? 'FORBIDDEN' : 'SESSION');
        if (mode === 'permission') await changePermission(local, rootActor, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', true);
        else manager.activeSessionId = newSession;
        assert.equal(ok(await as(manager, 'reconcileSnipersOperation', { operationId: command.operationId, membershipId: mid })).confirmed, true);
        assert.equal(ok(await as(manager, 'confirmSnipersPayment', { command, preview })).replayed, true);
        assert.equal((await local.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [mid])).rows[0].n, 1);
      }
      for (const [actor, op, member] of [[supervisor, command.operationId, mid], [manager, command.operationId, membershipId], [manager, randomUUID(), mid]]) {
        assert.deepEqual(ok(await as(actor, 'reconcileSnipersOperation', { operationId: op, membershipId: member })), { confirmed: false });
      }
    });
    await t.test('última corrección: A confirma, B recibe conflicto sin recuperar recibo, A concilia sin duplicar', async () => {
      const target = await user();
      const mid = ok(await as(manager, 'createSnipersMembership', { operationId: randomUUID(), userId: target.userId, planId: plans[0].id })).result.membershipId;
      const command = { ...payment, operationId: randomUUID(), membershipId: mid, expectedVersion: 1, reference: null };
      const preview = ok(await as(manager, 'previewSnipersPayment', command));
      ok(await as(manager, 'confirmSnipersPayment', { command, preview })); // Client loses this successful response.
      deny(await as(supervisor, 'confirmSnipersPayment', { command, preview }), 'IDEMPOTENCY_CONFLICT');
      assert.deepEqual(ok(await as(supervisor, 'reconcileSnipersOperation', { operationId: command.operationId, membershipId: mid })), { confirmed: false });
      assert.deepEqual(ok(await as(manager, 'reconcileSnipersOperation', { operationId: command.operationId, membershipId: mid })), { confirmed: true });
      assert.equal(ok(await as(manager, 'confirmSnipersPayment', { command, preview })).replayed, true);
      assert.equal((await local.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [mid])).rows[0].n, 1);
    });
    await t.test('corrección: cortesías de tres niveles conservan plan y rechazan plan inactivo', async () => {
      for (const plan of plans) {
        const target = await user(); const mid = ok(await as(manager, 'createSnipersMembership', { operationId: randomUUID(), userId: target.userId, planId: plan.id })).result.membershipId;
        const command = { ...courtesy, operationId: randomUUID(), membershipId: mid, planId: plan.id, expectedVersion: 1 };
        const preview = ok(await as(manager, 'previewSnipersCourtesy', command));
        const first = ok(await as(manager, 'confirmSnipersCourtesy', { command, preview }));
        const history = ok(await as(manager, 'getSnipersHistory', { membershipId: mid })); assert.equal(history.coverages[0].planId, plan.id);
        const replacement = { ...command, operationId: randomUUID(), expectedVersion: first.result.version, replacesCoverageId: history.coverages[0].id, startsAt: history.coverages[0].startsAt, dateReason: 'Conservar inicio' };
        const next = ok(await as(manager, 'previewSnipersCourtesy', replacement));
        ok(await as(manager, 'confirmSnipersCourtesy', { command: replacement, preview: next }));
        assert.equal(ok(await as(manager, 'getSnipersHistory', { membershipId: mid })).coverages.find(c => c.status === 'VALID').planId, plan.id);
        const fresh = ok(await as(supervisor, 'getSnipersCatalog')).find(p => p.id === plan.id);
        const edit = { ...fresh, planId: fresh.id, expectedVersion: fresh.version, reason: 'Prueba local de plan inactivo' }; delete edit.id; delete edit.code; delete edit.version;
        const updated = ok(await as(supervisor, 'updateSnipersPlan', { ...edit, active: false }));
        try { deny(await as(manager, 'previewSnipersCourtesy', { ...replacement, operationId: randomUUID(), expectedVersion: ok(await as(manager, 'getSnipersMember', mid)).version }), 'INVALID_STATE'); }
        finally { ok(await as(supervisor, 'updateSnipersPlan', { ...edit, expectedVersion: updated.version })); }
      }
    });
    await t.test('corrección: auditoría proyecta cinco campos cambiados y omite los que no cambiaron', async () => {
      const plan = ok(await as(supervisor, 'getSnipersCatalog'))[2];
      const edit = { planId: plan.id, expectedVersion: plan.version, name: plan.name + ' revisión', priceCents: plan.priceCents + 1, durationDays: plan.durationDays + 1, active: !plan.active, sortOrder: plan.sortOrder + 1, reason: randomUUID() };
      const updated = ok(await as(supervisor, 'updateSnipersPlan', edit));
      try {
        const events = ok(await as(supervisor, 'getSnipersSupervisionHistory', { limit: 100 }));
        const event = events.find(e => e.reason === edit.reason);
        assert.deepEqual(event.changes.map(c => c.field).sort(), ['active', 'durationDays', 'name', 'priceCents', 'sortOrder']);
        for (const change of event.changes) { assert.equal(change.before, plan[change.field]); assert.equal(change.after, edit[change.field]); }
        assert.ok(!('payload' in event));
      } finally { ok(await as(supervisor, 'updateSnipersPlan', { ...edit, expectedVersion: updated.version, name: plan.name, priceCents: plan.priceCents, durationDays: plan.durationDays, active: plan.active, sortOrder: plan.sortOrder })); }
      const noop = { ...edit, expectedVersion: updated.version + 1, name: plan.name, priceCents: plan.priceCents, durationDays: plan.durationDays, active: plan.active, sortOrder: plan.sortOrder, reason: randomUUID() };
      ok(await as(supervisor, 'updateSnipersPlan', noop));
      assert.deepEqual(ok(await as(supervisor, 'getSnipersSupervisionHistory', { limit: 100 })).find(e => e.reason === noop.reason).changes, []);
    });
    await t.test('revocación antes de recuperar un recibo y sesión sustituida deniegan', async () => {
      await changePermission(local, rootActor, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', false);
      deny(await as(manager, 'confirmSnipersPayment', { command: payment, preview: proposal }));
      for (const [name, input] of managerCalls.slice(0, 6)) deny(await as(manager, name, input));
      await changePermission(local, rootActor, manager.userId, 'SNIPERS_MEMBERSHIP_MANAGER', true);
      await local.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [manager.userId, randomUUID()]);
      deny(await as(manager, 'getSnipersMember', membershipId), 'SESSION');
    });
    await t.test('módulo deshabilitado deniega todas las acciones', async () => {
      process.env.SNIPERS_ENABLED = 'false';
      for (const [name, input] of [...managerCalls, ...supervisorCalls, ['getSnipersCapabilities'], ['getMySnipersMembership']]) deny(await as(supervisor, name, input), 'DISABLED');
    });
  } finally {
    process.env.SNIPERS_ENABLED = 'false'; Module._load = load;
    await local.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [rootId, originalSession]);
    if (db) await db.$disconnect(); if (pool && !pool.ended) await pool.end(); await local.end();
  }
});
